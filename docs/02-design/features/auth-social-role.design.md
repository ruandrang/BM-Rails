# Design: auth-social-role (소셜 로그인 + 역할 기반 클럽 가입)

> Plan 문서: `docs/01-plan/features/auth-social-role.plan.md`

---

## 1. 마이그레이션 설계

### 1.1 AddSocialFieldsToUsers

```ruby
# db/migrate/XXXX_add_social_fields_to_users.rb
class AddSocialFieldsToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :nickname, :string
    add_column :users, :avatar_url, :string

    # password_digest를 nullable로 변경 (소셜 전용 사용자)
    change_column_null :users, :password_digest, true

    # 기존 데이터: name → nickname 복사
    reversible do |dir|
      dir.up do
        execute "UPDATE users SET nickname = name WHERE nickname IS NULL"
      end
    end
  end
end
```

### 1.2 CreateIdentities

```ruby
# db/migrate/XXXX_create_identities.rb
class CreateIdentities < ActiveRecord::Migration[8.1]
  def change
    create_table :identities do |t|
      t.references :user, null: false, foreign_key: true
      t.string :provider, null: false
      t.string :uid, null: false
      t.string :email
      t.string :name
      t.string :avatar_url
      t.timestamps
    end

    add_index :identities, [:provider, :uid], unique: true
    add_index :identities, [:user_id, :provider], unique: true
  end
end
```

### 1.3 CreateClubMemberships

```ruby
# db/migrate/XXXX_create_club_memberships.rb
class CreateClubMemberships < ActiveRecord::Migration[8.1]
  def change
    create_table :club_memberships do |t|
      t.references :user, null: false, foreign_key: true
      t.references :club, null: false, foreign_key: true
      t.string :role, null: false, default: "member"
      t.datetime :joined_at, null: false
      t.references :invited_by, null: true, foreign_key: { to_table: :users }
      t.timestamps
    end

    add_index :club_memberships, [:user_id, :club_id], unique: true
    add_index :club_memberships, [:club_id, :role]

    # 기존 데이터: clubs.user_id → ClubMembership(owner)
    reversible do |dir|
      dir.up do
        execute <<~SQL
          INSERT INTO club_memberships (user_id, club_id, role, joined_at, created_at, updated_at)
          SELECT user_id, id, 'owner', created_at, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          FROM clubs
        SQL
      end
    end
  end
end
```

### 1.4 CreateClubInvitations

```ruby
# db/migrate/XXXX_create_club_invitations.rb
class CreateClubInvitations < ActiveRecord::Migration[8.1]
  def change
    create_table :club_invitations do |t|
      t.references :club, null: false, foreign_key: true
      t.string :code, null: false
      t.references :created_by, null: false, foreign_key: { to_table: :users }
      t.datetime :expires_at
      t.integer :max_uses
      t.integer :use_count, null: false, default: 0
      t.timestamps
    end

    add_index :club_invitations, :code, unique: true
  end
end
```

---

## 2. 모델 설계

### 2.1 User (수정)

```ruby
# app/models/user.rb
class User < ApplicationRecord
  has_secure_password validations: false  # 소셜 전용 사용자는 password 없음

  has_many :identities, dependent: :destroy
  has_many :club_memberships, dependent: :destroy
  has_many :clubs, through: :club_memberships
  # 기존 has_many :clubs, dependent: :destroy 는 has_many :owned_clubs 로 변경
  has_many :owned_clubs, class_name: "Club", foreign_key: :user_id, dependent: :nullify

  validates :email, presence: true,
                    uniqueness: { case_sensitive: false },
                    format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :nickname, presence: true
  # password 검증: password_digest가 있거나 새로 입력 시에만
  validates :password, length: { minimum: 6 }, if: :password_required?

  def display_name
    nickname.presence || name.presence || email.split("@").first
  end

  def social_only?
    password_digest.blank?
  end

  def has_provider?(provider_name)
    identities.exists?(provider: provider_name)
  end

  private

  def password_required?
    # 소셜 전용 사용자는 password 불필요
    return false if identities.any? && password_digest.blank? && !password.present?
    # 새로 비밀번호 입력하는 경우
    password.present? || password_digest.blank?
  end
end
```

