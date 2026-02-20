# Plan: scoreboard-improvement (전광판 종합 고도화)

## 개요
전광판 시스템 전반을 고도화한다. Display UI 리디자인, Control UI 개선, 다양한 디스플레이 사이즈 지원, 기능 추가를 포함한다.

## 현황 분석

### 현재 구조
- **Display**: `display.html.erb` + `scoreboard_display.html.erb` 레이아웃
- **Control**: `control.html.erb` (application 레이아웃 사용)
- **JS**: `application.js` 내 스코어보드 클라이언트 (ActionCable 기반)
- **추가 JS**: `scoreboard_display_ui.js` (Display 전용 UI 로직)
- **실시간 동기화**: `ScoreboardChannel` (ActionCable) + `ScoreboardStore` (Rails.cache)
- **Standalone 모드**: 클럽/경기 없이 독립 실행 가능

### 현재 문제점
1. **Display 사이즈 고정**: 한 가지 레이아웃만 존재 (대형 TV 기준)
2. **모바일 Display 미지원**: 스마트폰/태블릿에서 전광판 보기 불가능
3. **Display 디자인 개선 여지**: 팀 색상 활용 부족, 시각적 계층 구조 개선 필요
4. **Control 모바일 UX**: 모바일에서 조작 시 버튼 크기/배치 최적화 부족
5. **스폰서 배너 하드코딩**: 스폰서 로고가 뷰에 직접 하드코딩됨

## 개선 범위

### Phase 1: Display UI 리디자인
**목표**: 전광판 디스플레이의 시각적 품질 향상

- [ ] 팀 색상을 더 적극적으로 활용 (점수 영역 배경, 그라데이션)
- [ ] 점수 폰트 가독성 향상 (7-segment 폰트 활용 또는 고대비 숫자)
- [ ] 게임 클럭 영역 시각적 강조 (진행 중일 때 애니메이션)
- [ ] 파울 인디케이터 디자인 개선 (채워지는 원 → 더 직관적 표시)
- [ ] 쿼터 정보 표시 개선
- [ ] 전체적인 색상/대비 조정 (어두운 배경에서의 가독성)

### Phase 2: 반응형 Display (멀티 사이즈)
**목표**: 다양한 화면 크기에서 전광판 표시 지원

- [ ] **Large** (65인치+ TV / 프로젝터): 현재 레이아웃 최적화
- [ ] **Medium** (태블릿 / 노트북): 세로 축소형 레이아웃
- [ ] **Small** (스마트폰): 세로 모드 컴팩트 레이아웃
- [ ] CSS `clamp()` + `container query` 활용한 유동적 사이즈
- [ ] 가로/세로 모드 자동 전환
- [ ] 스폰서 배너 영역 반응형 처리 (작은 화면에서 숨김/축소)

### Phase 3: Control UI 개선
**목표**: 조작자 경험 향상

- [ ] 모바일 Control 최적화 (큰 터치 타겟, 원핸드 조작)
- [ ] 타이머 시작/정지 버튼 크기 확대 및 시각적 피드백 강화
- [ ] 점수 +1/+2/+3 버튼 터치 영역 확대
- [ ] 실수 방지: 중요 동작(경기 종료, 리셋) 시 확인 다이얼로그
- [ ] 키보드 단축키 표시 개선 (현재 접기/펼치기 섹션)
- [ ] 쿼터별 점수 테이블 UX 개선

### Phase 4: 기능 추가
**목표**: 실사용에서 요구되는 기능 보강

- [ ] 타임아웃 기능 (각 팀 쿼터당 N회, 시각적 표시)
- [ ] 쿼터 전환 시 자동 점수 저장 강화
- [ ] Display에서 쿼터별 누적 점수 하단 표시 (옵션)
- [ ] 음성 안내 설정을 Control 화면에서 즉시 변경
- [ ] 연결 상태 표시 개선 (Display 측에서도 연결 끊김 알림)

### Phase 5: 스폰서 관리 시스템화 (선택)
**목표**: 스폰서 로고를 DB/설정으로 관리

- [ ] 스폰서 로고를 하드코딩 → 클럽별 설정으로 이동
- [ ] 관리자가 스폰서 추가/삭제/순서 변경 가능
- [ ] Display에서 자동 롤링 또는 고정 표시

## 우선순위

| Phase | 중요도 | 난이도 | 소요 시간(추정) |
|-------|--------|--------|----------------|
| Phase 1 | 높음 | 중간 | CSS/HTML 수정 |
| Phase 2 | 높음 | 높음 | 반응형 레이아웃 전면 재작업 |
| Phase 3 | 중간 | 중간 | 버튼/레이아웃 조정 |
| Phase 4 | 중간 | 높음 | JS 로직 추가 |
| Phase 5 | 낮음 | 중간 | DB 모델 + UI 추가 |

## 수정 대상 파일

### 뷰 파일
- `app/views/scoreboards/display.html.erb` - Display UI 전면 리디자인
- `app/views/scoreboards/control.html.erb` - Control UI 개선
- `app/views/layouts/scoreboard_display.html.erb` - Display 레이아웃 수정
- `app/views/scoreboards/index.html.erb` - 목록 페이지 (필요시)

### JS 파일
- `app/assets/javascripts/application.js` - 스코어보드 클라이언트 로직
- `app/assets/javascripts/scoreboard_display_ui.js` - Display UI 로직

### CSS
- `app/assets/tailwind/application.css` - 스코어보드 전용 클래스 추가

### 컨트롤러
- `app/controllers/scoreboards_controller.rb` - 새 기능 액션 추가 (필요시)

### i18n
- `config/locales/ko.yml`, `en.yml`, `ja.yml`, `zh.yml` - 새 번역 키

## 기술적 제약

1. **ActionCable async 어댑터**: 단일 프로세스 환경, Redis 미사용
2. **importmap 미사용**: `<script>` 태그로 직접 로드하는 JS 구조
3. **Tailwind CSS v4 + DaisyUI v5**: CSS 변수는 v5 형식 사용 필수
4. **Propshaft**: 에셋 파이프라인, fingerprinting 적용
5. **다국어**: 4개 언어 동시 지원 (ko, en, ja, zh)

## 작업 순서 제안

1. **Phase 1 + Phase 2를 동시에 진행** (Display 리디자인 시 반응형도 함께)
2. **Phase 3** (Control 개선은 Display와 독립적)
3. **Phase 4** (기능 추가는 UI 안정 후)
4. **Phase 5** (스폰서 관리는 선택적, 별도 PDCA 가능)

## 성공 기준

- [ ] 65인치 TV, 태블릿, 스마트폰에서 전광판 정상 표시
- [ ] 모바일에서 Control 조작 시 실수 없이 사용 가능
- [ ] 기존 ActionCable 동기화 기능 유지
- [ ] Standalone 모드 정상 작동 유지
- [ ] 4개 언어 번역 완료
