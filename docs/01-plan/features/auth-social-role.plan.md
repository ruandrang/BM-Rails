# Plan: auth-social-role (소셜 로그인 + 역할 기반 클럽 가입)

## 1. 기능 개요

농구 클럽 관리 앱(BM-Rail)에 소셜 로그인(카카오/네이버/구글)으로 간편한 회원가입을 제공하고, 클럽 내 역할(owner/admin/member)을 클럽 생성/참여 시점에 자동 부여한다.

### 1.1 핵심 원칙
- 회원가입은 하나로 통일 (역할 선택 없음)
- 역할은 클럽 단위로 부여 (같은 사람이 A클럽 owner, B클럽 member 가능)
- 가입 과정은 최대한 심플하게

### 1.2 현재 상태
- 인증: 이메일/비밀번호 (bcrypt `has_secure_password`)
- 인가: `users.admin` 플래그만 존재 (시스템 관리자 구분용)
- 클럽 소유: `clubs.user_id` 직접 참조 (소유자 1명만 존재)
- 클럽 공유: 불가능 (각 유저가 자기 클럽만 볼 수 있음)

### 1.3 목표 상태
- 카카오톡/네이버/구글 OAuth 2.0 소셜 로그인 지원
- 기존 이메일/비밀번호 로그인 제거 (소셜 로그인으로 통일)
- 클럽 단위 3단계 역할 시스템 (owner / admin / member)
- 초대 코드 + 초대 링크로 클럽 참여

---

## 2. 기능 범위

### 2.1 소셜 로그인

| 항목 | 설명 |
|------|------|
| 카카오톡 로그인 | Kakao OAuth 2.0 연동 (한국 동호회 필수) |
| 네이버 로그인 | Naver OAuth 2.0 연동 |
| 구글 로그인 | Google OAuth 2.0 연동 (안드로이드 + 해외 사용자) |
| Identity 모델 | 1 User에 여러 소셜 계정 연결 가능 (별도 테이블) |
| 계정 연결 | 동일 이메일이면 기존 계정에 소셜 계정 추가 연결 |
| 프로필 설정 | 최초 가입 시 닉네임/프로필 사진 설정 화면 (소셜에서 가져오되 수정 가능) |

### 2.2 가입 흐름

```
[로그인 화면]
  ├── 카카오로 시작하기
  ├── 네이버로 시작하기
  └── Google로 시작하기
         │
         ▼
  [최초 가입 시 프로필 설정]
  - 닉네임 (소셜에서 가져오되 수정 가능)
  - 프로필 사진 (소셜에서 가져오되 수정 가능)
         │
         ▼
  [메인 화면 - 클럽 목록]
  - 클럽이 없으면: "클럽 만들기" 또는 "초대 코드로 참여" 안내
```

### 2.3 역할 시스템

| 역할 | 설명 | 부여 방식 |
|------|------|----------|
| owner | 클럽 생성자 | 클럽 만들기 시 자동 부여 |
| admin | 운영자 | owner가 member를 승격 |
| member | 일반 멤버 | 초대 코드/링크로 참여 시 자동 부여 |

### 2.4 역할 변경

- owner → member를 admin으로 승격 가능
- owner → admin을 member로 강등 가능
- owner → 다른 멤버에게 owner 양도 가능
- member/admin은 스스로 역할 변경 불가

### 2.5 클럽 참여 방식

**초대 코드**
```
[운영자 화면]
클럽 설정 → 초대 코드 생성
  - 6자리 영숫자 코드 (예: ABC123)
  - 유효기간 설정 (1일, 7일, 30일, 무제한)
  - 코드 재생성 가능 (기존 코드 무효화)

[멤버 화면]
메인 → "초대 코드로 참여" → 코드 입력 → 클럽 참여
```

**초대 링크**
```
{BASE_URL}/clubs/join/ABC123
- 카카오톡, 문자 등으로 공유 가능
- 미가입자: 회원가입 → 자동 클럽 참여
- 기존 회원: 바로 클럽 참여
```