### 2.2 Identity (신규)

```ruby
# app/models/identity.rb
class Identity < ApplicationRecord
  PROVIDERS = %w[kakao naver google].freeze

  belongs_to :user

  validates :provider, presence: true, inclusion: { in: PROVIDERS }
  validates :uid, presence: true, uniqueness: { scope: :provider }
  validates :user_id, uniqueness: { scope: :provider }
end
```

### 2.3 Club (수정)

```ruby
# app/models/club.rb
class Club < ApplicationRecord
  belongs_to :user  # 원래 생성자 (변경 없음)
  has_many :club_memberships, dependent: :destroy
  has_many :users, through: :club_memberships
  has_many :club_invitations, dependent: :destroy
  has_many :members, dependent: :destroy
  has_many :matches, dependent: :destroy

  def owner
    club_memberships.find_by(role: "owner")&.user
  end

  def admins
    users.merge(ClubMembership.where(role: ["owner", "admin"]))
  end

  def membership_for(user)
    club_memberships.find_by(user: user)
  end
end
```

### 2.4 ClubMembership (신규)

```ruby
# app/models/club_membership.rb
class ClubMembership < ApplicationRecord
  ROLES = %w[owner admin member].freeze

  belongs_to :user
  belongs_to :club
  belongs_to :invited_by, class_name: "User", optional: true

  validates :role, presence: true, inclusion: { in: ROLES }
  validates :user_id, uniqueness: { scope: :club_id }

  scope :owners, -> { where(role: "owner") }
  scope :admins, -> { where(role: %w[owner admin]) }
  scope :members_only, -> { where(role: "member") }

  def owner?
    role == "owner"
  end

  def admin?
    role.in?(%w[owner admin])
  end

  def member?
    role == "member"
  end
end
```

### 2.5 ClubInvitation (신규)

```ruby
# app/models/club_invitation.rb
class ClubInvitation < ApplicationRecord
  CODE_LENGTH = 6

  belongs_to :club
  belongs_to :created_by, class_name: "User"

  validates :code, presence: true, uniqueness: true
  validate :validate_expiration

  before_validation :generate_code, on: :create

  scope :active, -> {
    where("expires_at IS NULL OR expires_at > ?", Time.current)
      .where("max_uses IS NULL OR use_count < max_uses")
  }

  def expired?
    expires_at.present? && expires_at <= Time.current
  end

  def max_uses_reached?
    max_uses.present? && use_count >= max_uses
  end

  def usable?
    !expired? && !max_uses_reached?
  end

  def use!
    increment!(:use_count)
  end

  private

  def generate_code
    self.code ||= loop do
      candidate = SecureRandom.alphanumeric(CODE_LENGTH).upcase
      break candidate unless ClubInvitation.exists?(code: candidate)
    end
  end

  def validate_expiration
    if expires_at.present? && expires_at <= Time.current
      errors.add(:expires_at, "은(는) 미래 시간이어야 합니다")
    end
  end
end
```

---

## 3. OmniAuth 설정

### 3.1 Initializer

```ruby
# config/initializers/omniauth.rb
Rails.application.config.middleware.use OmniAuth::Builder do
  provider :kakao,
    ENV["KAKAO_CLIENT_ID"],
    ENV["KAKAO_CLIENT_SECRET"]

  provider :naver,
    ENV["NAVER_CLIENT_ID"],
    ENV["NAVER_CLIENT_SECRET"]

  provider :google_oauth2,
    ENV["GOOGLE_CLIENT_ID"],
    ENV["GOOGLE_CLIENT_SECRET"],
    scope: "email,profile",
    prompt: "select_account"
end

OmniAuth.config.allowed_request_methods = [:post]
OmniAuth.config.silence_get_warning = true
```

### 3.2 Auth Hash 정규화

