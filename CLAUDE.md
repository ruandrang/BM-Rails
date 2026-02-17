# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

농구 클럽 관리 웹 애플리케이션 (BM-Rail)
- **프레임워크**: Ruby on Rails 8.1.2
- **Ruby 버전**: 3.3.5 (rbenv)
- **데이터베이스**: SQLite3
- **에셋 파이프라인**: Propshaft (Sprockets 아님)
- **프론트엔드**: Tailwind CSS v4 + DaisyUI v5 (plugin via `@plugin "daisyui"`)
- **JS**: Stimulus.js + 바닐라 JS (importmap 미사용, `app/assets/javascripts/application.js`에서 직접 작성)
- **배포**: Kamal (Docker 기반)
- **테스트**: 테스트 프레임워크 미설정 (`rails/test_unit/railtie` 비활성화)

## 주요 명령어

```bash
# 개발 서버 실행 (Puma + Tailwind 워처 동시 실행)
bin/dev

# 데이터베이스
bin/rails db:create db:migrate
bin/rails db:reset              # 초기화 후 재마이그레이션

# 린트
bin/rubocop                     # Ruby 코드 스타일 검사
bin/rubocop -a                  # 자동 수정

# 보안 검사
bin/brakeman --no-pager         # 정적 보안 분석
bin/bundler-audit               # 의존성 보안 감사

# CI (보안 스캔 + 린트 한번에)
bin/ci
```

## 아키텍처

### 모델 관계도

```
User (1)
  └── Clubs (N)

Club (1)
  ├── Members (N)      # 선수 명단
  └── Matches (N)      # 경기 목록

Match (1)
  ├── Teams (2~3)      # 팀 (2팀 or 3팀전)
  └── Games (N)        # 개별 게임 결과

Team (1)
  └── TeamMembers ──── Members (N:N 조인)
```

### 서비스 객체 (app/services/)

| 서비스 | 역할 |
|--------|------|
| `TeamBalancer` | 포지션 균형 + 승률 기반 팀 자동 배정 (5경기 미만은 승률 0.5 기본값) |
| `StatsCalculator` | 선수별 승/패/무/승률 통계 집계 |
| `ClubExporter` | 클럽 데이터 JSON 내보내기 |
| `ClubImporter` | 클럽 데이터 JSON 가져오기 |

### User 설정 상수 (`app/models/user.rb`)

| 상수 | 설명 |
|------|------|
| `SUPPORTED_LOCALES` | 지원 언어 목록 (10개) |
| `DEFAULT_GAME_MINUTES` | 기본 경기 시간 (8분) |
| `MIN/MAX_GAME_MINUTES` | 경기 시간 범위 (1~60분) |
| `POSSESSION_SWITCH_PATTERNS` | 공격방향 전환 패턴 (`q12_q34`, `q13_q24`) |
| `VOICE_ANNOUNCEMENT_RATES` | 음성 속도 (0.9, 1.0, 1.1) |

### 도메인 로직

- **Match 생성 흐름** (`MatchesController#create`): 선수 선택 → `TeamBalancer`로 자동 배정 → 팀 생성 → `teams.combination(2)`로 모든 대전 Game 자동 생성 (트랜잭션)
- **3팀전**: teams_count=3일 때 Game 3개 (A vs B, A vs C, B vs C), 2팀전이면 Game 1개
- **Game 결과**: `pending` → `home_win` / `away_win` / `draw` (수동 기록)
- **포지션**: PG, SG, SF, PF, C (Member::POSITIONS 상수)
- **팀 색상**: White, Black, Red, Blue, Yellow, Green (Team::COLORS 상수)

### 실시간 스코어보드 시스템

ActionCable 기반 실시간 점수판 기능이 있으며, 두 가지 화면으로 구성:
- **Control** (`scoreboards#control`): 점수/타이머 조작 화면 (조작자용)
- **Display** (`scoreboards#display`): 전광판 디스플레이 (별도 레이아웃 `scoreboard_display.html.erb` 사용)
- **ScoreboardChannel**: WebSocket 채널, `ScoreboardStore`(Rails.cache 기반, 24시간 TTL)로 상태 관리
- `ScoreboardStore` 클래스는 `app/channels/scoreboard_channel.rb` 파일 내에 함께 정의됨
- 스트림 이름: `scoreboard:#{match_id}`
- ActionCable 어댑터: 개발=async, 프로덕션=Redis (`config/cable.yml`)