---

## 3. 데이터 모델 변경

### 3.1 users 테이블 변경

```
users (수정)
  - password_digest: NOT NULL → 컬럼 유지하되 소셜 전용 사용자는 비어있을 수 있음
  + nickname: string (소셜 닉네임, 표시 이름으로 사용)
  + avatar_url: string (null 가능, 소셜 프로필 이미지)
```

### 3.2 identities 테이블 (신규)

```
identities (신규)
  - user_id: integer (FK → users)
  - provider: string ('kakao', 'naver', 'google')
  - uid: string (소셜 서비스 고유 ID)
  - email: string (소셜 이메일)
  - name: string (소셜 닉네임)
  - avatar_url: string (소셜 프로필 사진)
  - created_at, updated_at
```

- `[provider, uid]` 유니크 인덱스
- `[user_id, provider]` 유니크 인덱스 (1 provider당 1 계정)

### 3.3 club_memberships 테이블 (신규)

```
club_memberships (신규)
  - user_id: integer (FK → users)
  - club_id: integer (FK → clubs)
  - role: string (default: 'member', 'owner' | 'admin' | 'member')
  - joined_at: datetime (가입 시점)
  - invited_by_id: integer (FK → users, null 가능)
  - created_at, updated_at
```

- `[user_id, club_id]` 유니크 인덱스

### 3.4 club_invitations 테이블 (신규)

```
club_invitations (신규)
  - club_id: integer (FK → clubs)
  - code: string (6자리 영숫자, 유니크)
  - created_by_id: integer (FK → users, 생성한 운영자)
  - expires_at: datetime (null이면 무제한)
  - max_uses: integer (null이면 무제한)
  - use_count: integer (default: 0)
  - created_at, updated_at
```

### 3.5 기존 관계 마이그레이션

- `clubs.user_id`는 유지 (클럽 원래 생성자 기록)
- 기존 데이터: 각 `clubs.user_id`에 대해 `ClubMembership(role: 'owner')` 자동 생성
- 기존 User의 `name`을 `nickname`으로 복사

---

## 4. 권한 매트릭스

| 기능 | owner | admin | member |
|------|:---:|:---:|:---:|
| 클럽 정보 수정 | O | O | X |
| 클럽 삭제 | O | X | X |
| 멤버 초대/추방 | O | O | X |
| 역할 변경 (승격/강등) | O | X | X |
| owner 양도 | O | X | X |
| 선수 CRUD | O | O | X |
| 경기 생성/수정/삭제 | O | O | X |
| 스코어보드 조작 | O | O | X |
| 팀 자동 밸런싱 | O | O | X |
| 통계 조회 | O | O | O |
| 경기 결과 조회 | O | O | O |
| 데이터 백업/복원 | O | X | X |
| 클럽 탈퇴 | X | O | O |

---

## 5. 기술 스택

### 5.1 추가 Gem

| Gem | 용도 |
|-----|------|
| `omniauth` | OAuth 프레임워크 |
| `omniauth-kakao` | 카카오 OAuth 전략 |
| `omniauth-naver` | 네이버 OAuth 전략 |
| `omniauth-google-oauth2` | 구글 OAuth 전략 |
| `omniauth-rails_csrf_protection` | CSRF 보호 |

### 5.2 환경변수 (추가)

```
KAKAO_CLIENT_ID=        # 카카오 REST API 키
KAKAO_CLIENT_SECRET=    # 카카오 Client Secret
NAVER_CLIENT_ID=        # 네이버 Client ID
NAVER_CLIENT_SECRET=    # 네이버 Client Secret
GOOGLE_CLIENT_ID=       # 구글 OAuth Client ID
GOOGLE_CLIENT_SECRET=   # 구글 OAuth Client Secret
```

---

## 6. 구현 순서 (Phase)