```ruby
# app/services/omniauth_user_finder.rb
class OmniauthUserFinder
  attr_reader :auth

  def initialize(auth)
    @auth = auth
  end

  def call
    identity = Identity.find_by(provider: auth.provider, uid: auth.uid)
    return identity.user if identity

    user = find_or_create_user
    user.identities.create!(
      provider: auth.provider,
      uid: auth.uid,
      email: auth_email,
      name: auth_name,
      avatar_url: auth_avatar
    )
    user
  end

  private

  def find_or_create_user
    # 이메일이 같은 기존 사용자가 있으면 연결
    existing = User.find_by(email: auth_email) if auth_email.present?
    return existing if existing

    # 신규 사용자 생성
    User.create!(
      email: auth_email || "#{auth.provider}_#{auth.uid}@placeholder.local",
      nickname: auth_name,
      name: auth_name,
      avatar_url: auth_avatar
    )
  end

  def auth_email
    @auth_email ||= auth.info&.email&.downcase&.strip
  end

  def auth_name
    @auth_name ||= auth.info&.name.presence || auth.info&.nickname.presence || "사용자"
  end

  def auth_avatar
    @auth_avatar ||= auth.info&.image
  end
end
```

---

## 4. 컨트롤러 설계

### 4.1 OmniAuth 콜백 컨트롤러 (신규)

```ruby
# app/controllers/omniauth_callbacks_controller.rb
class OmniauthCallbacksController < ApplicationController
  skip_before_action :require_login
  skip_before_action :verify_authenticity_token, only: [:create]

  def create
    user = OmniauthUserFinder.new(auth_hash).call
    session[:user_id] = user.id

    if user.previously_new_record?
      # 최초 가입 → 프로필 설정으로
      redirect_to edit_profile_path, notice: I18n.t("auth.notices.welcome_setup")
    else
      redirect_to clubs_path, notice: I18n.t("auth.notices.logged_in")
    end
  rescue StandardError => e
    Rails.logger.error("OAuth 로그인 실패: #{e.class} - #{e.message}")
    redirect_to new_session_path, alert: I18n.t("auth.errors.oauth_failed")
  end

  def failure
    redirect_to new_session_path, alert: I18n.t("auth.errors.oauth_failed")
  end

  private

  def auth_hash
    request.env["omniauth.auth"]
  end
end
```

### 4.2 ClubAuthorization Concern (신규)

```ruby
# app/controllers/concerns/club_authorization.rb
module ClubAuthorization
  extend ActiveSupport::Concern

  private

  # ClubMembership 기반 클럽 조회 (기존 current_user.clubs.find 대체)
  def set_authorized_club
    @club = current_user.clubs.find(params[:club_id] || params[:id])
    @current_membership = @club.membership_for(current_user)
  end

  def require_club_admin
    unless @current_membership&.admin?
      redirect_to club_path(@club), alert: I18n.t("auth.club_admin_required", default: "운영자 권한이 필요합니다.")
    end
  end

  def require_club_owner
    unless @current_membership&.owner?
      redirect_to club_path(@club), alert: I18n.t("auth.club_owner_required", default: "클럽 소유자만 가능합니다.")
    end
  end
end
```

### 4.3 컨트롤러별 변경 목록

각 컨트롤러에서 `current_user.clubs.find(...)` → `set_authorized_club` + 권한 체크를 적용한다.

#### ClubsController 변경

```ruby
class ClubsController < ApplicationController
  include ClubAuthorization

  before_action :set_authorized_club, only: [:show, :edit, :update, :destroy]
  before_action :require_club_admin, only: [:edit, :update]
  before_action :require_club_owner, only: [:destroy]

  def index
    @clubs = current_user.clubs.includes(:members, :matches, :club_memberships)
                         .order(created_at: :desc)
    # ...
  end

  def create
    @club = Club.new(club_params)
    @club.user = current_user  # 원래 생성자 기록
    if @club.save
      # 생성자를 owner로 등록
      @club.club_memberships.create!(
        user: current_user, role: "owner", joined_at: Time.current
      )
      redirect_to @club, notice: "클럽이 생성되었습니다."
    else
      render :new, status: :unprocessable_entity
    end
  end

  # set_club → set_authorized_club로 변경
  # destroy에 require_club_owner 적용
end
```

