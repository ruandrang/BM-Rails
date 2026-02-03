# 농구 클럽 매니저 (Basketball Club Manager)

Next.js 기반의 농구 클럽 및 팀 관리 웹 애플리케이션입니다.

## 주요 기능

### 🔐 사용자 인증
- 회원가입 및 로그인 기능
- 쿠키 기반 세션 관리
- 클럽별 소유자 권한 관리

### 🏀 멀티 클럽 지원
- 여러 클럽을 생성하고 독립적으로 관리
- 클럽 이름 편집 및 삭제 기능
- **클럽 아이콘 선택**: 12가지 농구 테마 아이콘 중 선택 가능
- 각 클럽별 독립적인 멤버 목록 및 경기 기록

### 👥 멤버 관리
- 멤버 추가, 수정, 삭제 (CRUD)
- 멤버 정보: 이름, 나이, 키, 포지션(가드/포워드/센터), 등번호
- **CSV 가져오기/내보내기** 지원
- 드래그 앤 드롭으로 멤버 순서 변경

### 🎨 팀 생성 및 밸런싱
- 최대 18명 선택 (3팀 x 6명) 또는 유동적 인원 구성
- 팀별 색상 지정 (White, Black, Red, Blue, Yellow, Green)
- 자동 밸런싱 알고리즘:
  - 포지션별(가드/포워드/센터) 균등 분배
  - 승률 기반 팀 밸런싱 (5경기 이상 참가자)
  - 라운드 로빈 방식으로 가장 약한 팀에 우선 배치

### 📊 경기 결과 기록
- **매치 기반 시스템**: 2~3팀 간 경기 기록
  - 3팀일 경우: A vs B, A vs C, B vs C (총 3경기)
- 각 경기마다 개별적으로 승자/무승부 기록
- 팀별 전적 자동 계산 (예: 2승 1무 0패)
- 경기 추가/삭제 및 날짜 수정 기능
- 이미지로 저장하여 공유 가능

### 📈 통계 대시보드
- **선수별 통계**:
  - 경기 출전 횟수
  - 누적 승/무/패 기록
  - 승률 계산
- 정렬 기능: 이름, 경기 수, 승률 순

### 📁 데이터 관리
- JSON 형식으로 기록 내보내기/가져오기
- 클럽별 독립적인 데이터 관리

### 🌐 완전한 한글화
- 모든 UI 요소 한글 지원
- 한글 CSV 파일 지원 (UTF-8 BOM)

## 시작하기

### 필수 요건
- Node.js 18 이상
- PostgreSQL 데이터베이스

### 설치

```bash
npm install
```

### 환경 변수 설정

`.env.local` 파일을 생성하고 다음 내용을 설정하세요:

```env
DATABASE_URL=postgresql://user:password@host:port/database
```

### Docker를 이용한 로컬 개발

Docker Compose로 로컬 PostgreSQL을 실행할 수 있습니다:

```bash
docker compose up -d
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/basketball_db npm run dev
```

### 개발 서버 실행

```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 열기

### 프로덕션 빌드

```bash
npm run build
npm start
```

## 기술 스택

- **Framework**: Next.js 16 (App Router, Server Components, Turbopack)
- **Language**: TypeScript
- **Database**: PostgreSQL
- **UI Library**: React 19
- **Drag & Drop**: dnd-kit
- **Styling**: Vanilla CSS (CSS Variables, Design Tokens)
- **State Management**: React Server Actions

## 사용 방법

1. **회원가입/로그인**: 계정 생성 후 로그인
2. **클럽 생성**: 홈 화면에서 새 클럽 만들기 (아이콘 선택 가능)
3. **멤버 등록**: CSV 업로드 또는 수동 입력
4. **팀 생성**: 원하는 인원 선택 후 팀 색상 지정하여 자동 밸런싱
5. **경기 결과 입력**: 각 경기별 결과 개별 기록
6. **통계 확인**: 선수별 성적 확인

## CSV 형식

멤버 CSV 파일 형식:
```csv
이름,나이,키,포지션,등번호
홍길동,25,185,Forward,23
김철수,28,190,Center,15
```

포지션: `Guard`, `Forward`, `Center`

## 배포 (Render)

1. 이 저장소에 연결된 새 Web Service 생성
2. PostgreSQL 데이터베이스 생성
3. `DATABASE_URL` 환경 변수 설정
4. `scripts/init-db.sql`을 실행하여 데이터베이스 스키마 초기화
5. `render.yaml` 블루프린트로 배포

## 라이선스

MIT
