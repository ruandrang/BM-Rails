# 농구 클럽 매니저 (BM-rail) 기능 가이드

이 문서는 현재 코드 기준으로 동작하는 기능을 정리한 최신 안내서입니다.

기준 브랜치: `main`  
검토 기준일: 2026-02-09

---

## 1. 기술 스택

- Ruby on Rails 8.1
- SQLite (개발 기본 DB)
- Tailwind CSS + daisyUI
- Hotwire(Turbo) + Stimulus 일부
- SortableJS (드래그 정렬)
- ActionCable(WebSocket) 실시간 점수판 동기화
- Browser Speech API(음성 안내), Web Audio API(버저)

---

## 2. 로컬 실행

```bash
bundle install
bin/rails db:create db:migrate
bin/rails server
```

접속:

- `http://localhost:3000`
- 헬스 체크: `http://localhost:3000/up`

---

## 3. 인증/권한

### 3.1 회원가입/로그인

- 회원가입: `GET /registration/new`
- 로그인: `GET /session/new`
- 로그아웃: `DELETE /session`
- 비밀번호: 최소 6자
- 로그인 시도 rate limit: 분당 10회 (`SessionsController#create`)

### 3.2 접근 제어

- 기본적으로 로그인 필수 (`ApplicationController#require_login`)
- 공유 화면(`matches#share`)만 비로그인 허용 + 토큰 검증
- 관리자 페이지는 `admin` 플래그 사용자만 접근 가능

---

## 4. 사이드 메뉴(주요 기능 진입점)

- 내 클럽
- 새 클럽 만들기
- 연동 점수판
- 단독 점수판
- 데이터 백업
- 세팅
- (관리자일 때) 관리자 페이지

사이드바 열림/닫힘 상태는 `localStorage`에 저장되어 새로고침 후에도 유지됩니다.

---

## 5. 클럽 관리

### 5.1 클럽 CRUD

- 클럽 생성/수정/삭제
- 아이콘 12종 선택
- 설명(description), 정기 모임 요일(meeting_days) 설정
- 모임 요일은 한글(월~일) 저장 + 기본 경기 날짜 계산에 사용

### 5.2 클럽 대시보드

- 멤버 수, 경기 수, 최근 경기 목록
- 승률 상위 멤버 미리보기
- 멤버/경기/통계/새 경기 빠른 이동 카드

---

## 6. 멤버 관리

### 6.1 멤버 CRUD

- 이름, 나이, 키, 포지션, 등번호 관리
- 포지션: `PG / SG / SF / PF / C`
- 포지션별 색상 배지 표시

### 6.2 정렬 기능

멤버 목록 정렬 버튼:

- 이름
- 포지션
- 키
- 승률
- 경기수
- 등번호

`initSortableList` 공용 정렬 함수로 구현되어 다른 화면(새 경기, 통계)과 동일한 정렬 UX를 사용합니다.

### 6.3 CSV 가져오기/내보내기

- 내보내기: `GET /clubs/:club_id/members/export_csv`
- 가져오기: `POST /clubs/:club_id/members/import_csv`
- UTF-8/BOM 처리
- 한글/영문 헤더 모두 인식
- 포지션 문자열 자동 정규화(예: Guard/가드 등)

CSV 헤더 예시:

```csv
이름,나이,키,포지션,등번호
```

---

## 7. 경기 생성

### 7.1 기본 설정

- 경기 날짜
- 팀 수 선택: 2팀 / 3팀
- 메모
- 팀 이름/팀 컬러 지정

### 7.2 선수 선택

- 참가 멤버 다중 선택
- 상위 18명 빠른 선택
- 멤버 선택 영역 정렬(이름/포지션/키/승률/경기수/등번호)

### 7.3 팀 밸런싱

`TeamBalancer` 기반 자동 배정:

- 포지션별 균형 우선
- 팀 인원 수 균형
- 강도(strength) 균형
- 강도 계산: 5경기 이상은 실제 승률, 그 미만은 0.5

### 7.4 경기/게임 자동 생성

- 2팀: 1개 게임
- 3팀: 라운드로빈 3개 게임(A-B, B-C, C-A)

---

## 8. 경기 상세/기록

### 8.1 팀 카드

- 팀별 W/D/L 표시
- 팀 멤버 목록 표시
- 경기 시작 전에는 “팀 랜덤 다시 섞기” 가능
- 팀 카드 간 멤버 드래그 이동 가능
  - 드롭 시 `PATCH /move_member`
  - 성공 후 페이지 리로드

### 8.2 게임 스코어보드 섹션

- GAME 1~N 요약 카드
- 쿼터별 득점(내부 저장은 누적값, 화면은 쿼터 증분값 표시)
- 승리 팀 하이라이트 표시