### Phase 1: 소셜 로그인 기반 구축
1. Gem 추가 및 OmniAuth 설정 (카카오, 네이버, 구글)
2. Identity 모델/마이그레이션 생성
3. User 모델 수정 (nickname, avatar_url 추가, password 조건부 검증)
4. OmniAuth 콜백 컨트롤러 구현
5. 로그인/회원가입 화면 UI (소셜 로그인 버튼)
6. 최초 가입 시 프로필 설정 화면
7. 계정 연결 로직 (동일 이메일 → 기존 계정에 Identity 추가)

### Phase 2: 역할 시스템
1. ClubMembership 모델/마이그레이션
2. 클럽 생성 시 owner 자동 부여
3. 기존 데이터 마이그레이션 (clubs.user_id → ClubMembership owner)
4. 클럽 접근 로직 변경 (`current_user.clubs` → ClubMembership 기반)
5. 역할별 권한 체크 concern 구현
6. 역할 변경 기능 (승격/강등/양도)

### Phase 3: 초대 시스템
1. ClubInvitation 모델/마이그레이션
2. 초대 코드 생성/관리 UI (운영자용)
3. 초대 코드 입력으로 클럽 참여
4. 초대 링크 (`/clubs/join/:code`) 참여
5. 미가입자 링크 접근 시 → 회원가입 → 자동 참여 플로우

### Phase 4: UI 통합
1. 클럽 목록에 역할 표시
2. 클럽이 없는 신규 유저 안내 ("클럽 만들기" / "초대 코드로 참여")
3. 권한별 UI 요소 표시/숨김
4. 클럽 설정 > 멤버 관리 화면 (역할 변경, 추방)
5. 프로필 > 연결된 소셜 계정 표시

---

## 7. 사전 준비 (사용자 필요)

- [ ] 카카오 개발자 앱 등록 (https://developers.kakao.com)
  - REST API 키, Redirect URI 설정
  - Redirect URI: `{BASE_URL}/auth/kakao/callback`
  - 이메일 필수 동의 항목 설정
  - 비즈니스 앱 등록 시 동의항목 추가 가능
- [ ] 네이버 개발자 앱 등록 (https://developers.naver.com)
  - Client ID, Client Secret
  - Redirect URI: `{BASE_URL}/auth/naver/callback`
  - 필수 제공 정보: 이메일, 이름
- [ ] 구글 OAuth 클라이언트 등록 (https://console.cloud.google.com)
  - Client ID, Client Secret
  - Redirect URI: `{BASE_URL}/auth/google_oauth2/callback`
- [ ] Railway/Render 환경변수 설정

---

## 8. 리스크 및 고려사항

| 리스크 | 대응 방안 |
|--------|----------|
| 소셜 로그인 사용자 password 없음 | `has_secure_password` 조건부 적용, `password_digest` nullable |
| 동일 이메일 충돌 | 이메일 기준 기존 계정에 Identity 추가 연결 |
| 기존 클럽 데이터 마이그레이션 | `clubs.user_id` 유지 + ClubMembership(owner) 자동 생성 |
| 클럽 접근 로직 전면 변경 | `current_user.clubs` 쿼리를 ClubMembership 기반으로 교체 |
| OAuth 키 관리 | 환경변수로 관리 (코드에 노출 금지) |
| 카카오 이메일 미제공 케이스 | 필수 동의 항목 설정 또는 이메일 입력 폼 제공 |
| 소셜 서비스별 앱 심사/승인 기간 | 개발 단계에서는 테스트 모드 사용, 배포 전 심사 신청 |

---

## 9. 범위 밖 (Out of Scope)

- Apple 로그인 (Apple Developer Program 유료 가입 필요, 향후 App Store 정책 대비 시 추가)
- 이메일/비밀번호 회원가입 (소셜 로그인으로 통일, 기존 사용자는 소셜 계정 연결 유도)
- 이메일 인증/비밀번호 재설정
- 클럽 간 멤버 이전
