# Design: member-permission (멤버 권한 체계 개편)

> Plan 문서: `docs/01-plan/features/member-permission.plan.md`

## 1. 설계 개요

3가지 핵심 변경을 구현한다:
1. **Member ↔ User 연결**: `members.user_id` 컬럼 추가로 선수와 계정 연결
2. **4단계 역할 체계**: `manager` 역할 추가 (owner > admin > manager > member)
3. **자동 등록 + 프로필 입력**: 초대 코드 가입 시 Member 자동 생성 후 프로필 입력 안내

---

## 2. 데이터베이스 설계

### 2.1 마이그레이션: AddUserIdToMembers

```ruby
# db/migrate/XXXXXX_add_user_id_to_members.rb
class AddUserIdToMembers < ActiveRecord::Migration[8.1]
  def change
    add_reference :members, :user, null: true, foreign_key: true

    # user_id가 있는 경우에만 club_id + user_id 유니크 제약
    # (수동 등록 Member는 user_id = null이므로 제약 안 받음)
    add_index :members, [:club_id, :user_id],
              unique: true,
              where: "user_id IS NOT NULL",
              name: "index_members_on_club_user_unique"
  end
end
```

### 2.2 스키마 변경 요약

```
members 테이블
  기존: id, name, position, age, height_cm, jersey_number, club_id, sort_order, timestamps
  추가: user_id (integer, nullable, FK → users)
  인덱스: [club_id, user_id] UNIQUE WHERE user_id IS NOT NULL
```

> PostgreSQL(프로덕션)과 SQLite(개발) 모두 partial index(`WHERE` 조건) 지원

---

## 3. 모델 설계

### 3.1 ClubMembership 변경

```ruby
# app/models/club_membership.rb
class ClubMembership < ApplicationRecord
  ROLES = %w[owner admin manager member].freeze
  #                       ^^^^^^^ 추가

  # 기존 scope 유지
  scope :owners, -> { where(role: "owner") }
  scope :admins, -> { where(role: %w[owner admin]) }
  scope :managers, -> { where(role: %w[owner admin manager]) }  # 추가
  scope :members_only, -> { where(role: "member") }

  # 기존 메서드 유지
  def owner?
    role == "owner"
  end

  def admin?
    role.in?(%w[owner admin])
  end

  # 추가: manager 이상 (owner + admin + manager)
  def manager?
    role.in?(%w[owner admin manager])
  end

  def member?
    role == "member"
  end
end
```

**설계 포인트**: `manager?`는 `admin?`와 같은 패턴으로 **상위 역할을 모두 포함**한다. 이렇게 하면 `require_club_manager`를 사용할 때 owner/admin도 자동 통과된다.

### 3.2 Member 변경

```ruby
# app/models/member.rb
class Member < ApplicationRecord
  belongs_to :club
  belongs_to :user, optional: true  # 추가: nullable 관계
  has_many :team_members, dependent: :destroy
  has_many :teams, through: :team_members

  validates :name, presence: true
  validates :position, presence: true, inclusion: { in: POSITIONS }
  validates :user_id, uniqueness: { scope: :club_id }, allow_nil: true  # 추가

  # 추가: User와 연결된 선수인지 확인
  def linked?
    user_id.present?
  end
end
```

### 3.3 User 변경

```ruby
# app/models/user.rb (추가 부분만)
class User < ApplicationRecord
  has_many :members, dependent: :nullify  # 추가
  # dependent: :nullify → User 삭제 시 Member는 유지하되 user_id를 null로

  # 추가: 특정 클럽에서 본인의 Member 레코드 조회
  def member_in(club)
    members.find_by(club: club)
  end
end
```

---

## 4. 컨트롤러 설계

### 4.1 ClubAuthorization concern 변경

```ruby
# app/controllers/concerns/club_authorization.rb
module ClubAuthorization
  extend ActiveSupport::Concern

  private

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

  # 추가: manager 이상 권한 체크
  def require_club_manager
    unless @current_membership&.manager?
      redirect_to club_path(@club), alert: I18n.t("auth.club_manager_required", default: "경기 운영 권한이 필요합니다.")
    end
  end
end
```

### 4.2 MatchesController 권한 변경

```ruby
# app/controllers/matches_controller.rb (변경 부분)
class MatchesController < ApplicationController
  # 변경: require_club_admin → require_club_manager
  before_action :require_club_manager, only: [ :new, :create, :edit, :update, :destroy,
    :record_results, :shuffle_teams, :reset_all_scores, :finish_match,
    :move_member, :add_member, :remove_member, :add_game, :remove_game,
    :save_game_scores, :save_quarter_scores, :update_scores ]
end
```

### 4.3 ScoreboardsController 권한 변경