### 8.3 점수 수정 모달

- 입력 모드 2가지:
  - 쿼터별(delta)
  - 누적(cumulative)
- 저장 시 `PATCH /update_scores`

### 8.4 경기 삭제

- 경기 삭제 시 해당 경기의 게임/팀/팀멤버도 함께 삭제
- 선수 통계 캐시 무효화되어 통계에 즉시 반영

---

## 9. 공유 화면

- 경로: `GET /clubs/:club_id/matches/:id/share?token=...`
- 토큰 불일치 시 404 처리
- 경기 결과/팀카드/쿼터 스코어를 공유용 레이아웃으로 제공

---

## 10. 연동 점수판(입력판 + 전광판)

### 10.1 진입 경로

- 입력판: `GET /clubs/:club_id/matches/:id/scoreboard`
- 전광판: `GET /clubs/:club_id/matches/:id/scoreboard_display`

### 10.2 실시간 동기화

- ActionCable 채널: `ScoreboardChannel`
- 스트림 키: `scoreboard:{match_id}`
- 상태 캐시: `Rails.cache["scoreboard_state_{match_id}"]`
- payload 허용 키 화이트리스트 및 최대 크기 제한(50KB)

### 10.3 점수판 핵심 상태

- 쿼터, 경기시간, 샷클락
- 타이머 동작 여부
- 팀별 점수/파울
- 매치업 순서(`matchup_order`)
- 쿼터 히스토리(`quarter_history`)
- 공격 방향(`possession`, `base_possession`)
- 공격권 전환 패턴(`possession_switch_pattern`)
- 사운드/음성 ON/OFF
- 수동 좌우 스왑(`manual_swap`)

### 10.4 입력판 기능

- 경기 타이머 시작/멈춤/리셋/±1분
- 샷클락 24/14/시작/멈춤
- 팀 점수 +1/+2/+3/-1/리셋
- 파울 증감
- 버저, 사운드 토글, 음성 토글
- 점수 바꾸기(좌우 스왑)
- 경기 리셋(new-game)
- 경기 종료(finish-game, 서버 저장 후 결과 화면 이동)
- 다음 쿼터(next-quarter)
  - 현재 쿼터 점수 저장
  - 쿼터 히스토리 기록
  - 경기/샷클락/파울 초기화
  - 공격방향 세팅 규칙 적용

### 10.5 “상세 숨기기” 패널

- 경기 Matchup 테이블
- 키보드 단축키 카드
- 카드 순서 드래그 정렬 가능
- 정렬 순서는 `localStorage(scoreboard:detail-order:{matchId})`에 저장

### 10.6 Matchup 순서 드래그

- Matchup 행 드래그로 경기 순서 변경 가능
- 순서 변경 시 `matchup_order` 갱신
- 현재 라운드 점수/표/헤더 순서 반영
- 동일 상태가 전광판에도 실시간 반영

### 10.7 키보드 단축키

- `Space`: 경기 시작/멈춤
- `1,2,3`: 좌측 팀 +1/+2/+3
- `8,9,0`: 우측 팀 +1/+2/+3
- `Z`: 샷클락 14초
- `X`: 샷클락 24초
- `C`: 샷클락 시작/멈춤

### 10.8 음성/사운드

- 버저: Web Audio API
- 음성: SpeechSynthesis(ko-KR 우선)
- 카운트다운(5초 이하) 및 점수 안내 음성
- 세팅값 기본 반영 + 입력판에서 즉시 토글 가능

### 10.9 전광판 표시

- 입력판 대비 좌우 팀 표시가 반대로 렌더링되는 설계
- 팀 컬러 기반 배지/아이콘 표시
- 흰색(White) 팀 컬러 대비 처리(경계선 강화)
- 하단 중앙 `manpo.png` 로고 표시
- 풀스크린 버튼 제공

---

## 11. 단독 점수판(Standalone)

### 11.1 진입 경로

- 입력판: `GET /standalone_scoreboard`
- 전광판: `GET /standalone_display`

### 11.2 특징

- Match 없이 사용자 전용 가상 match_id 사용: `standalone_u{user_id}`
- 실시간 연동 로직/타이머/사운드/음성은 연동 점수판과 동일
- 경기 데이터 저장 API(실매치 저장)는 사용하지 않음

---

## 12. 세팅 메뉴

경로: `GET/PATCH /setting`

### 12.1 기본 경기 시간

- 범위: 1~60분
- 빠른 선택: 6~12분
- 저장 시 신규 점수판 기본 경기시간으로 적용

### 12.2 사운드/음성 기본값

