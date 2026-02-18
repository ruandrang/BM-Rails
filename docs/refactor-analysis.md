# 리팩토링 현재 상태 분석

## 분석 일자: 2026-02-19

---

## 1. JavaScript 파일 분석

### app/assets/javascripts/
| 파일 | 줄 수 | 분할 대상 | 역할 |
|------|--------|-----------|------|
| **application.js** | **4,689** | **YES** | 메인 JS: 스코어보드 클라이언트, 타이머, ActionCable, 정렬, 드래그앤드롭, 사이드바 등 모든 기능 |
| sortable.min.js | 1 | NO | SortableJS 라이브러리 (외부) |

### app/javascript/controllers/ (Stimulus)
| 파일 | 줄 수 | 분할 대상 | 역할 |
|------|--------|-----------|------|
| scoreboard_controller.js | 91 | NO | Stimulus 스코어보드 컨트롤러 (기본 타이머/점수) |
| flash_controller.js | 22 | NO | 플래시 메시지 자동 숨김 |

### 뷰 인라인 JS (50줄 이상)
| 파일 | 인라인 JS 줄 수 | 분할 대상 | 역할 |
|------|-----------------|-----------|------|
| **matches/new.html.erb** | **251** | **YES** | 팀 생성 폼: 색상 선택, 멤버 선택, 게임 수 동적 UI |
| **scoreboards/control.html.erb** | **231** | **YES** | 스코어보드 조작: 음성 토글, 섹션 접기, 색상 동기화 |
| **scoreboards/display.html.erb** | **142** | **YES** | 전광판 디스플레이: 팀 색상 매핑, ActionCable 구독 |
| **settings/show.html.erb** | **139** | **YES** | 설정 UI: 음성 미리듣기, 토글 동작, 로케일 동기화 |

---

## 2. Ruby 파일 분석

### app/controllers/
| 파일 | 줄 수 | 분할 대상 | 역할 |
|------|--------|-----------|------|
| **matches_controller.rb** | **704** | **YES** | 경기 CRUD, 점수 저장, 팀 셔플, 멤버 이동/추가/삭제, 경기 종료 |
| members_controller.rb | 159 | YES | 선수 CRUD, CSV import/export, 정렬 |
| clubs_controller.rb | 132 | YES | 클럽 CRUD, JSON 백업/복원 |
| settings_controller.rb | 127 | YES | 사용자 설정 CRUD |
| admin/dashboard_controller.rb | 74 | NO | 관리자 대시보드 |
| application_controller.rb | 66 | NO | 기본 컨트롤러 (인증, 로케일) |
| scoreboards_controller.rb | 61 | NO | 스코어보드 control/display 액션 |
| admin/users_controller.rb | 58 | NO | 관리자 사용자 관리 |
| admin/members_controller.rb | 47 | NO | 관리자 멤버 관리 |
| admin/clubs_controller.rb | 43 | NO | 관리자 클럽 관리 |
| stats_controller.rb | 39 | NO | 통계 대시보드 |
| admin/matches_controller.rb | 36 | NO | 관리자 경기 관리 |
| admin/teams_controller.rb | 31 | NO | 관리자 팀 관리 |
| admin/games_controller.rb | 31 | NO | 관리자 게임 관리 |
| sessions_controller.rb | 25 | NO | 로그인/로그아웃 |
| registrations_controller.rb | 25 | NO | 회원가입 |
| concerns/member_stats_cacheable.rb | 24 | NO | 통계 캐시 모듈 |
| admin/base_controller.rb | 24 | NO | 관리자 기본 컨트롤러 |
| admin/team_members_controller.rb | 9 | NO | 관리자 팀멤버 관리 |

### app/models/
| 파일 | 줄 수 | 분할 대상 | 역할 |
|------|--------|-----------|------|
| match.rb | 73 | NO | 경기 모델 (상태, 밸리데이션) |
| user.rb | 61 | NO | 사용자 모델 (설정 상수) |
| team.rb | 53 | NO | 팀 모델 (색상, 라벨) |
| club.rb | 41 | NO | 클럽 모델 |
| game.rb | 37 | NO | 게임 모델 (결과 판정) |
| member.rb | 32 | NO | 선수 모델 (포지션) |
| team_member.rb | 6 | NO | 조인 테이블 |
| application_record.rb | 3 | NO | 기본 레코드 |

