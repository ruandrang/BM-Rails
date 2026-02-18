# 리팩토링 완료 리포트

## 작업일: 2026-02-19

---

## 1. 분할한 파일 목록

### JavaScript 분할 (application.js → 5개 파일)

| Before | After | 줄 수 | 설명 |
|--------|-------|--------|------|
| application.js (4,689줄) | application.js | 4,382줄 | 스코어보드 클라이언트 + 공통 유틸리티 |
| ↑ | list_sort.js | 65줄 | 리스트 정렬 (initSortableList) |
| ↑ | drag_and_drop.js | 206줄 | 팀 멤버 드래그 앤 드롭 |
| ↑ | sidebar.js | 41줄 | 사이드바 토글 |

### 뷰 인라인 JS → 외부 파일 추출

| Before | After | 줄 수 | 설명 |
|--------|-------|--------|------|
| control.html.erb (인라인 231줄) | scoreboard_control_ui.js | 238줄 | 컨트롤 UI 상호작용 |
| display.html.erb (인라인 142줄) | scoreboard_display_ui.js | 142줄 | 전광판 디스플레이 UI |

### Ruby 분할 (matches_controller.rb → 4개 파일)

| Before | After | 줄 수 | 설명 |
|--------|-------|--------|------|
| matches_controller.rb (704줄) | matches_controller.rb | 342줄 | 기본 CRUD + 팀 셔플 |
| ↑ | concerns/match_scoring.rb | 230줄 | 점수 저장/수정/리셋/경기종료 |
| ↑ | concerns/match_membership.rb | 69줄 | 멤버 이동/추가/삭제 |
| ↑ | concerns/match_games.rb | 70줄 | 게임 추가/삭제 |

---

## 2. 줄 수 변화 요약

| 파일 | Before | After | 변화 |
|------|--------|-------|------|
| application.js | 4,689 | 4,382 | -307 (7% 감소) |
| matches_controller.rb | 704 | 342 | -362 (51% 감소) |
| control.html.erb 인라인 JS | 231 | 0 | -231 (100% 제거) |
| display.html.erb 인라인 JS | 142 | 0 | -142 (100% 제거) |

### 새로 생성된 파일 (총 7개)
- `app/assets/javascripts/list_sort.js` (65줄)
- `app/assets/javascripts/drag_and_drop.js` (206줄)
- `app/assets/javascripts/sidebar.js` (41줄)
- `app/assets/javascripts/scoreboard_control_ui.js` (238줄)
- `app/assets/javascripts/scoreboard_display_ui.js` (142줄)
- `app/controllers/concerns/match_scoring.rb` (230줄)
- `app/controllers/concerns/match_membership.rb` (69줄)
- `app/controllers/concerns/match_games.rb` (70줄)

---

## 3. 검증 결과

| 검사 항목 | 결과 |
|-----------|------|
| `bin/rails assets:precompile` | 통과 |
| `bin/rubocop` (80파일) | 위반 없음 |
| `bin/brakeman` | 경고 1개 (기존 경고, 변경 무관) |
| 기능 보존 확인 | 20개 public 액션 전부 유지 |

---

## 4. 분할하지 않은 항목과 사유

### application.js 스코어보드 클라이언트 (4,382줄)
- 하나의 클로저(`if (scoreboardRoot)`) 내 모든 함수가 공유 변수(`state`, `matchupSlots()` 등)에 의존
- ES 모듈(import/export)을 사용하지 않는 프로젝트 구조에서 분리하면 전역 변수 노출 필요
- "분할만 하고 로직 변경은 하지 마" 규칙에 따라 유지

### matches/new.html.erb 인라인 JS (251줄)
- ERB 보간 4곳 (`<%= j t('...') %>`)으로 i18n 키를 JS에 주입
- 분리하면 data-attribute 방식으로 전환 필요 → 로직 변경에 해당

### settings/show.html.erb 인라인 JS (139줄)
- ERB 보간 11곳으로 Rails 상수/번역을 JS에 주입
- 분리하면 data-attribute 방식으로 전환 필요 → 로직 변경에 해당

### 100~200줄 컨트롤러 (members, clubs, settings)
- 200줄 미만으로 분할 기준 미달

### 모델 파일
- 가장 큰 match.rb도 73줄로 분할 불필요

---

## 5. 추가로 개선하면 좋을 점

1. **application.js ES 모듈화**: importmap 또는 번들러(esbuild) 도입 후 스코어보드 클라이언트를 모듈로 분리하면 4,300줄 파일을 10개 이상의 모듈로 나눌 수 있음
2. **인라인 JS의 Stimulus 전환**: ERB 의존 인라인 JS(matches/new, settings/show)를 data-attribute + Stimulus 컨트롤러로 전환하면 뷰 파일 가독성 향상
3. **brakeman 경고 수정**: admin/users_controller.rb에서 `:admin` mass assignment 경고 해결 (별도 admin_params 등)
4. **scoreboard_channel.rb 분리**: ScoreboardStore 클래스(156줄 중 약 80줄)를 `app/models/scoreboard_store.rb`로 분리 가능
