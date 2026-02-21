# 농구 경기 운영 시스템 프롬프트 (Rails bm-rails 프로젝트)

> 이 프롬프트를 Claude 또는 AI 코딩 도구에 붙여넣어 사용하세요.

---

## 프롬프트 시작

```
너는 Rails 8 + Tailwind CSS + daisyUI 기반의 농구 경기 운영 시스템(bm-rails)을 개발하고 있어.
아래 요구사항을 읽고, 모델/컨트롤러/뷰/Stimulus 컨트롤러를 구현해줘.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 핵심 개념 정의
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

이 시스템은 3팀 라운드로빈 농구 대회를 운영한다.
경기는 4쿼터로 구성되며, 두 가지 공격권 규칙을 설정에서 선택할 수 있다.

용어 정의:
- 공격권(Possession): 쿼터 시작 시 어느 팀이 먼저 공격하는지
- 코트 체인지(Court Change): 하프타임에 양 팀이 공격 방향을 바꾸는 것
- "A → B" 표기: A팀이 공격, B팀이 수비 (A가 B의 골대를 향해 공격)
- "A ← B" 표기: B팀이 공격, A팀이 수비 (공격권이 반전됨)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2. 공격권 규칙 (두 가지 모드)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### 모드 A: FIBA 방식 (1,3쿼터 동일 / 2,4쿼터 동일)
- KBL(한국프로농구), FIBA 국제 규칙에서 사용하는 방식
- 1쿼터 시작 시 점프볼 승리팀이 1쿼터와 3쿼터에 공격권
- 점프볼 패배팀이 2쿼터와 4쿼터에 공격권
- 쿼터 간 공격권 전환 패턴: 매 쿼터마다 번갈아 전환

예시 (A팀이 점프볼 승리):
  Q1: A → B (A 공격)
  Q2: A ← B (B 공격) ← 공격권 전환
  ── 하프타임: 코트 체인지 ──
  Q3: B ← A (A 공격) ← 코트가 바뀌었지만 A가 다시 공격 (1,3 동일)
  Q4: B → A (B 공격) ← 공격권 전환 (2,4 동일)

정리하면:
  Q1: first_possession_team 공격
  Q2: second_possession_team 공격
  Q3: first_possession_team 공격 (코트 반대편에서)
  Q4: second_possession_team 공격 (코트 반대편에서)

### 모드 B: NBA 방식 (1,4쿼터 동일 / 2,3쿼터 동일)
- NBA, WNBA에서 사용하는 방식
- 1쿼터 시작 시 점프볼 승리팀이 1쿼터와 4쿼터에 공격권
- 점프볼 패배팀이 2쿼터와 3쿼터에 공격권
- 전반(1,2쿼터)에서 한 번 전환, 후반(3,4쿼터)에서 한 번 전환

예시 (A팀이 점프볼 승리):
  Q1: A → B (A 공격)
  Q2: A ← B (B 공격) ← 공격권 전환
  ── 하프타임: 코트 체인지 ──
  Q3: B → A (B 공격) ← 코트 바뀌고 B가 계속 공격 (2,3 동일)
  Q4: B ← A (A 공격) ← 공격권 전환 (1,4 동일)

정리하면:
  Q1: first_possession_team 공격
  Q2: second_possession_team 공격
  Q3: second_possession_team 공격 (코트 반대편에서)
  Q4: first_possession_team 공격 (코트 반대편에서)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3. 코트 체인지 규칙
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- 코트 체인지는 하프타임(2쿼터 종료 후)에 1회만 발생
- 전반(Q1, Q2): 홈팀 벤치 기준 왼쪽 → 오른쪽 공격
- 후반(Q3, Q4): 홈팀 벤치 기준 오른쪽 → 왼쪽 공격 (방향 반전)
- 연장전(OT)은 후반의 연장으로 간주하여 코트를 다시 바꾸지 않음

코트 방향을 나타내는 값:
  - :left_to_right (전반 기본)
  - :right_to_left (후반, 코트 체인지 후)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4. 3팀 라운드로빈 대진표
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

3개 팀(A, B, C)이 라운드로빈으로 총 3경기를 치른다.

대진표:
  경기 1: A vs B
  경기 2: B vs C
  경기 3: C vs A

각 경기별 전체 쿼터 흐름 (FIBA 모드 기준, A→B는 A가 먼저 공격):

### 경기 1 (A vs B)
  Q1: A → B (A 공격)
  Q2: B → A (B 공격)
  ── 코트 체인지 ──
  Q3: A ← B (A 공격, 코트 반대)
  Q4: B ← A (B 공격, 코트 반대)

### 경기 2 (B vs C)
  Q1: B → C (B 공격)
  Q2: C → B (C 공격)
  ── 코트 체인지 ──
  Q3: B ← C (B 공격, 코트 반대)
  Q4: C ← B (C 공격, 코트 반대)

### 경기 3 (C vs A)
  Q1: C → A (C 공격)
  Q2: A → C (A 공격)
  ── 코트 체인지 ──
  Q3: C ← A (C 공격, 코트 반대)
  Q4: A ← C (A 공격, 코트 반대)

NBA 모드일 경우 Q3의 공격권이 Q2와 동일하게 유지됨 (위 "2. 공격권 규칙" 참고).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5. 데이터 모델 설계
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

아래 모델들을 생성해줘:

### Tournament (대회)
- name: string (대회 이름)
- possession_rule: enum [:fiba, :nba] (공격권 규칙 모드)
- status: enum [:draft, :in_progress, :completed]
- teams_count: integer (기본값 3)

### Team (팀)
- tournament_id: references
- name: string
- abbreviation: string (예: "A", "B", "C")
- color: string (팀 색상, hex)

### Game (경기)
- tournament_id: references
- home_team_id: references (Team)
- away_team_id: references (Team)
- game_number: integer (1, 2, 3)
- status: enum [:scheduled, :in_progress, :completed]
- first_possession_team_id: references (Team) - 점프볼 승리팀(1쿼터 공격팀)

### Quarter (쿼터)
- game_id: references
- quarter_number: integer (1, 2, 3, 4, 5=OT)
- offense_team_id: references (Team) - 이 쿼터 시작 시 공격팀
- defense_team_id: references (Team) - 이 쿼터 시작 시 수비팀
- court_direction: enum [:left_to_right, :right_to_left]
- home_score: integer (default: 0)
- away_score: integer (default: 0)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
6. 핵심 비즈니스 로직
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Game 모델에 다음 메서드들을 구현해줘:

### 공격권 결정 로직
```ruby
# 해당 쿼터의 공격팀을 반환
def offense_team_for_quarter(quarter_number)
  case tournament.possession_rule
  when "fiba"
    # FIBA: 1,3쿼터 = first_possession_team / 2,4쿼터 = 상대팀
    if quarter_number.odd?  # 1, 3쿼터
      first_possession_team
    else                     # 2, 4쿼터
      opponent_of(first_possession_team)
    end
  when "nba"
    # NBA: 1,4쿼터 = first_possession_team / 2,3쿼터 = 상대팀
    if [1, 4].include?(quarter_number)
      first_possession_team
    else  # 2, 3쿼터
      opponent_of(first_possession_team)
    end
  end
