# 농구 클럽 매니저 (Rails) 사용 가이드

이 문서는 현재 프로젝트에 구현된 기능과 로컬 실행 방법을 정리한 안내서입니다.

## 1) 실행 환경
- Ruby: rbenv 기반 Ruby 3.x 권장
- DB: SQLite (로컬 내장)
- Framework: Rails 8.1.x

## 2) 초기 실행
```bash
bundle install
bin/rails db:create db:migrate
bin/rails server
```

브라우저에서 접속:
- http://localhost:3000

## 3) 인증 (간단 세션)
- 회원가입/로그인 페이지 제공
- 세션 기반 로그인 유지

페이지:
- `/registration/new` 회원가입
- `/session/new` 로그인

## 4) 클럽 관리
- 클럽 생성/수정/삭제
- 클럽 아이콘 선택 (12종)
- 클럽 상세에서 멤버/경기/통계/백업 이동

## 5) 멤버 관리
- 멤버 CRUD
- 드래그 앤 드롭으로 멤버 순서 변경
- CSV 가져오기/내보내기 (UTF-8 BOM 지원)

CSV 형식 (헤더):
```
이름,나이,키,포지션,등번호
```
포지션 값:
- Guard / Forward / Center

## 6) 팀 생성 & 밸런싱
- 2팀 또는 3팀 선택
- 팀 색상 지정
- 인원 선택 후 자동 팀 배정
- 포지션 균등 + 승률 기반 밸런싱
  - 최근 5경기 이상 참가자에게 승률 반영

## 7) 경기 기록
- 경기 생성 시 팀/게임 자동 생성
- 2팀: 1경기, 3팀: 3경기(라운드로빈)
- 결과 입력: 홈승/원정승/무승부/미기록
- 경기 날짜 수정/삭제

## 8) 통계 대시보드
- 멤버별 출전 수, 승/무/패, 승률
- 정렬: 이름순 / 경기수순 / 승률순

## 9) 데이터 백업 (JSON)
- 클럽 단위 JSON 내보내기
- JSON 가져오기 시 클럽 데이터 덮어쓰기

## 10) 공유용 경기 결과 화면
- 경기 상세에서 “공유용 보기” 제공
- 전용 화면에서 스크린샷/인쇄(PDF) 가능

## 11) 관리자 화면 (Admin GUI)
관리자 권한을 가진 사용자만 접근 가능

접속:
- `/admin`

기능:
- Users, Clubs, Members, Matches, Teams, TeamMembers, Games 전체 조회
- 관리자 대시보드 카드 클릭 이동

관리자 권한 부여 (이메일 기준):
```bash
bin/rails "admin:grant[admin@admin.com]"
```

## 12) 카드 클릭 이동
카드형 UI는 버튼이 없어도 카드 전체 클릭으로 이동되도록 적용됨:
- 클럽 목록 카드
- 클럽 상세의 멤버/경기/통계 카드
- 관리자 대시보드 카드

## 13) 뒤로가기 버튼
각 주요 화면에 “뒤로가기” 버튼 추가:
- 클럽 상세/편집/생성
- 멤버 목록/편집/생성
- 경기 목록/편집/생성/상세
- 통계 대시보드

## 14) 문제 해결
### CSV 가져오기 인코딩 에러
```
CSV 가져오기 실패: incompatible encoding regexp match (UTF-8 regexp with ASCII-8BIT string)
```
해결:
- 업로드 파일을 UTF-8로 강제 변환 처리 적용됨

### 번들 설치 시 Ruby 2.6 사용 문제
`/System/Library/.../Ruby 2.6` 경로가 나오면 rbenv Ruby 사용 설정 필요

### 관리자 권한 부여 명령이 zsh에서 실패하는 경우
```bash
bin/rails "admin:grant[admin@admin.com]"
```

## 15) DB 확인
### Rails 콘솔
```bash
bin/rails console
```

### SQLite 콘솔
```bash
sqlite3 storage/development.sqlite3
```

