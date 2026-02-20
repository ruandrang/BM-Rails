# Design: scoreboard-improvement (전광판 종합 고도화)

## 참조 문서
- Plan: `docs/01-plan/features/scoreboard-improvement.plan.md`

## 현재 구조 분석

### 파일 구조
```
Views:
  app/views/scoreboards/display.html.erb       # Display UI (어두운 테마)
  app/views/scoreboards/control.html.erb       # Control UI (밝은 테마)
  app/views/layouts/scoreboard_display.html.erb # Display 전용 레이아웃
  app/views/scoreboards/index.html.erb         # 스코어보드 목록
  app/views/scoreboards/_keyboard_shortcuts.html.erb # 키보드 단축키 패널

JS:
  app/assets/javascripts/application.js          # 코어 로직 (상태, ActionCable, 타이머)
  app/assets/javascripts/scoreboard_display_ui.js # Display 전용 UI (스케일, 공격방향, 파울뱃지)

CSS:
  app/assets/tailwind/application.css            # Tailwind + DaisyUI + 커스텀 클래스

Controller:
  app/controllers/scoreboards_controller.rb      # index, control, display, standalone 액션
```

### 현재 Display 레이아웃 (display.html.erb)
```
┌──────────────────────────────────────────────────┐
│ Header: [LIVE] ─── Basketball ─── [1Q][±][Full]  │ h-28
├──────────────────────────────────────────────────┤
│                                                  │
│  [Team A]          Game Clock          [Team B]  │
│   ● name           10:00                name ●   │
│   ─ bar ─                              ─ bar ─   │
│                                                  │
│    00            Possession              00      │ text-score
│                  ◄  ►                            │
│                                                  │
│  Fouls ●●●●●    Shot Clock    Fouls ●●●●●       │
│                    24                            │ text-[160px]
│                                                  │
├──────────────────────────────────────────────────┤
│ Sponsor: [만포] [홍콩] [마포YC] [B.PAPER] [대루]  │ h-auto
└──────────────────────────────────────────────────┘
```

### 현재 CSS 사이징 시스템
- `--display-scale`: 60%~140% (localStorage 저장, scoreboard_display_ui.js 제어)
- `.text-score`: `calc(clamp(10rem, 22vw, 18rem) * var(--display-scale))`
- `.text-clock`: `calc(clamp(6rem, 12vw, 10rem) * var(--display-scale))`
- `[data-scoreboard-shot]`: `calc(clamp(8rem, 18vw, 14rem) * var(--display-scale))`
- 팀명: `text-4xl md:text-5xl`
- 파울 원: `w-6 h-6`

### 현재 JS 상태 구조 (application.js)
```javascript
state = {
  quarter, period_seconds, shot_seconds, running, shot_running,
  home_score, away_score, home_fouls, away_fouls,
  possession, teams, matchup_index, games,
  voice_enabled, sound_enabled, voice_lang, voice_rate,
  state_version, updated_at_ms,
  // Display 전용: main_ref_at_ms, main_ref_value, shot_ref_at_ms, shot_ref_value
}
```

### 현재 ActionCable 통신
- 채널: `ScoreboardChannel` (stream: `scoreboard:#{match_id}`)
- 저장소: `ScoreboardStore` (Rails.cache, 24h TTL)
- 충돌 해결: `state_version` + `updated_at_ms` 비교
- 어댑터: async (단일 프로세스)

