# 리팩토링 판단 기록

## 분할 전략 결정

### 1. application.js 분할 방식
**판단**: Stimulus 컨트롤러가 아닌, `<script>` 태그 직접 로드 방식 유지
**근거**:
- 프로젝트가 importmap을 사용하지 않음 (`<script>` 태그로 직접 로드)
- Stimulus는 flash_controller, scoreboard_controller만 사용 중
- 스코어보드 클라이언트는 4,300줄 규모의 IIFE/클로저 패턴으로, Stimulus로 전환하면 로직 변경이 불가피
- **작업 규칙에 "분할만 하고 로직 변경은 하지 마"라고 명시**

**결정**:
- 스코어보드 클라이언트는 단일 파일로 유지 (내부 함수들이 클로저로 강하게 결합)
- 독립적인 기능(정렬, 드래그앤드롭, 사이드바)만 별도 파일로 분리
- Propshaft를 통해 `app/assets/javascripts/` 에서 직접 서빙

### 2. 스코어보드 클라이언트 분할 여부
**판단**: 내부 분할하지 않고 단일 파일로 유지
**근거**:
- 4,300줄의 스코어보드 코드가 하나의 `if (scoreboardRoot)` 블록 내 클로저로 작성됨
- 모든 함수가 `state`, `matchupSlots()` 등 공유 변수/함수에 의존
- ES 모듈(import/export)을 사용하지 않는 프로젝트 구조에서 이를 분리하면 전역 변수 노출 필요
- 분리 시 로직 변경이 불가피 → 작업 규칙 위반

### 3. 뷰 인라인 JS 처리 방식
**판단**: ERB 변수를 사용하는 인라인 JS는 Stimulus 컨트롤러로 완전 추출하지 않음
**근거**:
- `<%= j t('...') %>`, `<%= raw(...) %>` 같은 ERB 보간이 인라인 JS에 포함
- Stimulus로 추출하면 data-attribute로 변환해야 하는데, 이는 로직 변경에 해당
- 대신 인라인 JS 중 ERB 의존이 없는 순수 JS 부분만 별도 파일로 추출 가능

### 4. matches_controller.rb 분할 방식
**판단**: 점수 관련 액션을 concern으로 추출
**근거**:
- 704줄 중 점수 관련 액션(save_game_scores, save_quarter_scores, update_scores, finish_match, reset_all_scores)이 약 250줄
- 멤버 관리 액션(move_member, add_member, remove_member)이 약 60줄
- 게임 관리 액션(add_game, remove_game)이 약 60줄
- 각각 독립적인 도메인 로직으로 concern 추출 적합

### 5. 100~200줄 컨트롤러 처리
**판단**: members_controller(159), clubs_controller(132), settings_controller(127)은 분할하지 않음
**근거**:
- 작업 지시에 "컨트롤러나 모델이 200줄 이상이면" 분할하라고 명시
- 200줄 미만이므로 분할 대상에서 제외

### 6. 모델 분할
**판단**: 모든 모델이 100줄 미만이므로 분할 불필요
**근거**: 가장 큰 match.rb도 73줄
