# Plan: Admin UI 개선

## 1. 개요

### 1.1 목적
관리자 화면의 UI/UX를 개선하여 일관성 있고 사용하기 편리한 관리 도구로 업그레이드합니다.

### 1.2 현재 상태 분석

| 항목 | Dashboard | 나머지 페이지 |
|------|-----------|---------------|
| 스타일 | DaisyUI 클래스 (btn, card, stats) | 커스텀 클래스 (button ghost, card, table) |
| 레이아웃 | max-w-7xl, 그리드 시스템 | 단순 테이블 구조 |
| 반응형 | 지원 | 미흡 |

### 1.3 발견된 문제점

1. **스타일 불일치**
   - Dashboard는 DaisyUI 클래스 사용
   - users/clubs/matches 등은 미정의된 커스텀 클래스 사용 (`button ghost`, `page-header`, `muted`)
   - 시각적 불일치 및 CSS 누락 가능성

2. **페이지네이션 미적용**
   - `Admin::BaseController`에 `paginate` 메서드 존재
   - 하지만 뷰에서 페이지 네비게이션 UI 없음

3. **검색/필터 기능 부재**
   - 데이터가 많아지면 찾기 어려움
   - Dashboard의 DB 테이블 조회만 검색 가능

4. **CRUD 미완성 (읽기 전용)**
   - 현재 show/index만 있음
   - edit/update/destroy 미구현

5. **반응형 대응 부족**
   - 모바일에서 테이블이 깨질 수 있음

---

## 2. 개선 범위

### 2.1 Phase 1: 스타일 통일 (필수)

**목표**: 모든 admin 페이지를 DaisyUI 기반으로 통일

| 파일 | 변경 내용 |
|------|-----------|
| `admin/users/index.html.erb` | DaisyUI 클래스로 변환 |
| `admin/users/show.html.erb` | DaisyUI 클래스로 변환 |
| `admin/clubs/index.html.erb` | DaisyUI 클래스로 변환 |
| `admin/clubs/show.html.erb` | DaisyUI 클래스로 변환 |
| `admin/members/index.html.erb` | DaisyUI 클래스로 변환 |
| `admin/members/show.html.erb` | DaisyUI 클래스로 변환 |
| `admin/matches/index.html.erb` | DaisyUI 클래스로 변환 |
| `admin/matches/show.html.erb` | DaisyUI 클래스로 변환 |
| `admin/teams/index.html.erb` | DaisyUI 클래스로 변환 |
| `admin/teams/show.html.erb` | DaisyUI 클래스로 변환 |
| `admin/team_members/index.html.erb` | DaisyUI 클래스로 변환 |
| `admin/team_members/show.html.erb` | DaisyUI 클래스로 변환 |
| `admin/games/index.html.erb` | DaisyUI 클래스로 변환 |
| `admin/games/show.html.erb` | DaisyUI 클래스로 변환 |

**변환 규칙**:
```erb
<%# Before %>
<div class="page-header">...</div>
<button class="button ghost">...</button>
<div class="card">...</div>

<%# After %>
<div class="flex justify-between items-center mb-6">...</div>
<button class="btn btn-ghost btn-sm">...</button>
<div class="card bg-base-100 shadow-xl">...</div>
```

### 2.2 Phase 2: 페이지네이션 UI 추가

**목표**: 목록 페이지에 페이지네이션 네비게이션 추가

**구현 방법**:
1. `app/views/admin/shared/_pagination.html.erb` 파셜 생성
2. 각 index 페이지에 파셜 삽입
3. DaisyUI `join` 컴포넌트 활용

```erb
<%# app/views/admin/shared/_pagination.html.erb %>
<% if @pagination && @pagination[:total_pages] > 1 %>
  <div class="join mt-4">
    <% (1..@pagination[:total_pages]).each do |page| %>
      <%= link_to page, url_for(page: page),
          class: "join-item btn btn-sm #{page == @pagination[:current_page] ? 'btn-active' : ''}" %>
    <% end %>
  </div>
<% end %>
```

### 2.3 Phase 3: 검색/필터 기능 (선택)

**목표**: 주요 목록 페이지에 검색 기능 추가

**대상 페이지**:
- Users: 이메일/이름 검색
- Clubs: 클럽명 검색
- Members: 이름/포지션 필터
- Matches: 날짜 범위 필터

**구현 방법**:
1. 각 컨트롤러에 검색 파라미터 처리 추가
2. 뷰에 검색 폼 추가

### 2.4 Phase 4: CRUD 완성 (선택)

**목표**: 관리자가 데이터를 수정/삭제할 수 있도록 기능 추가