- 점수판 사운드 기본 ON/OFF
- 음성 안내 기본 ON/OFF

### 12.3 공격방향 전환 패턴

- `q12_q34`:
  - 1,2쿼터 동일 방향
  - 3,4쿼터 반대 방향
- `q13_q24`:
  - 홀수/짝수 쿼터 교차 전환

저장 시 기존 점수판 캐시를 비워 다음 접속부터 새 규칙이 반영됩니다.

---

## 13. 통계

경로: `GET /clubs/:club_id/stats`

### 13.1 기본 통계

- 선수별 경기수, 승/무/패, 승률
- 정렬: 이름/포지션/경기수/승률

### 13.2 월간 MVP

- 지난달 기준 통계 계산
- 승률 우선, 동률이면 경기수 우선

### 13.3 캐시

- 클럽 멤버 통계: 5분 캐시
- 월간 통계: 1시간 캐시
- 경기/점수 변경 시 캐시 무효화

---

## 14. 데이터 백업/복원 (JSON)

경로:

- 백업 화면: `GET /clubs/backup`
- 전체 내보내기: `GET /clubs/export_all`
- 전체 가져오기: `POST /clubs/import_all`

### 14.1 내보내기 범위

- 사용자 소속 모든 클럽
- 멤버
- 경기/팀/게임/쿼터점수

### 14.2 복원 정책

- 기존 데이터 덮어쓰기 아님
- 이름/구성 기반으로 중복 비교 후 신규만 추가
- 결과 메시지로 추가/건너뜀 개수 안내
- 업로드 최대 10MB

---

## 15. 관리자(Admin)

경로: `GET /admin`

### 15.1 대시보드

- User, Club, Member, Match, Team, TeamMember, Game 총계

### 15.2 조회 리소스

- users / clubs / members / matches / teams / team_members / games
- read-only 목록/상세
- 페이지네이션(20개/페이지)

### 15.3 관리자 권한 부여

```bash
bin/rails "admin:grant[email@example.com]"
```

---

## 16. 현재 구현된 주요 API/엔드포인트

### 16.1 Match 관련

- `PATCH /clubs/:club_id/matches/:id/move_member`
- `PATCH /clubs/:club_id/matches/:id/record_results`
- `PATCH /clubs/:club_id/matches/:id/save_game_scores`
- `PATCH /clubs/:club_id/matches/:id/save_quarter_scores`
- `PATCH /clubs/:club_id/matches/:id/update_scores`
- `PATCH /clubs/:club_id/matches/:id/shuffle_teams`

### 16.2 멤버 CSV

- `POST /clubs/:club_id/members/import_csv`
- `GET /clubs/:club_id/members/export_csv`

### 16.3 ActionCable

- `ws://{host}/cable`

---

## 17. 추가하면 좋은 기능 추천

아래는 현재 구조와 실제 운영 흐름(시연/현장 입력) 기준으로 우선순위가 높은 개선 제안입니다.

### 17.1 우선순위 A (바로 효과 큰 항목)

1. 점수판 E2E 테스트 자동화
   - 다음 쿼터, 매치업 드래그, 전광판 동기화, 종료 저장 시나리오를 Playwright로 고정
2. 점수 입력 감사 로그(Audit Trail)
   - 누가/언제/어떤 액션으로 점수를 바꿨는지 기록
3. 긴급 복구(Undo/Redo + 마지막 상태 복원)
   - 실수 입력 시 즉시 되돌리기

### 17.2 우선순위 B (운영 편의)

4. 경기 템플릿 기능
   - 자주 쓰는 팀 구성/시간/규칙 프리셋 저장 후 재사용
5. 대회 모드(브래킷/리그 순위표)
   - 현재 “준비중” 메뉴 실제 기능화
6. 전광판 테마 프리셋
   - 체육관/행사별 색상, 폰트, 하단 로고 세트 저장

### 17.3 우선순위 C (데이터 고도화)

7. 선수 개인 스탯 확장
   - 득점 외 리바운드/어시스트/스틸/블록 입력 및 분석
8. 팀 조합 궁합(실사용)
   - “궁합 보기” 메뉴를 실제 승률/득실 기반 분석으로 연결
9. 백업 스냅샷 히스토리 + 원클릭 롤백
   - 시연/대회 전후 안정성 강화

---

## 18. 참고 사항

- 이 문서는 실제 코드 기준으로 작성되었습니다.
- 점수판의 상태 저장/동기화는 캐시 기반이므로, 설정 변경 후에는 새로 진입하거나 페이지 새로고침 시 반영이 확실합니다.
- 브라우저 음성/오디오 정책(자동재생 제한)에 따라 첫 사용자 입력 이후 음성이 안정적으로 동작합니다.