#### MatchesController 변경

```ruby
class MatchesController < ApplicationController
  include ClubAuthorization

  before_action :set_authorized_club, except: [:share]
  before_action :require_club_admin, only: [:new, :create, :edit, :update, :destroy,
    :record_results, :shuffle_teams, :reset_all_scores, :finish_match,
    :move_member, :add_member, :remove_member, :add_game, :remove_game,
    :save_game_scores, :save_quarter_scores, :update_scores]
  # show, index → 클럽 멤버면 접근 가능 (set_authorized_club만)
end
```

#### MembersController 변경

```ruby
class MembersController < ApplicationController
  include ClubAuthorization

  before_action :set_authorized_club
  before_action :require_club_admin, except: [:index]
  # index → 클럽 멤버면 조회 가능
end
```

#### ScoreboardsController 변경

```ruby
class ScoreboardsController < ApplicationController
  include ClubAuthorization

  before_action :set_authorized_club, only: [:control, :display]
  before_action :require_club_admin, only: [:control]
  # display → 클럽 멤버면 접근 가능
  # index → 로그인 사용자 본인 클럽 목록
end
```

#### StatsController 변경

```ruby
class StatsController < ApplicationController
  include ClubAuthorization

  before_action :set_authorized_club
  # index → 클럽 멤버면 조회 가능 (set_authorized_club만)
end
```

### 4.4 초대 컨트롤러 (신규)

```ruby
# app/controllers/club_invitations_controller.rb
class ClubInvitationsController < ApplicationController
  include ClubAuthorization

  before_action :set_authorized_club
  before_action :require_club_admin, only: [:create, :destroy]

  # GET /clubs/:club_id/invitations (운영자: 초대 코드 관리)
  def index
    @invitations = @club.club_invitations.order(created_at: :desc)
  end

  # POST /clubs/:club_id/invitations (초대 코드 생성)
  def create
    @invitation = @club.club_invitations.new(invitation_params)
    @invitation.created_by = current_user
    if @invitation.save
      redirect_to club_invitations_path(@club), notice: "초대 코드가 생성되었습니다."
    else
      render :index, status: :unprocessable_entity
    end
  end

  # DELETE /clubs/:club_id/invitations/:id (초대 코드 삭제)
  def destroy
    @invitation = @club.club_invitations.find(params[:id])
    @invitation.destroy
    redirect_to club_invitations_path(@club), notice: "초대 코드가 삭제되었습니다."
  end

  private

  def invitation_params
    params.require(:club_invitation).permit(:expires_at, :max_uses)
  end
end
```

### 4.5 클럽 참여 컨트롤러 (신규)

```ruby
# app/controllers/club_joins_controller.rb
class ClubJoinsController < ApplicationController
  # GET /clubs/join/:code (초대 링크 접근)
  def show
    @invitation = ClubInvitation.active.find_by!(code: params[:code])
    @club = @invitation.club
  rescue ActiveRecord::RecordNotFound
    redirect_to clubs_path, alert: "유효하지 않은 초대 코드입니다."
  end

  # POST /clubs/join/:code (클럽 참여 실행)
  def create
    invitation = ClubInvitation.active.find_by!(code: params[:code])
    club = invitation.club

    if club.membership_for(current_user)
      redirect_to club_path(club), notice: "이미 참여 중인 클럽입니다."
      return
    end

    club.club_memberships.create!(
      user: current_user,
      role: "member",
      joined_at: Time.current,
      invited_by: invitation.created_by
    )
    invitation.use!
    redirect_to club_path(club), notice: "클럽에 참여했습니다!"
  rescue ActiveRecord::RecordNotFound
    redirect_to clubs_path, alert: "유효하지 않은 초대 코드입니다."
  end
end
```

### 4.6 멤버십 관리 컨트롤러 (신규)