**주의사항**:
- 삭제는 soft delete 고려
- 사용자 데이터 수정 시 감사 로그 권장
- CSRF 보호 필수

---

## 3. 스타일 통일 가이드

### 3.1 레이아웃 구조

```erb
<%# 페이지 헤더 %>
<div class="max-w-7xl mx-auto">
  <div class="mb-4">
    <%= link_to admin_root_path, class: "btn btn-ghost btn-sm gap-2" do %>
      <svg>...</svg>
      <%= t('admin.common.dashboard') %>
    <% end %>
  </div>

  <div class="mb-8">
    <h1 class="text-4xl font-bold text-base-content mb-2">제목</h1>
    <p class="text-base-content/60">설명</p>
  </div>

  <%# 콘텐츠 %>
  <div class="card bg-base-100 shadow-xl">
    <div class="card-body">
      ...
    </div>
  </div>
</div>
```

### 3.2 테이블 스타일

```erb
<div class="overflow-x-auto">
  <table class="table">
    <thead>
      <tr>
        <th>...</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>...</td>
        <td>
          <%= link_to t('admin.common.view'), path, class: "btn btn-ghost btn-xs" %>
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

### 3.3 버튼 스타일

| 용도 | 클래스 |
|------|--------|
| 뒤로가기/네비게이션 | `btn btn-ghost btn-sm` |
| 테이블 내 액션 | `btn btn-ghost btn-xs` |
| Primary 액션 | `btn btn-primary btn-sm` |
| 위험한 액션 (삭제) | `btn btn-error btn-sm` |

### 3.4 상태 표시

```erb
<%# 관리자 여부 %>
<span class="badge <%= user.admin? ? 'badge-primary' : 'badge-ghost' %>">
  <%= user.admin? ? 'Admin' : 'User' %>
</span>

<%# 빈 상태 %>
<div class="text-center py-8 text-base-content/50">
  <%= t('admin.common.no_data') %>
</div>
```

---

## 4. 예상 작업량

| Phase | 작업 | 예상 시간 |
|-------|------|-----------|
| Phase 1 | 14개 뷰 파일 스타일 통일 | 2-3시간 |
| Phase 2 | 페이지네이션 파셜 + 적용 | 30분 |
| Phase 3 | 검색/필터 기능 | 1-2시간 |
| Phase 4 | CRUD 완성 | 3-4시간 |

**권장 우선순위**: Phase 1 → Phase 2 → Phase 3 → Phase 4

---

## 5. 작업 체크리스트

### Phase 1: 스타일 통일
- [ ] `admin/users/index.html.erb` DaisyUI 변환
- [ ] `admin/users/show.html.erb` DaisyUI 변환
- [ ] `admin/clubs/index.html.erb` DaisyUI 변환
- [ ] `admin/clubs/show.html.erb` DaisyUI 변환
- [ ] `admin/members/index.html.erb` DaisyUI 변환
- [ ] `admin/members/show.html.erb` DaisyUI 변환
- [ ] `admin/matches/index.html.erb` DaisyUI 변환
- [ ] `admin/matches/show.html.erb` DaisyUI 변환
- [ ] `admin/teams/index.html.erb` DaisyUI 변환
- [ ] `admin/teams/show.html.erb` DaisyUI 변환
- [ ] `admin/team_members/index.html.erb` DaisyUI 변환
- [ ] `admin/team_members/show.html.erb` DaisyUI 변환
- [ ] `admin/games/index.html.erb` DaisyUI 변환
- [ ] `admin/games/show.html.erb` DaisyUI 변환

### Phase 2: 페이지네이션
- [ ] `admin/shared/_pagination.html.erb` 생성
- [ ] 각 index 페이지에 파셜 삽입
- [ ] 컨트롤러에서 `paginate` 메서드 실제 호출 확인

### Phase 3: 검색/필터 (선택)
- [ ] Users 검색 기능
- [ ] Clubs 검색 기능
- [ ] Members 필터 기능
- [ ] Matches 날짜 필터

### Phase 4: CRUD 완성 (선택)
- [ ] edit/update 액션 추가
- [ ] destroy 액션 추가 (soft delete)
- [ ] 감사 로그 구현

---

## 6. 참고 사항

### 6.1 i18n 키
모든 admin 관련 번역 키는 `config/locales/*.yml`의 `admin.*` 네임스페이스에 이미 정의되어 있음.

### 6.2 권한 체크
`Admin::BaseController`에서 `before_action :require_admin`으로 관리자 권한 체크 완료.

### 6.3 기존 Dashboard 참고
`admin/dashboard/index.html.erb`가 이미 DaisyUI로 잘 구현되어 있으므로 이를 참고하여 나머지 페이지 통일.