### 현재 문제점 (상세)
1. **Display 사이즈 고정**: 대형 TV(65"+) 전용 레이아웃만 존재
2. **모바일 Display 미지원**: 가로 3-column 고정, 세로 모드 대응 없음
3. **팀 색상 활용 부족**: 컬러 인디케이터(●)와 bar만 사용, 점수 영역에 활용 안 됨
4. **파울 시각화 약함**: 작은 원(w-6 h-6)으로 멀리서 안 보임
5. **Control 모바일 UX**: 점수 버튼(+1/+2/+3)이 작고, 확인 다이얼로그 없음
6. **스폰서 하드코딩**: `<img src="/manpo.png">` 등 5개 직접 입력

---

## Phase 1: Display UI 리디자인

### 1.1 색상 시스템 개선

#### 배경색 체계
| 영역 | 현재 | 변경 |
|------|------|------|
| 전체 배경 | `#0B1120` | `#0A0E1A` (더 깊은 네이비) |
| 헤더 | `#131B2E` | `#111827` (gray-900) |
| 스폰서 영역 | `#131B2E` | `#111827` |
| 샷클락 패널 | `#131B2E/30` | `rgba(17,24,39,0.6)` + `backdrop-blur-sm` |

#### 점수 색상 → 팀 색상 적용
- 현재: 양팀 모두 `text-[#FF6B00]` (오렌지)
- 변경: 각 팀의 `team.color`에 매핑된 색상 사용

```
팀 색상 → 점수 색상 매핑:
  White  → #FFFFFF (흰색, text-shadow로 가독성 확보)
  Black  → #E5E7EB (밝은 회색, 배경과 구분)
  Red    → #EF4444
  Blue   → #3B82F6
  Yellow → #FACC15
  Green  → #22C55E
```

CSS 구현:
```css
[data-score-left] { color: var(--team-left-color, #FF6B00); }
[data-score-right] { color: var(--team-right-color, #FF6B00); }
```

JS 연동 (scoreboard_display_ui.js):
```javascript
// render 시 팀 색상을 CSS 변수로 설정
root.style.setProperty('--team-left-color', TEAM_COLOR_MAP[leftTeam.color]);
root.style.setProperty('--team-right-color', TEAM_COLOR_MAP[rightTeam.color]);
```

#### 팀 영역 배경 그라데이션
현재: 투명 배경
변경: 팀 색상의 10% 불투명도 그라데이션

```html
<!-- Left Team 영역 -->
<div class="flex-1 ... relative">
  <div class="absolute inset-0 bg-gradient-to-r from-[var(--team-left-color)]/10 to-transparent pointer-events-none"></div>
  <!-- 기존 콘텐츠 -->
</div>
```

### 1.2 점수 폰트 개선

#### 7-segment 폰트 적용 (미적용 확정)
현재: 시스템 기본 폰트 (font-black) → 유지
결정: DSEG7 폰트는 @font-face만 유지하고, 실제 적용은 보류 (가독성 테스트 후 결정)
text-shadow glow 효과는 팀 색상 기반으로 적용 완료

```css
.text-score {
  font-family: 'DSEG7', 'Pretendard Variable', sans-serif;
  font-size: calc(clamp(10rem, 22vw, 18rem) * var(--display-scale));
  text-shadow: 0 0 30px currentColor, 0 0 60px color-mix(in srgb, currentColor 30%, transparent);
}

.text-clock {
  font-family: 'DSEG7', 'Pretendard Variable', sans-serif;
  font-size: calc(clamp(6rem, 12vw, 10rem) * var(--display-scale));
  text-shadow: 0 0 20px rgba(255,255,255,0.3);
}
```

### 1.3 게임 클럭 시각적 강조

#### 타이머 진행 중 애니메이션
```css
/* 타이머 실행 중일 때 glow 효과 */
[data-scoreboard-timer].running {
  text-shadow: 0 0 30px rgba(255,255,255,0.5), 0 0 60px rgba(255,255,255,0.2);
  animation: clock-glow 2s ease-in-out infinite;
}

@keyframes clock-glow {
  0%, 100% { text-shadow: 0 0 30px rgba(255,255,255,0.5); }
  50% { text-shadow: 0 0 50px rgba(255,255,255,0.7), 0 0 80px rgba(255,255,255,0.3); }
}

/* 타이머 정지 시 흐릿한 상태 */
[data-scoreboard-timer]:not(.running) {
  opacity: 0.7;
}
```

JS 연동: `render()` 함수에서 `state.running`에 따라 `running` 클래스 토글

### 1.4 파울 인디케이터 개선

#### 현재 → 개선
- 현재: `w-6 h-6` 원 (멀리서 안 보임)
- 변경: `w-8 h-8` 원 + 채워진 파울은 배경 빨간색 + scale 애니메이션

```html
<!-- 파울 원: 활성화 시 -->
<div class="w-8 h-8 rounded-full border-2 border-red-500 transition-all duration-300"
     data-foul-circle="0"
     data-foul-active="false">
</div>
```

```css
[data-foul-active="true"] {
  background-color: #EF4444;
  border-color: #EF4444;
  box-shadow: 0 0 12px rgba(239, 68, 68, 0.6);
  transform: scale(1.1);
}
```

### 1.5 쿼터 정보 개선

#### 쿼터 배지 강조
```html
<div class="bg-gradient-to-r from-orange-500 to-red-500 text-white text-3xl font-black
            px-10 py-5 rounded-xl shadow-lg uppercase tracking-wider">
  <span data-scoreboard-quarter>1</span>Q
</div>
```

### 1.6 헤더 간소화

현재 헤더가 h-28로 상당한 높이 차지. 아래로 변경:
- 높이: `h-28` → `h-20`
- "Basketball" 텍스트 제거 (불필요)
- LIVE 인디케이터 + 쿼터 배지 + 크기 조절 + 전체화면을 한 줄에 배치
- 폰트 크기 약간 축소

---

## Phase 2: 반응형 Display (멀티 사이즈)

### 2.1 브레이크포인트 정의

| 이름 | 화면 폭 | 대상 기기 | 방향 |
|------|---------|-----------|------|
| Large | 1280px+ | 65"+ TV, 프로젝터, 대형 모니터 | 가로 |
| Medium | 768px ~ 1279px | 태블릿, 노트북 | 가로 |
| Small | < 768px | 스마트폰 | 세로 |

### 2.2 Large (1280px+) - 현재와 유사

기존 가로 3-column 유지하되 Phase 1 디자인 적용:
```
┌──────────────────────────────────────────────────┐
│ [LIVE]    [1Q]    [±] [Full]                     │ h-20
├──────────────────────────────────────────────────┤
│  [Left Team]    [Clock/Shot]     [Right Team]    │
│   TeamName       10:00            TeamName       │
│     00         ◄Poss►               00          │
│  Fouls ●●●●●     24            Fouls ●●●●●      │
├──────────────────────────────────────────────────┤
│ [Sponsor Area - 가로 나열]                        │
└──────────────────────────────────────────────────┘
```

### 2.3 Medium (768px ~ 1279px) - 컴팩트 가로

점수 영역 축소, 샷클락을 게임 클럭 옆에 배치:
```
┌────────────────────────────────────────┐
│ [LIVE] [1Q]              [±] [Full]    │ h-16
├────────────────────────────────────────┤
│  [Left]   Clock  Shot   [Right]       │
│  TeamA    08:42   14    TeamB         │
│   45     ◄Poss►          38          │
│  ●●●○○               ●●○○○          │
├────────────────────────────────────────┤
│ [Sponsor - 축소/일부 숨김]              │
└────────────────────────────────────────┘
```

CSS 변경 사항:
```css
@media (max-width: 1279px) and (min-width: 768px) {
  .text-score { font-size: calc(clamp(6rem, 14vw, 10rem) * var(--display-scale)); }
  .text-clock { font-size: calc(clamp(4rem, 8vw, 7rem) * var(--display-scale)); }
  [data-scoreboard-shot] { font-size: calc(clamp(5rem, 10vw, 8rem) * var(--display-scale)) !important; }
}
```

### 2.4 Small (< 768px) - 세로 모드

스마트폰에서 세로로 보는 레이아웃:
```
┌─────────────────────┐
│ [LIVE] [1Q]  [Full] │ h-14
├─────────────────────┤
│    08:42            │ Clock (중앙)
│   ◄ Poss ►          │
├─────────────────────┤
│ [TeamA]    [TeamB]  │ 가로 2-column
│   45         38     │ 큰 점수
│ ●●●○○     ●●○○○    │ 파울
├─────────────────────┤
│      24             │ Shot Clock
├─────────────────────┤
│ [스폰서 숨김]        │
└─────────────────────┘
```

구현 방법:
```html
<!-- 메인 콘텐츠를 flex-col로 재배치 -->
<div class="flex-1 relative flex flex-col">
  <!-- Large: 3-column / Small: stacked -->
  <div class="flex-1 flex items-center justify-center relative p-8
              max-md:flex-col max-md:p-4 max-md:gap-4">
    <!-- Clock: Large에서 center column / Small에서 상단 -->
    <div class="w-1/4 ... max-md:w-full max-md:order-first max-md:pt-2">
      ...
    </div>
    <!-- Left Team -->
    <div class="flex-1 ... max-md:flex-row max-md:w-full max-md:justify-around">
      ...
    </div>
    <!-- Right Team -->
    <div class="flex-1 ... max-md:flex-row max-md:w-full max-md:justify-around">
      ...
    </div>
  </div>
</div>
```

### 2.5 스폰서 영역 반응형

| 화면 크기 | 동작 |
|-----------|------|
| Large | 모든 스폰서 가로 나열 (현재와 동일) |
| Medium | 스폰서 크기 축소 (w-48 h-20), 넘치면 `overflow-x-auto` |
| Small | 스폰서 숨김 (`hidden`) 또는 1줄 스크롤 |

```css
@media (max-width: 767px) {
  [data-sponsor-area] { display: none; }
}
@media (min-width: 768px) and (max-width: 1279px) {
  [data-sponsor-area] .sponsor-card { width: 12rem; height: 5rem; }
}
```

### 2.6 CSS 구현 전략

**Container Query 대신 Media Query 사용**
- Display는 항상 독립 창/탭에서 전체화면으로 사용
- Container Query보다 Media Query가 더 직관적이고 브라우저 호환성 높음
- `clamp()` 함수로 유동적 사이징은 유지

**`--display-scale` 변수 유지**
- 기존 ± 버튼으로 미세 조정하는 기능은 모든 사이즈에서 유지
- Media Query 기본 사이즈 × `--display-scale`로 최종 크기 결정

---

## Phase 3: Control UI 개선

### 3.1 모바일 터치 최적화

#### 점수 버튼 확대
현재: `score-btn-mockup` (약 48px × 40px)
변경:
```css
/* 모바일에서 터치 타겟 확대 */
@media (max-width: 1023px) {
  .score-btn-mockup {
    min-height: 56px;
    min-width: 64px;
    font-size: 1.25rem;
  }
}
```

#### 타이머 시작/정지 버튼 시각적 피드백
```html
<button class="timer-btn-green ... active:scale-95 active:brightness-90"
        data-action="toggle-main">
  <!-- 실행 중: 빨간색 STOP / 정지 중: 초록색 START -->
</button>
```

JS에서 상태에 따라 클래스 전환:
```javascript
// render() 내
const toggleBtn = root.querySelector('[data-action="toggle-main"]');
if (state.running) {
  toggleBtn.className = 'timer-btn-red ...'; // 빨간색 STOP
} else {
  toggleBtn.className = 'timer-btn-green ...'; // 초록색 START
}
```

### 3.2 확인 다이얼로그

위험한 동작에 확인 다이얼로그 추가:

| 동작 | 현재 | 변경 |
|------|------|------|
| 경기 종료 (finish_match) | 바로 실행 | confirm 다이얼로그 |
| 점수 리셋 (reset-home/away-score) | 바로 실행 | confirm 다이얼로그 |
| 타이머 리셋 (reset-main) | 바로 실행 | confirm 다이얼로그 |

구현 방식: 기존 `confirm()` 사용 (네이티브, 모바일 호환):
```javascript
// application.js 내 이벤트 핸들러
case 'reset-main':
  if (!confirm(i18n('confirm_reset_timer'))) return;
  // ... 리셋 로직
  break;
```

### 3.3 키보드 단축키 표시 개선

현재: 접기/펼치기 섹션 (draggable)
변경: 동일하되, 단축키 카드에 키보드 아이콘과 설명을 좌우로 배치

---

## Phase 4: 기능 추가

### 4.1 타임아웃 기능

#### 상태 추가 (application.js)
```javascript
// defaultState()에 추가
home_timeouts: 0,     // 사용한 타임아웃 수
away_timeouts: 0,
max_timeouts_per_half: 2,  // 전반/후반 각 2회 (FIBA 기준)
```

#### Display 표시
파울 인디케이터 아래에 타임아웃 인디케이터 추가:
```html
<div class="flex items-center space-x-2 mt-4" data-timeout-indicators-left>
  <span class="text-gray-400 text-sm font-bold uppercase">T/O</span>
  <div class="w-6 h-6 rounded bg-gray-700 border border-yellow-500" data-timeout="0"></div>
  <div class="w-6 h-6 rounded bg-gray-700 border border-yellow-500" data-timeout="1"></div>
</div>
```

#### Control 조작
퀵 액션 영역에 타임아웃 버튼 추가:
```html
<button data-action="home-timeout" class="...">
  <span>⏸ Home T/O</span>
  <span data-home-timeout-count>0/2</span>
</button>
```

### 4.2 연결 상태 표시 개선

#### Display 측 연결 끊김 표시
현재: Display에 연결 상태 표시 없음
변경: 연결 끊김 시 오버레이 표시

```html
<!-- Display에 추가 -->
<div class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 hidden"
     data-connection-overlay>
  <div class="text-center">
    <div class="text-red-500 text-6xl mb-4 animate-pulse">⚠</div>
    <div class="text-white text-3xl font-bold" data-ui-key="connection_lost">연결 끊김</div>
    <div class="text-gray-400 text-xl mt-2" data-ui-key="reconnecting">재연결 중...</div>
  </div>
</div>
```

JS: ActionCable `disconnected` 콜백에서 오버레이 표시, `connected`에서 숨김

### 4.3 쿼터별 누적 점수 하단 표시 (Display) - Phase 5 이후 별도 구현

> **이관 사유**: Control의 score-table 기능으로 쿼터별 점수 확인 가능. Display 하단 미니 테이블은 별도 PDCA로 진행.

선택적으로 Display 하단에 미니 스코어 테이블 표시 (미구현, 추후 진행):
```
┌──────────────────────────────────┐
│      1Q   2Q   3Q   4Q   Total  │
│ HOME  12   8   15   --    35    │
│ AWAY  10  14   11   --    35    │
└──────────────────────────────────┘
```

---

## Phase 5: 스폰서 관리 시스템화 (선택)

> 이 Phase는 Phase 1~4 완료 후 별도 PDCA로 진행 가능

### 개요
- Club 모델에 `sponsors` 관계 추가 (또는 JSON 필드)
- Admin 페이지에서 스폰서 로고 업로드/관리
- Display에서 DB/설정 기반으로 로고 표시

### 현재 하드코딩 → 데이터 기반
```ruby
# 현재 (display.html.erb)
<img src="/manpo.png">
<img src="/hongkong.png">

# 변경안 (Phase 5 구현 시)
<% @club.sponsor_logos.each do |logo| %>
  <div class="sponsor-card">
    <img src="<%= logo.url %>" alt="<%= logo.name %>">
  </div>
<% end %>
```

---

## 구현 순서

### Step 1: Display 반응형 기반 작업 (Phase 1 + 2 동시)
1. `scoreboard_display.html.erb` 레이아웃에 반응형 meta/CSS 추가
2. `display.html.erb` HTML 구조를 반응형으로 리팩토링
3. Media Query 기반 3단계 브레이크포인트 CSS 추가
4. 색상 시스템 (팀 색상 매핑, 배경 그라데이션) 적용
5. 폰트 개선 (DSEG7 점수/타이머, text-shadow glow)
6. 파울 인디케이터 확대 + 활성화 시각 효과
7. 헤더 간소화
8. 스폰서 영역 반응형 처리
9. `scoreboard_display_ui.js`에 팀 색상 CSS 변수 설정 로직 추가

### Step 2: Control UI 개선 (Phase 3)
10. 모바일 터치 타겟 확대 (CSS 미디어 쿼리)
11. 확인 다이얼로그 추가 (리셋, 경기 종료)
12. 타이머 시작/정지 상태별 색상 전환

### Step 3: 기능 추가 (Phase 4)
13. 타임아웃 상태 추가 (application.js state)
14. 타임아웃 Display/Control UI
15. 연결 상태 오버레이 (Display)
16. 쿼터별 점수 테이블 (Display 하단, 토글)

### Step 4: i18n
17. 새로운 UI 텍스트 번역 키 추가 (ko, en, ja, zh)

---

## 수정 대상 파일 목록

| 파일 | 변경 내용 | Phase |
|------|-----------|-------|
| `app/views/scoreboards/display.html.erb` | 전면 리디자인 + 반응형 | 1, 2 |
| `app/views/layouts/scoreboard_display.html.erb` | 반응형 CSS 추가 | 1, 2 |
| `app/assets/tailwind/application.css` | 스코어보드 반응형 클래스 | 1, 2 |
| `app/assets/javascripts/scoreboard_display_ui.js` | 팀 색상, 파울 활성화 | 1 |
| `app/assets/javascripts/application.js` | 타이머 클래스 토글, 타임아웃, 확인 다이얼로그 | 1, 3, 4 |
| `app/views/scoreboards/control.html.erb` | 모바일 최적화, 타임아웃 UI | 3, 4 |
| `config/locales/ko.yml` | 새 번역 키 | 4 |
| `config/locales/en.yml` | 새 번역 키 | 4 |
| `config/locales/ja.yml` | 새 번역 키 | 4 |
| `config/locales/zh.yml` | 새 번역 키 | 4 |

---

## Data Attribute 인터페이스

### 기존 유지 (변경 없음)
```
data-scoreboard-root, data-scoreboard-role, data-match-id,
data-teams, data-games, data-teams-count, data-regular-quarters,
data-default-period-seconds, data-locale, data-voice-lang,
data-sound-enabled, data-voice-enabled, data-voice-rate,
data-possession-switch-pattern, data-scoreboard-quarter,
data-scoreboard-timer, data-scoreboard-shot,
data-score-left, data-score-right,
data-team-name-left, data-team-name-right,
data-foul-indicators-left, data-foul-indicators-right,
data-team-foul-badge-left, data-team-foul-badge-right
```

### 새로 추가
```
data-foul-active="true|false"        # 파울 원 활성화 상태
data-connection-overlay              # 연결 끊김 오버레이
data-timeout-indicators-left/right   # 타임아웃 인디케이터 컨테이너
data-timeout="0|1"                   # 개별 타임아웃 인디케이터
data-home-timeout-count              # 타임아웃 카운트 표시
data-away-timeout-count
data-sponsor-area                    # 스폰서 영역 (반응형 제어)
data-quarter-scores-display          # Display 쿼터별 점수 테이블
```

---

## 기술적 제약 및 주의사항

1. **ActionCable 호환성**: 기존 broadcast/receive 로직은 건드리지 않음. 새 상태(timeout 등)는 기존 state 객체에 추가
2. **`--display-scale` 유지**: 기존 크기 조절 시스템은 모든 반응형 사이즈에서 동작해야 함
3. **Standalone 모드 호환**: Struct 기반 mock 객체에서도 정상 동작해야 함
4. **importmap 미사용**: 새 JS는 기존 파일에 추가, 별도 모듈 파일 생성 안 함
5. **Tailwind CSS v4 + DaisyUI v5**: `@apply`로 DaisyUI 클래스 사용 불가, 순수 CSS 또는 Tailwind 유틸리티 사용
6. **Propshaft**: 에셋 fingerprinting 적용됨, 이미지 경로는 `public/` 직접 참조 또는 `asset_path` 사용

---

## 성공 기준

- [ ] 65인치 TV에서 기존과 동일하거나 더 나은 가독성
- [ ] 태블릿(iPad 등)에서 가로 모드로 전광판 정상 표시
- [ ] 스마트폰에서 세로 모드로 전광판 표시 (점수/시간 가독)
- [ ] 팀 색상이 점수에 반영되어 구분 가능
- [ ] 파울 인디케이터가 3m 이상 거리에서 식별 가능
- [ ] 모바일 Control에서 실수 방지 (확인 다이얼로그)
- [ ] 타임아웃 기능 동작 (Control 조작 → Display 표시)
- [ ] Display 연결 끊김 시 사용자 인지 가능
- [ ] ActionCable 동기화 기능 100% 유지
- [ ] Standalone 모드 정상 동작
- [ ] 4개 언어 번역 완료