```ruby
# app/controllers/scoreboards_controller.rb (변경 부분)
class ScoreboardsController < ApplicationController
  # 변경: require_club_admin → require_club_manager
  before_action :require_club_manager, only: [ :control ]
end
```

### 4.4 ClubJoinsController 변경 (자동 Member 생성)

```ruby
# app/controllers/club_joins_controller.rb
class ClubJoinsController < ApplicationController
  def create
    invitation = ClubInvitation.active.find_by!(code: params[:code])
    club = invitation.club

    if club.membership_for(current_user)
      redirect_to club_path(club), notice: t("club_joins.errors.already_member")
      return
    end

    ActiveRecord::Base.transaction do
      # 1. ClubMembership 생성 (기존)
      club.club_memberships.create!(
        user: current_user,
        role: "member",
        joined_at: Time.current
      )

      # 2. Member 자동 생성 (추가)
      @member = club.members.create!(
        user: current_user,
        name: current_user.display_name,
        position: "PG",  # 기본값, 프로필 입력에서 변경
        sort_order: (club.members.maximum(:sort_order).to_i + 1)
      )
    end
    invitation.use!

    # 3. 프로필 입력 화면으로 리다이렉트 (추가)
    redirect_to edit_profile_club_member_path(club, @member),
                notice: t("club_joins.notices.joined_fill_profile")
  rescue ActiveRecord::RecordNotFound
    redirect_to clubs_path, alert: t("club_joins.errors.invalid_code")
  end
end
```

### 4.5 MembersController 변경 (본인 프로필 수정)

```ruby
# app/controllers/members_controller.rb (추가 액션)
class MembersController < ApplicationController
  include ClubAuthorization

  before_action :set_authorized_club
  before_action :require_club_admin, except: [ :index, :edit_profile, :update_profile ]
  before_action :set_member, only: [ :edit, :update, :destroy ]
  before_action :set_own_member, only: [ :edit_profile, :update_profile ]

  # 기존 액션들 유지...

  # 추가: 본인 프로필 수정 폼
  def edit_profile
    # @member는 set_own_member에서 설정됨
  end

  # 추가: 본인 프로필 저장
  def update_profile
    if @member.update(profile_params)
      redirect_to club_path(@club), notice: t("members.notices.profile_updated")
    else
      render :edit_profile, status: :unprocessable_entity
    end
  end

  private

  # 추가: 본인의 Member 레코드만 접근
  def set_own_member
    @member = @club.members.find_by!(user: current_user)
  rescue ActiveRecord::RecordNotFound
    redirect_to club_path(@club), alert: t("members.errors.no_linked_member")
  end

  # 추가: 프로필 수정 시 허용 파라미터 (이름 포함)
  def profile_params
    params.require(:member).permit(:name, :age, :height_cm, :position, :jersey_number)
  end
end
```

### 4.6 ClubMembershipsController 변경 (역할 체계 확장)

```ruby
# app/controllers/club_memberships_controller.rb (변경 부분)
class ClubMembershipsController < ApplicationController
  include ClubAuthorization

  before_action :set_authorized_club
  before_action :require_club_owner, only: [ :transfer_ownership ]
  before_action :require_role_change_permission, only: [ :update_role ]
  before_action :require_club_admin, only: [ :destroy ]

  def update_role
    membership = @club.club_memberships.find(params[:id])
    return redirect_with_alert(t("club_memberships.errors.cannot_change_own_role")) if membership.user == current_user

    new_role = params[:role]

    # owner만 admin 승격/강등 가능
    if new_role == "admin" || membership.admin?
      return redirect_with_alert(t("club_memberships.errors.owner_only_for_admin")) unless @current_membership.owner?
    end

    # owner 역할은 양도로만 변경
    return redirect_with_alert(t("club_memberships.errors.owner_role_transfer_only")) if membership.owner?

    # 유효한 역할인지 검사 (owner 제외)
    return redirect_with_alert(t("club_memberships.errors.invalid_role")) unless new_role.in?(%w[admin manager member])

    membership.update!(role: new_role)
    redirect_to club_memberships_path(@club), notice: t("club_memberships.notices.role_changed")
  end

  private

  # 추가: 역할 변경 권한 체크
  # - owner: 모든 역할 변경 가능
  # - admin: manager/member만 변경 가능
  def require_role_change_permission
    unless @current_membership&.admin?
      redirect_to club_memberships_path(@club), alert: I18n.t("auth.club_admin_required", default: "운영자 권한이 필요합니다.")
    end
  end
end
```

---

## 5. 라우트 설계

```ruby
# config/routes.rb (변경 부분)
resources :clubs do
  resources :members do
    member do
      get :edit_profile      # 본인 프로필 수정 폼
      patch :update_profile  # 본인 프로필 저장
    end
    collection do
      post :import_csv
      get :export_csv
      patch :reorder
    end
  end
  # ... 나머지 기존 라우트
end
```

