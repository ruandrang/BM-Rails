# Plan: member-permission (멤버 권한 체계 개편)

## 1. 기능 개요

초대 코드로 클럽에 가입한 사용자(User)가 자동으로 선수 명단(Member)에 등록되고, 본인의 기본 정보(나이, 키, 포지션, 등번호)를 직접 입력/수정할 수 있도록 한다. 동시에 권한 체계를 4단계로 확장하여, 경기 운영을 담당하는 중간 역할(manager)을 추가한다.

### 1.1 핵심 원칙

- 초대 코드 가입 시 User ↔ Member 자동 연결
- 가입 직후 본인 프로필(선수 정보) 입력 화면으로 안내
- member 역할은 본인 정보만 수정 가능 (다른 선수 정보 수정 불가)
- 기존 admin이 수동 등록한 Member는 User 연결 없이 유지 가능 (하위 호환)

### 1.2 현재 상태

| 항목 | 현재 상태 |
|------|----------|
| 역할 체계 | 3단계: `owner` / `admin` / `member` |
| Member ↔ User 관계 | **없음** (Member는 club_id만 참조, user_id 없음) |
| 초대 코드 가입 | ClubMembership만 생성, Member는 미생성 |
| member 권한 | 읽기 전용 (선수 목록, 통계, 경기 결과 조회만 가능) |
| 선수 관리 | admin 이상만 CRUD 가능 |

### 1.3 목표 상태

| 항목 | 목표 |
|------|------|
| 역할 체계 | 4단계: `owner` / `admin` / `manager` / `member` |
| Member ↔ User 관계 | `members.user_id` 추가로 연결 (nullable) |
| 초대 코드 가입 | ClubMembership + Member 동시 생성 |
| member 권한 | 본인 선수 정보 수정 가능 |
| manager 권한 | 경기 생성/스코어보드 조작 가능 (선수 관리는 불가) |

---

## 2. 기능 범위

### 2.1 User ↔ Member 연결

| 항목 | 설명 |
|------|------|
| members.user_id 컬럼 추가 | nullable FK → users (기존 수동 등록 Member는 null) |
| 자동 Member 생성 | 초대 코드 가입 시 User의 nickname을 name으로 사용하여 Member 자동 생성 |
| 중복 방지 | 동일 club_id + user_id 조합 유니크 제약 (null은 제외) |

### 2.2 가입 후 프로필 입력 흐름

```
[초대 코드 입력] → [클럽 가입 완료]
     │
     ▼
[선수 프로필 입력 화면]
- 이름: (닉네임에서 자동 입력, 수정 가능)
- 나이: [    ]
- 키:   [    ] cm
- 포지션: [PG ▼]
- 등번호: [    ]
     │
     ▼
[클럽 메인 화면]
```

- 프로필 입력은 **가입 직후** 자동 이동 (필수)
- 포지션만 필수, 나머지는 선택 사항
- 이후에도 "내 정보" 메뉴에서 수정 가능

### 2.3 역할 체계 확장 (4단계)

| 역할 | 설명 | 부여 방식 |
|------|------|----------|
| **owner** | 클럽 생성자, 모든 권한 | 클럽 생성 시 자동 부여 |
| **admin** | 총괄 운영자 | owner가 승격 |
| **manager** | 경기 운영자 | owner/admin이 승격 |
| **member** | 일반 멤버 (선수) | 초대 코드 가입 시 자동 |

### 2.4 역할 변경 규칙

| 변경 | 가능 여부 | 수행자 |
|------|:---------:|--------|
| member → manager | O | owner, admin |
| member → admin | O | owner |
| manager → admin | O | owner |
| manager → member | O | owner, admin |
| admin → member | O | owner |
| admin → manager | O | owner |
| owner 양도 | O | owner (본인만) |
| 본인 역할 변경 | X | - |

---

## 3. 권한 매트릭스 (변경 후)

| 기능 | owner | admin | manager | member |
|------|:---:|:---:|:---:|:---:|
| 클럽 정보 수정 | O | O | X | X |
| 클럽 삭제 | O | X | X | X |
| 선수 추가/수정/삭제 (타인) | O | O | X | X |
| **본인 선수 정보 수정** | O | O | O | **O** |
| **경기 생성/수정/삭제** | O | O | **O** | X |
| **스코어보드 조작** | O | O | **O** | X |
| 팀 자동 밸런싱 | O | O | **O** | X |
| 초대 코드 관리 | O | O | X | X |
| 역할 변경 (승격/강등) | O | O* | X | X |
| owner 양도 | O | X | X | X |
| 통계 조회 | O | O | O | O |
| 경기 결과 조회 | O | O | O | O |
| 스코어보드 디스플레이 조회 | O | O | O | O |
| 데이터 백업/복원 | O | X | X | X |
| 클럽 탈퇴 | X | O | O | O |

> *admin은 manager/member만 승격/강등 가능 (다른 admin 불가)

---

## 4. 데이터 모델 변경

### 4.1 members 테이블 변경

```
members (수정)
  + user_id: integer (FK → users, nullable)
  + index: [club_id, user_id] unique (user_id가 NOT NULL인 경우만)
```

- 기존 Member 데이터: `user_id = null` (하위 호환)
- 초대 코드 가입으로 생성된 Member: `user_id` 설정됨

### 4.2 club_memberships 테이블 변경

```
club_memberships (수정)
  role: string → 'owner' | 'admin' | 'manager' | 'member' (기존 'member' 유지)
```

- `ROLES` 상수에 `'manager'` 추가
- 기존 데이터 영향 없음 (기존 role 값 변경 불필요)

### 4.3 마이그레이션 요약