### 레이아웃 구조

- `application.html.erb`: DaisyUI drawer 패턴 (사이드바 + 메인 콘텐츠), `data-theme="basketball"` 사용
- `scoreboard_display.html.erb`: 전광판 전용 미니멀 레이아웃 (검정 배경, 스크롤 숨김)
- `share.html.erb`: 경기 결과 공유 전용 레이아웃

### JavaScript 구조

Stimulus + 바닐라 JS 혼합 사용 (importmap 미사용, `<script>` 태그로 직접 로드):
- `app/javascript/controllers/scoreboard_controller.js`: Stimulus 컨트롤러 (기본 타이머/점수)
- `app/assets/javascripts/application.js`: 바닐라 JS (카드 클릭, 드래그 정렬, ActionCable 스코어보드 클라이언트 등)
- 새 JS 기능 추가 시 `application.js`의 `DOMContentLoaded` 이벤트 리스너 내에 작성

### 주요 라우트 구조

```
/                                          → 클럽 목록 (홈)
/clubs/:club_id/members                    → 선수 관리 (CSV import/export, reorder)
/clubs/:club_id/matches                    → 경기 관리
/clubs/:club_id/matches/:id/scoreboard     → 점수판 컨트롤
/clubs/:club_id/matches/:id/scoreboard_display → 전광판 디스플레이
/clubs/:club_id/stats                      → 통계 대시보드
/clubs/:id/export_json, import_json        → 클럽 데이터 백업/복원
/admin                                     → 관리자 패널 (읽기 전용)
```

## 인증/인가

- **인증**: 세션 기반 (bcrypt `has_secure_password`)
- **인가**: `users.admin` 플래그로 관리자 구분
- `ApplicationController`에서 `before_action :require_login` 전역 적용
- `sessions#new`, `registrations#new`는 로그인 불필요 (`skip_before_action` 처리)
- Admin 컨트롤러는 `Admin::BaseController`에서 `require_admin` 적용
- **Rate limiting**: 로그인 시도 분당 10회 제한 (`SessionsController#create`)
- **공유 화면**: `matches#share`는 비로그인 허용 + 토큰 검증

## 코드 컨벤션

- **Ruby 스타일**: rubocop-rails-omakase (Rails 공식 권장, `.rubocop.yml`에서 상속)
- **뷰**: ERB 템플릿 + Tailwind/DaisyUI 클래스
- **Active Storage / Action Mailbox / Action Text**: 비활성화 상태 (`config/application.rb`)

## 다국어 지원 (i18n)

- **지원 언어**: ko(한국어, 기본), ja, en, zh, fr, es, it, pt, tl, de — 총 10개 언어
- **로케일 파일**: `config/locales/*.yml`
- **사용자 언어 설정**: `User#preferred_locale` 컬럼, 세팅 페이지에서 변경 가능
- **음성 로케일 매핑**: `User::SPEECH_LOCALE_BY_PREFERRED_LOCALE` (예: `ko → ko-KR`, `en → en-US`)
- **번역 키 구조**: `auth.*`, `common.*`, `menu.*`, `settings.*` 등 네임스페이스 기반
- **Fallback**: 번역 키 없으면 한국어(`:ko`)로 폴백 (`config/application.rb`)

### 번역 추가 시 주의사항
- 모든 10개 로케일 파일에 동일한 키 구조 유지 필요
- `ApplicationController#set_locale`에서 `current_user.preferred_locale` 기반으로 `I18n.locale` 설정

## 개발 시 참고사항

- `bin/dev` 실행 시 Procfile.dev에 정의된 웹서버(Puma)와 Tailwind 워처가 동시에 실행됨
- Tailwind CSS는 `app/assets/tailwind/application.css`에서 설정 (`@import "tailwindcss"; @plugin "daisyui";`)
- CSS 빌드 결과물은 `app/assets/builds/tailwind.css`에 출력됨
- 한글 CSV 처리 시 UTF-8 BOM 인코딩 필요
- CI는 GitHub Actions로 `scan_ruby`(brakeman + bundler-audit)와 `lint`(rubocop) 두 job 실행
- 모든 리소스는 `current_user` 스코프로 접근 (예: `current_user.clubs.find(params[:club_id])`) — 타인의 데이터에 접근 불가
- 캐시: `StatsCalculator` 결과를 `Rails.cache`로 5분 TTL 캐싱 (`club_#{id}_member_stats`)