생성되는 라우트:
- `GET /clubs/:club_id/members/:id/edit_profile` → `members#edit_profile`
- `PATCH /clubs/:club_id/members/:id/update_profile` → `members#update_profile`

---

## 6. 뷰 설계

### 6.1 프로필 입력/수정 화면 (신규)

```
파일: app/views/members/edit_profile.html.erb

┌─────────────────────────────────────────┐
│  ← 뒤로                                │
│                                          │
│  내 선수 정보                            │
│  기본 정보를 입력해주세요                 │
│                                          │
│  ┌─── card-modern-static ──────────────┐ │
│  │                                      │ │
│  │  이름: [현재 닉네임           ]       │ │
│  │  나이: [    ]                         │ │
│  │  키:   [    ] cm                      │ │
│  │  포지션: [PG ▼]                      │ │
│  │  등번호: [    ]                       │ │
│  │                                      │ │
│  │  [저장하기] (btn-primary btn-lg)      │ │
│  │                                      │ │
│  └──────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

- DaisyUI form 컴포넌트 사용 (`input`, `select`, `label`)
- 기존 `members/_form.html.erb`와 유사한 필드 구성
- 포지션은 `Member::POSITIONS` 기반 select
- 저장 후 `club_path(@club)`로 리다이렉트

### 6.2 멤버십 목록 화면 변경 (index.html.erb)

기존 3단계 역할 표시 → 4단계로 확장:

```erb
<%# 역할 아이콘 추가 %>
<% if membership.owner? %>
  <span class="text-xl">👑</span>
<% elsif membership.role == "admin" %>
  <span class="text-xl">🛡️</span>
<% elsif membership.role == "manager" %>
  <span class="text-xl">📋</span>        <%# 추가 %>
<% else %>
  <span class="text-xl">👤</span>
<% end %>

<%# 역할 배지 추가 %>
<% when "manager" %>
  <span class="badge badge-success badge-xs"><%= t('club_memberships.index.roles.manager') %></span>
```

역할 변경 버튼 로직 확장:
```
owner가 보는 화면:
  - admin → [member로 변경] [manager로 변경]
  - manager → [admin으로 승격] [member로 변경]
  - member → [admin으로 승격] [manager로 승격]

admin이 보는 화면:
  - manager → [member로 변경]
  - member → [manager로 승격]
  - admin/owner → (버튼 없음)
```

### 6.3 선수 목록 화면 변경 (members/index.html.erb)

```
변경 1: 카드 클릭 동작 분기
  - admin 이상: 기존대로 edit 페이지로 이동
  - manager/member: 본인 카드만 edit_profile 페이지로 이동, 타인 카드는 클릭 불가

변경 2: "내 정보 수정" 버튼 추가
  - member/manager 역할에게 본인의 Member가 있을 때 표시
  - 액션 버튼 영역에 배치

변경 3: User 연결 상태 표시
  - linked? 인 Member 카드에 작은 아이콘(🔗) 표시
  - admin에게만 보이도록 (일반 멤버에게는 불필요)
```

### 6.4 경기/스코어보드 관련 뷰

권한 체크 분기를 `admin?` → `manager?`로 변경:
- `matches/index.html.erb`: "새 경기" 버튼 표시 조건
- `matches/show.html.erb`: 경기 수정/삭제 버튼 표시 조건
- `scoreboards/index.html.erb`: 스코어보드 컨트롤 링크 표시 조건

이 변경은 뷰 내 `@current_membership&.admin?` → `@current_membership&.manager?`로 단순 교체.

---

## 7. 구현 순서

### Step 1: 마이그레이션 + 모델 (영향 최소)
1. `AddUserIdToMembers` 마이그레이션 생성 및 실행
2. `Member` 모델에 `belongs_to :user, optional: true` + `linked?` 추가
3. `User` 모델에 `has_many :members` + `member_in` 추가
4. `ClubMembership` 모델에 `manager` 역할 + `manager?` 메서드 추가

### Step 2: 권한 체계 확장 (컨트롤러)
1. `ClubAuthorization`에 `require_club_manager` 추가
2. `MatchesController`: `require_club_admin` → `require_club_manager`
3. `ScoreboardsController`: `require_club_admin` → `require_club_manager`
4. `ClubMembershipsController`: `update_role` 로직 확장

### Step 3: 자동 등록 + 프로필 입력 (핵심 기능)
1. `ClubJoinsController#create`에 Member 자동 생성 로직 추가
2. `config/routes.rb`에 `edit_profile`, `update_profile` 라우트 추가
3. `MembersController`에 `edit_profile`, `update_profile` 액션 추가
4. `app/views/members/edit_profile.html.erb` 뷰 생성