end
```

### 코트 방향 결정 로직
```ruby
# 해당 쿼터의 코트 방향을 반환
def court_direction_for_quarter(quarter_number)
  if quarter_number <= 2
    :left_to_right   # 전반
  else
    :right_to_left   # 후반 (코트 체인지 후)
  end
end
```

### 쿼터 자동 생성
```ruby
# 경기 시작 시 4개 쿼터를 자동 생성
def generate_quarters!
  (1..4).each do |q|
    offense = offense_team_for_quarter(q)
    defense = opponent_of(offense)

    quarters.create!(
      quarter_number: q,
      offense_team: offense,
      defense_team: defense,
      court_direction: court_direction_for_quarter(q)
    )
  end
end
```

### 대진표 자동 생성
```ruby
# Tournament 모델에 구현
def generate_round_robin!
  teams_array = teams.to_a
  # 3팀 라운드로빈: (0,1), (1,2), (2,0)
  matchups = [
    [teams_array[0], teams_array[1]],
    [teams_array[1], teams_array[2]],
    [teams_array[2], teams_array[0]]
  ]

  matchups.each_with_index do |(home, away), index|
    games.create!(
      home_team: home,
      away_team: away,
      game_number: index + 1,
      first_possession_team: home  # 기본값: 홈팀 선공 (점프볼 후 변경 가능)
    )
  end
end
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
7. UI 화면 설계
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

daisyUI 컴포넌트를 활용하여 아래 화면들을 구현해줘.

### 7-1. 대회 설정 페이지 (tournaments/edit)

공격권 규칙 선택 UI:
```html
<div class="form-control">
  <label class="label"><span class="label-text font-bold">공격권 규칙</span></label>
  <div class="flex gap-4">
    <label class="label cursor-pointer gap-2">
      <input type="radio" name="tournament[possession_rule]" value="fiba"
             class="radio radio-primary" checked>
      <div>
        <span class="font-semibold">FIBA 방식</span>
        <p class="text-xs text-base-content/60">1,3쿼터 / 2,4쿼터 교대 (KBL)</p>
      </div>
    </label>
    <label class="label cursor-pointer gap-2">
      <input type="radio" name="tournament[possession_rule]" value="nba"
             class="radio radio-primary">
      <div>
        <span class="font-semibold">NBA 방식</span>
        <p class="text-xs text-base-content/60">1,4쿼터 / 2,3쿼터 교대</p>
      </div>
    </label>
  </div>
</div>
```

### 7-2. 대진표 페이지 (tournaments/show)

3경기를 카드 형태로 보여주고, 각 경기의 쿼터별 공격권/코트 방향을 시각적으로 표시:

```
┌─────────────────────────────────────────────┐
│ 경기 1                          예정 / 진행중 │
│                                              │
│  🏀 A팀  vs  B팀                             │
│                                              │
│  Q1  A → B    Q2  B → A                      │
│  ─────── 코트 체인지 ───────                  │
│  Q3  A ← B    Q4  B ← A                      │
│                                              │
│  [경기 시작]                                  │
└─────────────────────────────────────────────┘
```

각 쿼터 표시에서:
- 화살표 방향(→ 또는 ←)으로 공격 방향(코트 방향) 표현
- 화살표 앞의 팀이 공격팀
- 현재 진행 중인 쿼터는 badge로 강조 표시
- 코트 체인지 구분선을 Q2와 Q3 사이에 표시

### 7-3. 경기 진행 화면 (games/show)

코트를 시각적으로 표현:
```
┌──────────────────────────────────────────────┐
│              Q1  10:00               FIBA    │
│                                              │
│   [A팀 골대]  ◀━━━━━ 🏀 ━━━━━  [B팀 골대]   │
│                                              │
│     A팀 (공격) ──→              B팀 (수비)    │
│                                              │
│   A팀: 0    │    B팀: 0                       │
│                                              │
│   [Q1] [Q2] [Q3] [Q4]   쿼터 탭 네비게이션   │
└──────────────────────────────────────────────┘
```

코트 체인지 후(Q3, Q4):
```
┌──────────────────────────────────────────────┐
│              Q3  10:00               FIBA    │
│                                              │
│   [B팀 골대]  ━━━━━ 🏀 ━━━━━▶  [A팀 골대]   │
│                                              │
│     B팀 (수비)              A팀 (공격) ──→    │
│                                              │
│   A팀: 24   │    B팀: 21                      │
│                                              │
│   [Q1] [Q2] [Q3] [Q4]   쿼터 탭 네비게이션   │
└──────────────────────────────────────────────┘
```

### 7-4. 라운드로빈 전체 현황

3팀의 전적을 테이블로 표시:
```
┌──────┬────┬────┬────┬────┬─────┐
│ 팀   │ 경기│ 승 │ 패 │ 득점│ 실점 │
├──────┼────┼────┼────┼────┼─────┤
│ A팀  │  2 │  1 │  1 │  45│  42 │
│ B팀  │  2 │  1 │  1 │  40│  43 │
│ C팀  │  2 │  1 │  1 │  38│  38 │
└──────┴────┴────┴────┴────┴─────┘
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
8. Stimulus 컨트롤러
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

다음 Stimulus 컨트롤러를 만들어줘:

### possession_controller.js
- 공격권 규칙(FIBA/NBA)을 라디오 버튼으로 변경하면
  대진표 카드의 쿼터별 공격팀 표시가 실시간으로 갱신되도록

### court_controller.js
- 경기 진행 화면에서 코트 다이어그램의 팀 위치와 공격 방향 화살표를
  현재 쿼터에 맞게 업데이트

### quarter_tab_controller.js
- 쿼터 탭(Q1~Q4)을 클릭하면 해당 쿼터의 정보(공격팀, 점수, 코트 방향)를 표시
- 현재 활성 쿼터에 daisyUI의 tab-active 클래스 적용

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
9. 참고 규칙 요약
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FIBA 방식 (fiba):
  - 쿼터별 공격팀: Q1=팀A, Q2=팀B, Q3=팀A, Q4=팀B (교대 반복)
  - 패턴: 홀수쿼터(1,3)=선공팀 / 짝수쿼터(2,4)=후공팀
  - 코트 체인지: 하프타임(Q2 후) 1회
  - 점프볼 상황: 포제션 애로우(교대 소유권) 사용

NBA 방식 (nba):
  - 쿼터별 공격팀: Q1=팀A, Q2=팀B, Q3=팀B, Q4=팀A
  - 패턴: Q1,Q4=선공팀 / Q2,Q3=후공팀
  - 코트 체인지: 하프타임(Q2 후) 1회
  - 점프볼 상황: 실제 점프볼 실시 (애로우 미사용)

공통:
  - 코트 체인지는 하프타임에 1회만 발생
  - 연장전(OT)은 후반의 연장이므로 추가 코트 체인지 없음
  - first_possession_team은 점프볼 결과로 결정되며, 경기 시작 전 수정 가능

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
10. 구현 우선순위
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1단계: 모델 + 마이그레이션 생성 (Tournament, Team, Game, Quarter)
2단계: 비즈니스 로직 (공격권 결정, 코트 방향, 쿼터 자동 생성, 대진표 생성)
3단계: 대회 설정 UI (공격권 규칙 선택)
4단계: 대진표 페이지 (경기 카드 + 쿼터 표시)
5단계: 경기 진행 화면 (코트 다이어그램 + 점수 입력)
6단계: 라운드로빈 전적 현황 테이블
7단계: Stimulus 컨트롤러 (실시간 UI 갱신)

각 단계별로 테스트(RSpec 또는 Minitest)도 함께 작성해줘.
```

## 프롬프트 끝
