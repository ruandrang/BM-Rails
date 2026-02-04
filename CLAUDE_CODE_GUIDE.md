# 🤖 Claude Code 작업 가이드 - 농구 클럽 매니저 리디자인

이 문서는 IDE의 Claude Code에게 순서대로 지시할 내용입니다.

---

## 📋 사전 준비 체크리스트

다운로드 받은 4개 파일이 준비되어 있는지 확인:
- [ ] tailwind.config.js
- [ ] application.html.erb
- [ ] clubs_index.html.erb
- [ ] DESIGN_INSTALL_GUIDE.md

---

## 🚀 Step 1: Tailwind CSS 설치

**Claude Code에게 이렇게 요청하세요:**

```
프로젝트에 Tailwind CSS를 설치해줘.
Rails 8 프로젝트고, tailwindcss-rails gem을 사용할 거야.

순서:
1. Gemfile에 gem 'tailwindcss-rails' 추가
2. bundle install 실행
3. bin/rails tailwindcss:install 실행

완료되면 어떤 파일들이 생성되었는지 알려줘.
```

**예상 결과:**
- `tailwind.config.js` 파일 생성됨
- `app/assets/stylesheets/application.tailwind.css` 파일 생성됨
- `Procfile.dev` 파일 업데이트됨

---

## 🎨 Step 2: DaisyUI 설치

**Claude Code에게 이렇게 요청하세요:**

```
DaisyUI를 설치해줘.

npm install -D daisyui@latest

또는 package.json이 없다면 만들고 설치해줘.
```

**만약 package.json이 없다면:**

```
package.json 파일을 만들고 DaisyUI를 설치해줘.

내용:
{
  "name": "basketball-club-manager",
  "private": true,
  "devDependencies": {
    "daisyui": "^4.0.0"
  }
}

그 다음 npm install 실행해줘.
```

---

## ⚙️ Step 3: Tailwind 설정 파일 교체

**Claude Code에게 이렇게 요청하세요:**

```
프로젝트 루트에 있는 tailwind.config.js 파일을 교체해줘.

다운로드 받은 tailwind.config.js 파일의 내용으로 덮어쓰기 해줘.
이 파일에는 농구 테마 색상(basketball-orange, court-blue 등)과 
DaisyUI 플러그인 설정이 포함되어 있어.

파일 경로: ./tailwind.config.js

[여기에 tailwind.config.js 파일 내용을 붙여넣거나 파일을 직접 제공]
```

---

## 🎨 Step 4: 레이아웃 파일 백업 및 교체

**Claude Code에게 이렇게 요청하세요:**

```
app/views/layouts/application.html.erb 파일을 백업하고 새 파일로 교체해줘.

작업 순서:
1. 기존 파일을 backup/ 폴더에 복사 (backup/application.html.erb.old)
2. 다운로드 받은 새 application.html.erb로 교체

새 파일은 다음 특징이 있어:
- Tailwind CSS + DaisyUI 기반
- 왼쪽 사이드바 레이아웃
- 모바일 반응형 (drawer 컴포넌트)
- 농구 테마 색상 적용

[여기에 application.html.erb 파일 내용을 붙여넣거나 파일을 직접 제공]
```

---

## 📊 Step 5: 대시보드 페이지 백업 및 교체

**Claude Code에게 이렇게 요청하세요:**

```
app/views/clubs/index.html.erb 파일을 백업하고 새 파일로 교체해줘.

작업 순서:
1. 기존 파일을 backup/ 폴더에 복사 (backup/clubs_index.html.erb.old)
2. 다운로드 받은 새 clubs_index.html.erb로 교체

새 파일은 다음 특징이 있어:
- 상단에 통계 카드 3개 (총 클럽, 총 멤버, 이번 달 경기)
- 3열 그리드 레이아웃
- 카드 호버 효과
- 빈 상태(empty state) 디자인

[여기에 clubs_index.html.erb 파일 내용을 붙여넣거나 파일을 직접 제공]
```

---

## 🧹 Step 6: 기존 CSS 정리 (선택사항)

**Claude Code에게 이렇게 요청하세요:**

```
app/assets/stylesheets/application.css 파일을 확인하고,
기존 커스텀 CSS 스타일이 있다면 주석 처리해줘.

Tailwind CSS의 기본 import만 남겨두고,
.app-header, .app-main, .nav-link 같은 커스텀 클래스 스타일은
주석 처리하거나 삭제해줘.

왜냐하면 이제 Tailwind의 유틸리티 클래스를 사용할 거거든.
```

---

## 🔧 Step 7: 서버 재시작 준비

**Claude Code에게 이렇게 요청하세요:**