```ruby
# app/controllers/club_memberships_controller.rb
class ClubMembershipsController < ApplicationController
  include ClubAuthorization

  before_action :set_authorized_club
  before_action :require_club_owner, only: [:update_role, :transfer_ownership]
  before_action :require_club_admin, only: [:destroy]

  # GET /clubs/:club_id/memberships (멤버 목록 + 역할 관리)
  def index
    @memberships = @club.club_memberships.includes(:user).order(:role, :joined_at)
  end

  # PATCH /clubs/:club_id/memberships/:id/role (역할 변경)
  def update_role
    membership = @club.club_memberships.find(params[:id])
    return redirect_with_alert("본인의 역할은 변경할 수 없습니다.") if membership.user == current_user
    return redirect_with_alert("owner 역할은 양도로만 변경 가능합니다.") if membership.owner?

    new_role = params[:role]
    return redirect_with_alert("유효하지 않은 역할입니다.") unless new_role.in?(%w[admin member])

    membership.update!(role: new_role)
    redirect_to club_memberships_path(@club), notice: "역할이 변경되었습니다."
  end

  # PATCH /clubs/:club_id/memberships/transfer_ownership (owner 양도)
  def transfer_ownership
    new_owner_membership = @club.club_memberships.find(params[:membership_id])
    return redirect_with_alert("본인에게는 양도할 수 없습니다.") if new_owner_membership.user == current_user

    ActiveRecord::Base.transaction do
      @current_membership.update!(role: "admin")
      new_owner_membership.update!(role: "owner")
    end
    redirect_to club_memberships_path(@club), notice: "클럽 소유권이 이전되었습니다."
  end

  # DELETE /clubs/:club_id/memberships/:id (멤버 추방 또는 본인 탈퇴)
  def destroy
    membership = @club.club_memberships.find(params[:id])

    if membership.user == current_user
      # 본인 탈퇴
      return redirect_with_alert("owner는 탈퇴할 수 없습니다. 먼저 소유권을 양도하세요.") if membership.owner?
      membership.destroy
      redirect_to clubs_path, notice: "클럽에서 탈퇴했습니다."
    else
      # 관리자가 추방
      return redirect_with_alert("owner는 추방할 수 없습니다.") if membership.owner?
      membership.destroy
      redirect_to club_memberships_path(@club), notice: "멤버가 추방되었습니다."
    end
  end

  private

  def redirect_with_alert(message)
    redirect_to club_memberships_path(@club), alert: message
  end
end
```

---

## 5. 라우트 설계

```ruby
# config/routes.rb 변경사항

Rails.application.routes.draw do
  # OmniAuth 콜백
  get "/auth/:provider/callback", to: "omniauth_callbacks#create"
  get "/auth/failure", to: "omniauth_callbacks#failure"

  # 기존 세션/회원가입 (소셜 로그인 전환 기간 동안 유지, 이후 제거)
  resource :session, only: [:new, :create, :destroy]
  resource :registration, only: [:new, :create]

  # 초대 링크로 클럽 참여
  get "clubs/join/:code", to: "club_joins#show", as: :club_join
  post "clubs/join/:code", to: "club_joins#create"

  resources :clubs do
    # 기존 라우트 유지
    # ...

    # 초대 코드 관리 (운영자용)
    resources :invitations, controller: "club_invitations", only: [:index, :create, :destroy]

    # 멤버십 관리
    resources :memberships, controller: "club_memberships", only: [:index, :destroy] do
      member do
        patch :update_role
      end
      collection do
        patch :transfer_ownership
      end
    end
  end
end
```

---

## 6. 뷰 설계

### 6.1 로그인 화면 (sessions/new.html.erb 수정)

```
┌──────────────────────────────┐
│           🏀                 │
│    Basketball Manager        │
│                              │
│  ┌──────────────────────┐    │
│  │  🟡 카카오로 시작하기   │    │
│  └──────────────────────┘    │
│  ┌──────────────────────┐    │
│  │  🟢 네이버로 시작하기   │    │
│  └──────────────────────┘    │
│  ┌──────────────────────┐    │
│  │  ⚪ Google로 시작하기   │    │
│  └──────────────────────┘    │
│                              │
│  ──── 또는 이메일로 ────     │
│  [기존 이메일 로그인 폼]     │
│  (전환 기간 동안만 표시)     │
└──────────────────────────────┘
```