| 마이그레이션 | 내용 |
|-------------|------|
| AddUserIdToMembers | `members.user_id` 컬럼 + FK + 조건부 유니크 인덱스 추가 |

---

## 5. 변경 영향 범위

### 5.1 모델 변경

| 파일 | 변경 내용 |
|------|----------|
| `app/models/member.rb` | `belongs_to :user, optional: true` 추가, `linked?` 메서드 |
| `app/models/club_membership.rb` | `ROLES`에 `'manager'` 추가, `manager?` 메서드 |
| `app/models/user.rb` | `has_many :members` 추가 |

### 5.2 컨트롤러 변경

| 파일 | 변경 내용 |
|------|----------|
| `app/controllers/club_joins_controller.rb` | 가입 시 Member 자동 생성 + 프로필 입력 리다이렉트 |
| `app/controllers/members_controller.rb` | 본인 정보 수정 액션 추가 (`edit_profile`, `update_profile`), manager 권한 체크 |
| `app/controllers/concerns/club_authorization.rb` | `require_club_manager` 메서드 추가 |
| `app/controllers/matches_controller.rb` | `require_club_admin` → `require_club_manager` (경기 CRUD) |
| `app/controllers/scoreboards_controller.rb` | `require_club_admin` → `require_club_manager` (control) |
| `app/controllers/club_memberships_controller.rb` | manager 역할 승격/강등 로직 추가, admin의 승격 권한 제한 |

### 5.3 뷰 변경

| 파일 | 변경 내용 |
|------|----------|
| 신규: `app/views/members/edit_profile.html.erb` | 본인 선수 정보 입력/수정 화면 |
| `app/views/club_memberships/index.html.erb` | manager 역할 표시 + 승격/강등 버튼 |
| 관련 뷰 전체 | 권한 분기 (`admin?` 체크 → `manager?` 체크 변경) |

### 5.4 라우트 변경

```ruby
# config/routes.rb 추가
resources :clubs do
  resources :members do
    member do
      get :edit_profile    # 본인 프로필 수정 폼
      patch :update_profile # 본인 프로필 저장
    end
  end
end
```

### 5.5 다국어(i18n) 변경

| 키 | 설명 |
|----|------|
| `club_memberships.roles.manager` | "매니저" / "Manager" / "マネージャー" / "经理" |
| `members.profile.*` | 프로필 입력 화면 관련 번역 |
| `auth.club_manager_required` | "경기 운영 권한이 필요합니다" |

---

## 6. 구현 순서 (Phase)

### Phase 1: 데이터 모델 변경
1. `members.user_id` 추가 마이그레이션
2. `Member` 모델에 `belongs_to :user, optional: true` 추가
3. `ClubMembership` 모델에 `manager` 역할 추가
4. `User` 모델에 `has_many :members` 추가

### Phase 2: 권한 체계 확장
1. `ClubAuthorization` concern에 `require_club_manager` 추가
2. `MatchesController` 권한을 `require_club_manager`로 변경
3. `ScoreboardsController` 권한을 `require_club_manager`로 변경
4. `ClubMembershipsController` 역할 변경 로직 확장 (admin의 manager 승격 권한)

### Phase 3: 자동 Member 생성 + 프로필 입력
1. `ClubJoinsController#create`에서 Member 자동 생성
2. 프로필 입력 화면 (`edit_profile`) 뷰 + 라우트 추가
3. 본인 정보 수정 액션 (`update_profile`) 구현
4. 가입 후 프로필 입력 화면으로 리다이렉트

### Phase 4: UI 반영
1. 멤버 관리 화면에 manager 역할 표시/승격 버튼
2. 권한별 UI 분기 (경기 생성 버튼 등 manager 이상에게 표시)
3. "내 정보 수정" 메뉴 추가 (member도 접근 가능)
4. 선수 목록에서 User 연결 상태 표시 (아이콘 등)

### Phase 5: i18n
1. 4개 로케일 파일에 새 번역 키 추가
2. manager 역할명, 프로필 관련 메시지

---

## 7. 기존 데이터 호환성

| 시나리오 | 처리 방법 |
|----------|----------|
| 기존 수동 등록 Member | `user_id = null` 유지, 정상 동작 |
| 기존 owner/admin/member 역할 | 변경 없음, manager는 신규 승격으로만 생성 |
| 기존 ClubMembership | role 값 변경 불필요 |
| admin이 등록한 선수와 동일인이 초대 코드로 가입 | 중복 Member 생성 (admin이 수동 병합 가능, 향후 기능) |

---

## 8. 리스크 및 고려사항

| 리스크 | 대응 방안 |
|--------|----------|
| Member + User 중복 생성 | 이름 비교 알림 또는 수동 병합 안내 (v1에서는 중복 허용) |
| manager 역할 추가로 인한 뷰 분기 복잡성 | `admin?` 메서드가 owner+admin을 포함하듯, `manager?`도 owner+admin+manager 포함하도록 설계 |
| SQLite 조건부 유니크 인덱스 | partial index 지원됨 (`WHERE user_id IS NOT NULL`) |
| 프로필 입력 건너뛰기 | 포지션만 필수, 나머지 optional → 최소 입력으로 진행 가능 |
| 기존 admin 권한 축소 없음 | admin 기존 권한 100% 유지, manager는 admin의 부분집합 |

---

## 9. 범위 밖 (Out of Scope)

- 기존 수동 등록 Member와 가입 User 자동 병합 (향후 기능)
- member 역할의 경기 생성 권한 (manager 승격 필요)
- 기능별 세부 권한 플래그 (ON/OFF) 시스템
- member의 스코어보드 조작 권한 (manager 승격 필요)
- 프로필 사진 업로드 (별도 기능)