### app/services/
| 파일 | 줄 수 | 분할 대상 | 역할 |
|------|--------|-----------|------|
| club_importer.rb | 172 | NO | JSON 복원 (200줄 미만) |
| club_exporter.rb | 57 | NO | JSON 백업 |
| team_balancer.rb | 56 | NO | 팀 자동 배정 |
| stats_calculator.rb | 54 | NO | 통계 집계 |
| user_importer.rb | 37 | NO | 사용자 데이터 복원 |
| user_exporter.rb | 12 | NO | 사용자 데이터 백업 |

### app/channels/
| 파일 | 줄 수 | 분할 대상 | 역할 |
|------|--------|-----------|------|
| scoreboard_channel.rb | 156 | NO | WebSocket 채널 + ScoreboardStore 클래스 |

---

## 3. 분할 대상 요약

### 최우선 분할 대상
1. **app/assets/javascripts/application.js** (4,689줄) — 가장 큰 파일, 7개 이상의 기능이 혼재
2. **matches_controller.rb** (704줄) — 15개 액션이 하나의 컨트롤러에 집중

### 뷰 인라인 JS 추출 대상
3. **matches/new.html.erb** (인라인 JS 251줄)
4. **scoreboards/control.html.erb** (인라인 JS 231줄)
5. **scoreboards/display.html.erb** (인라인 JS 142줄)
6. **settings/show.html.erb** (인라인 JS 139줄)

---

## 4. application.js 기능별 구조 분석

| 줄 범위 | 기능 | 분리 후보 파일명 |
|---------|------|----------------|
| 1-11 | 유틸리티 (escapeHtml) | utils.js |
| 13-74 | 리스트 정렬 (initSortableList) | list_sort.js |
| 76-109 | 공통 UI (플래시 메시지, 카드 클릭) | common_ui.js |
| 113-4441 | 스코어보드 클라이언트 전체 | scoreboard_client.js |
| 4444-4649 | 드래그 앤 드롭 (initDragAndDrop) | drag_and_drop.js |
| 4651-4689 | 사이드바 토글 | sidebar.js |

### 스코어보드 클라이언트 내부 세부 구조 (113-4441줄)
| 줄 범위 | 기능 | 분리 후보 |
|---------|------|----------|
| 117-172 | 파서 유틸리티 (parseJsonDataset 등) | scoreboard/parsers.js |
| 174-994 | i18n 번역 데이터 | scoreboard/i18n.js |
| 995-1054 | i18n 헬퍼 함수 | scoreboard/i18n.js |
| 1054-1100 | 초기화 변수, clientId | scoreboard/state.js |
| 1103-1270 | 포맷터, 색상 유틸리티 | scoreboard/formatters.js |
| 1270-1530 | 매치업 슬롯 관리 | scoreboard/matchup.js |
| 1537-1650 | 상태 관리 (defaultState, normalizeState) | scoreboard/state.js |
| 1650-1825 | 쿼터/포제션/로테이션 로직 | scoreboard/rotation.js |
| 1825-2660 | UI 렌더링 (render, renderTeams 등) | scoreboard/renderer.js |
| 2660-2830 | 타이머 로직 | scoreboard/timer.js |
| 2830-3050 | 타이머 시작/정지/동기화 | scoreboard/timer.js |
| 3050-3280 | 음성/TTS | scoreboard/voice.js |
| 3280-3370 | 점수 설정/매치업 추가 | scoreboard/score.js |
| 3370-4440 | 이벤트 핸들러 (attachControlHandlers) | scoreboard/handlers.js |

---

## 5. 의존 관계

### application.js 내부 의존
- `escapeHtml`: 스코어보드 렌더링에서 사용
- `initSortableList`: matches/new, members/index, stats/index 뷰에서 사용
- 스코어보드 클라이언트: `[data-scoreboard-root]` 요소가 있을 때만 초기화
- `initDragAndDrop`: matches/show 뷰에서 사용 (SortableJS 의존)
- 사이드바: 모든 페이지에서 사용

### 뷰 인라인 JS 의존
- matches/new: i18n 번역 키 (ERB로 주입)
- scoreboards/control: 스코어보드 state 객체 접근
- scoreboards/display: ActionCable 채널 구독, 팀 색상 매핑
- settings/show: Rails 상수 (ERB로 주입), speechSynthesis API

### Ruby 파일 의존
- matches_controller.rb → TeamBalancer, MemberStatsCacheable concern
- matches_controller.rb → ScoreboardStore (Rails.cache)
- scoreboard_channel.rb → ScoreboardStore (같은 파일 내 정의)