- 소셜 버튼: `button_to "/auth/kakao", method: :post` (CSRF 보호)
- 각 버튼에 서비스별 브랜드 색상 적용

### 6.2 프로필 설정 화면 (신규: profiles/edit.html.erb)

최초 소셜 가입 후 닉네임/프로필 사진 수정 화면.

### 6.3 클럽 목록 (clubs/index.html.erb 수정)

- 각 클럽 카드에 역할 배지 표시 (owner: 금색, admin: 파란색, member: 회색)
- 클럽이 없을 때: "클럽 만들기" + "초대 코드로 참여" 버튼

### 6.4 멤버 관리 화면 (신규: club_memberships/index.html.erb)

```
┌─────────────────────────────────────────┐
│ 멤버 관리                [초대 코드 생성] │
│─────────────────────────────────────────│
│ 👑 김소유자  owner                       │
│ 🛡️ 박운영  admin  [member로 변경] [추방] │
│ 👤 이멤버  member [admin으로 변경] [추방] │
│ 👤 최멤버  member [admin으로 변경] [추방] │
│─────────────────────────────────────────│
│ 초대 코드: ABC123  만료: 7일 후  [삭제]  │
│ 초대 코드: XYZ789  만료: 없음   [삭제]  │
└─────────────────────────────────────────┘
```

### 6.5 권한별 UI 표시/숨김

뷰 헬퍼에서 `@current_membership` 기반으로 분기:

```erb
<%# 예시: 경기 생성 버튼 (admin 이상만) %>
<% if @current_membership&.admin? %>
  <%= link_to "경기 생성", new_club_match_path(@club), class: "btn btn-primary" %>
<% end %>

<%# 예시: 클럽 삭제 (owner만) %>
<% if @current_membership&.owner? %>
  <%= button_to "클럽 삭제", club_path(@club), method: :delete, class: "btn btn-error" %>
<% end %>
```

---

## 7. 영향 범위 분석

### 7.1 `current_user.clubs` 사용 위치 (모두 변경 필요)

| 파일 | 현재 코드 | 변경 방식 |
|------|----------|----------|
| `ClubsController#index` | `current_user.clubs.includes(...)` | ClubMembership through 관계로 자동 적용 |
| `ClubsController#set_club` | `current_user.clubs.find(params[:id])` | `set_authorized_club`로 교체 |
| `ClubsController#new` | `current_user.clubs.new` | `Club.new` + membership 생성 |
| `ClubsController#create` | `current_user.clubs.new(club_params)` | `Club.new` + membership 생성 |
| `MatchesController#set_club` | `current_user.clubs.find(params[:club_id])` | `set_authorized_club`로 교체 |
| `MembersController#set_club` | `current_user.clubs.find(params[:club_id])` | `set_authorized_club`로 교체 |
| `ScoreboardsController#set_club` | `current_user.clubs.find(params[:club_id])` | `set_authorized_club`로 교체 |
| `ScoreboardsController#index` | `current_user.clubs.includes(:matches)` | through 관계로 자동 적용 |
| `StatsController#set_club` | `current_user.clubs.find(params[:club_id])` | `set_authorized_club`로 교체 |
| `SettingsController` | `current_user.clubs.joins(:matches).pluck(...)` | through 관계로 자동 적용 |

### 7.2 기존 기능 호환성