```
Tailwind CSS가 제대로 작동하는지 확인하기 위해
필요한 설정을 체크해줘.

확인 사항:
1. Gemfile에 tailwindcss-rails가 있는지
2. tailwind.config.js에 content 경로가 올바른지
3. app/assets/stylesheets/application.tailwind.css 파일이 있는지
4. package.json에 daisyui가 있는지

모두 확인되면 "준비 완료" 메시지 띄워줘.
```

---

## ✅ Step 8: 빌드 및 테스트

**터미널에서 직접 실행:**

```bash
# Tailwind CSS 빌드
bin/rails tailwindcss:build

# 서버 시작
bin/rails server
```

또는 개발 모드로 Tailwind 자동 빌드:

```bash
# 터미널 1: Tailwind 워치 모드
bin/rails tailwindcss:watch

# 터미널 2: Rails 서버
bin/rails server
```

**브라우저에서 확인:**
- http://localhost:3000 접속
- 로그인 후 클럽 목록 페이지 확인

---

## 🐛 문제 해결 가이드

### 문제 1: Tailwind 스타일이 적용 안 됨

**Claude Code에게 요청:**

```
Tailwind CSS가 적용 안 되는 것 같아. 디버깅해줘.

확인할 것:
1. bin/rails tailwindcss:build 실행했는지
2. app/assets/builds/tailwind.css 파일이 생성되었는지
3. application.html.erb에서 stylesheet_link_tag이 올바른지
4. 브라우저 개발자 도구 콘솔에 에러가 있는지

해결 방법 알려줘.
```

### 문제 2: DaisyUI 컴포넌트가 작동 안 함

**Claude Code에게 요청:**

```
DaisyUI 컴포넌트가 작동 안 해. 
tailwind.config.js의 plugins 섹션에 require('daisyui')가 제대로 있는지 확인해줘.

그리고 node_modules/daisyui가 설치되어 있는지도 확인해줘.
```

### 문제 3: 서버 시작이 안 됨

**Claude Code에게 요청:**

```
서버 시작 시 에러가 나. 전체 에러 로그는 이거야:

[여기에 에러 메시지 붙여넣기]

뭐가 문제인지 분석하고 해결 방법 알려줘.
```

---

## 📱 Step 9: 모바일 반응형 테스트

**Claude Code에게 요청:**

```
브라우저 개발자 도구로 모바일 뷰를 테스트하고 싶어.

확인할 것:
1. 사이드바가 햄버거 메뉴로 변경되는지
2. 통계 카드가 1열로 쌓이는지
3. 클럽 카드가 1열로 쌓이는지

문제가 있다면 tailwind.config.js의 반응형 설정을 확인해줘.
```

---

## 🎯 Step 10: 다음 페이지 준비

대시보드가 잘 작동하면, 다음 페이지를 준비할 차례!

**Claude Code에게 요청:**

```
대시보드 페이지가 잘 작동해!

이제 다음 페이지들의 리디자인이 필요해:
1. 멤버 관리 페이지 (app/views/members/index.html.erb)
2. 클럽 상세 페이지 (app/views/clubs/show.html.erb)
3. 경기 기록 페이지 (app/views/matches/index.html.erb)

어떤 페이지부터 작업하면 좋을지 추천해줘.
```

---

## 💡 Claude Code 사용 팁

### 효과적인 프롬프트 작성법:

**❌ 나쁜 예:**
"디자인 바꿔줘"

**✅ 좋은 예:**
"app/views/clubs/index.html.erb 파일을 열어서,
기존 내용을 백업하고 새로운 Tailwind CSS 기반 디자인으로 교체해줘.
새 디자인은 3열 그리드 레이아웃이고 카드 호버 효과가 있어."

### 파일 제공 방법:

1. **파일 내용 복사-붙여넣기**
```
이 내용으로 tailwind.config.js를 만들어줘:

[파일 내용 붙여넣기]
```

2. **파일 직접 업로드**
- IDE에서 파일을 드래그 앤 드롭
- Claude Code가 자동으로 인식

---

## 🎉 완료 체크리스트

모든 작업이 끝나면 확인:

- [ ] Tailwind CSS 설치됨
- [ ] DaisyUI 설치됨
- [ ] tailwind.config.js 교체됨
- [ ] application.html.erb 교체됨
- [ ] clubs_index.html.erb 교체됨
- [ ] 서버가 정상 시작됨
- [ ] 브라우저에서 새 디자인 확인됨
- [ ] 모바일 반응형 작동 확인됨

---

## 📞 다음 단계

대시보드가 완료되면 알려주세요!

그 다음 작업:
1. 멤버 관리 페이지 디자인
2. 클럽 상세 페이지 디자인
3. 경기 기록 페이지 디자인
4. 라이브 점수판 UI 디자인

**화이팅! 🏀**