### Step 4: 뷰 업데이트
1. `club_memberships/index.html.erb`: manager 역할 표시 + 역할 변경 버튼 로직
2. `members/index.html.erb`: 본인 프로필 수정 버튼, 카드 클릭 분기
3. 경기/스코어보드 관련 뷰: `admin?` → `manager?` 교체

### Step 5: i18n
1. 4개 로케일 파일 (ko, en, ja, zh)에 새 키 추가:
   - `club_memberships.index.roles.manager`
   - `club_memberships.errors.owner_only_for_admin`
   - `auth.club_manager_required`
   - `members.notices.profile_updated`
   - `members.errors.no_linked_member`
   - `club_joins.notices.joined_fill_profile`
   - `members.profile.*` (프로필 화면 관련)

---

## 8. 엣지 케이스 처리

### 8.1 기존 owner/admin도 Member 연결이 필요한가?

**아니오**. owner/admin은 이미 모든 선수 정보를 관리할 수 있으므로 별도 Member 연결 불필요. 초대 코드로 가입한 member/manager에게만 자동 연결.

단, owner/admin이 본인도 선수 명단에 등록하고 싶다면 기존 "선수 추가" 기능으로 수동 등록 (user_id 없이).

### 8.2 이미 같은 이름의 Member가 있을 때

중복 허용. `user_id` 기반 유니크 제약만 적용하고, `name`은 중복 가능. admin이 나중에 수동 등록 Member를 삭제하는 방식으로 정리.

### 8.3 member가 탈퇴(ClubMembership 삭제)할 때

`ClubMembership`만 삭제. 연결된 `Member` 레코드는 유지 (과거 경기 기록 보존). `user_id`를 `null`로 변경하여 연결만 해제.

```ruby
# club_memberships_controller.rb destroy 액션 내
if membership.user == current_user
  # 본인 탈퇴 시 Member 연결 해제
  linked_member = @club.members.find_by(user: current_user)
  linked_member&.update!(user_id: nil)
  membership.destroy
  redirect_to clubs_path, notice: t("club_memberships.notices.left_club")
end
```

### 8.4 admin이 추방할 때

추방 시에도 동일하게 `Member.user_id`를 `null`로 변경 (경기 기록 유지).

### 8.5 admin이 manager/member 승격 권한 범위

```
admin이 할 수 있는 역할 변경:
  member ↔ manager (양방향 가능)

admin이 할 수 없는 역할 변경:
  * → admin (owner만 가능)
  admin → * (owner만 가능)
```

---

## 9. 보안 고려사항

| 항목 | 대응 |
|------|------|
| 본인 프로필만 수정 가능 | `set_own_member`에서 `current_user` 기반 조회, URL 조작 방지 |
| 역할 변경 권한 분리 | admin ↔ 변경은 owner만 가능, manager ↔ member는 admin도 가능 |
| Member user_id 위변조 | `profile_params`에 `user_id` 포함하지 않음 (Strong Parameters) |
| 탈퇴 시 데이터 정합성 | Member 유지 + user_id null 처리 (경기 기록 보존) |

---

## 10. 영향받는 파일 전체 목록

### 신규 파일
| 파일 | 설명 |
|------|------|
| `db/migrate/XXXXXX_add_user_id_to_members.rb` | 마이그레이션 |
| `app/views/members/edit_profile.html.erb` | 프로필 입력/수정 뷰 |

### 수정 파일
| 파일 | 변경 사항 |
|------|----------|
| `app/models/member.rb` | `belongs_to :user`, `linked?`, validates |
| `app/models/user.rb` | `has_many :members`, `member_in` |
| `app/models/club_membership.rb` | ROLES에 manager, `manager?` scope |
| `app/controllers/concerns/club_authorization.rb` | `require_club_manager` |
| `app/controllers/matches_controller.rb` | `require_club_admin` → `require_club_manager` |
| `app/controllers/scoreboards_controller.rb` | `require_club_admin` → `require_club_manager` |
| `app/controllers/club_joins_controller.rb` | Member 자동 생성 + 리다이렉트 |
| `app/controllers/members_controller.rb` | `edit_profile`, `update_profile` 액션 |
| `app/controllers/club_memberships_controller.rb` | 역할 변경 로직 확장, 탈퇴 시 Member 연결 해제 |
| `config/routes.rb` | `edit_profile`, `update_profile` 라우트 |
| `app/views/club_memberships/index.html.erb` | manager 역할 표시, 역할 변경 버튼 |
| `app/views/members/index.html.erb` | 본인 프로필 수정 버튼, 카드 클릭 분기 |
| `config/locales/ko.yml` | 새 번역 키 |
| `config/locales/en.yml` | 새 번역 키 |
| `config/locales/ja.yml` | 새 번역 키 |
| `config/locales/zh.yml` | 새 번역 키 |