| 기능 | 영향 | 대응 |
|------|------|------|
| 클럽 데이터 백업/복원 (UserExporter/UserImporter) | `current_user.clubs` 참조 | through 관계로 자동 호환 |
| 통계 캐시 (MemberStatsCacheable) | club_id 기반이라 영향 없음 | 변경 불필요 |
| 스코어보드 ActionCable | match_id 기반이라 영향 없음 | 변경 불필요 |
| 공유 링크 (matches#share) | 토큰 기반이라 영향 없음 | 변경 불필요 |

---

## 8. Gemfile 추가

```ruby
# Gemfile에 추가
gem "omniauth"
gem "omniauth-kakao"
gem "omniauth-naver"
gem "omniauth-google-oauth2"
gem "omniauth-rails_csrf_protection"
```

---

## 9. 구현 순서 (체크리스트)

### Phase 1: 소셜 로그인 기반 구축
- [ ] Gemfile에 omniauth 관련 gem 추가 + `bundle install`
- [ ] `config/initializers/omniauth.rb` 생성
- [ ] 마이그레이션: `AddSocialFieldsToUsers` 실행
- [ ] 마이그레이션: `CreateIdentities` 실행
- [ ] `Identity` 모델 생성
- [ ] `User` 모델 수정 (관계 추가, password 조건부 검증)
- [ ] `OmniauthUserFinder` 서비스 생성
- [ ] `OmniauthCallbacksController` 생성
- [ ] `config/routes.rb`에 OAuth 콜백 라우트 추가
- [ ] 로그인 화면에 소셜 로그인 버튼 추가
- [ ] 프로필 설정 화면/컨트롤러 생성

### Phase 2: 역할 시스템
- [ ] 마이그레이션: `CreateClubMemberships` 실행 (기존 데이터 자동 변환 포함)
- [ ] `ClubMembership` 모델 생성
- [ ] `Club` 모델 수정 (관계 추가)
- [ ] `ClubAuthorization` concern 생성
- [ ] `ClubsController` 수정 (set_authorized_club + 권한 체크)
- [ ] `MatchesController` 수정
- [ ] `MembersController` 수정
- [ ] `ScoreboardsController` 수정
- [ ] `StatsController` 수정
- [ ] `ClubMembershipsController` 생성 (역할 변경/양도/탈퇴/추방)

### Phase 3: 초대 시스템
- [ ] 마이그레이션: `CreateClubInvitations` 실행
- [ ] `ClubInvitation` 모델 생성
- [ ] `ClubInvitationsController` 생성
- [ ] `ClubJoinsController` 생성
- [ ] 라우트 추가 (초대 코드 관리 + 참여 링크)
- [ ] 초대 코드 관리 UI (운영자용)
- [ ] 초대 코드 입력 UI (메인 화면)
- [ ] 초대 링크 참여 화면

### Phase 4: UI 통합
- [ ] 클럽 카드에 역할 배지 표시
- [ ] 클럽 없는 유저 안내 화면
- [ ] 각 화면에서 권한별 버튼/메뉴 표시/숨김
- [ ] 멤버 관리 화면 UI
- [ ] 프로필 > 연결된 소셜 계정 표시
- [ ] i18n 번역 키 추가 (4개 언어)

---

## 10. i18n 키 추가 목록

```yaml
# 주요 추가 키 (ko.yml 기준, ja/en/zh에도 동일 구조)
auth:
  social:
    kakao: "카카오로 시작하기"
    naver: "네이버로 시작하기"
    google: "Google로 시작하기"
  notices:
    welcome_setup: "환영합니다! 프로필을 설정해주세요."
    oauth_failed: "소셜 로그인에 실패했습니다. 다시 시도해주세요."
  club_admin_required: "운영자 권한이 필요합니다."
  club_owner_required: "클럽 소유자만 가능합니다."

club_membership:
  roles:
    owner: "소유자"
    admin: "운영자"
    member: "멤버"
  actions:
    promote: "승격"
    demote: "강등"
    transfer: "소유권 양도"
    kick: "추방"
    leave: "탈퇴"

club_invitation:
  code_created: "초대 코드가 생성되었습니다."
  code_deleted: "초대 코드가 삭제되었습니다."
  invalid_code: "유효하지 않은 초대 코드입니다."
  already_member: "이미 참여 중인 클럽입니다."
  joined: "클럽에 참여했습니다!"
```
