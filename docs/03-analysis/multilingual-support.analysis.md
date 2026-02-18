# Gap Analysis: multilingual-support

**Branch**: `codex/multilingual-support`
**Date**: 2026-02-13
**Match Rate**: **62%**

---

## 1. Summary

다국어 지원(i18n) 기능의 구현 상태를 분석합니다. 핵심 인프라(모델, 컨트롤러, locale 파일, 설정 UI)는 잘 구현되었으나, **많은 뷰 파일에 하드코딩된 한국어 텍스트**가 남아 있어 실제 다국어 전환 시 혼재 UI가 발생합니다.

---

## 2. Implementation Status

### 2.1 Completed (Match)

| # | Item | Status | Files |
|---|------|--------|-------|
| 1 | DB Migration - `preferred_locale` 컬럼 추가 | **Match** | `db/migrate/20260212044739_add_preferred_locale_to_users.rb` |
| 2 | User 모델 - `SUPPORTED_LOCALES`, `SPEECH_LOCALE_BY_PREFERRED_LOCALE`, validation, normalize | **Match** | `app/models/user.rb` |
| 3 | ApplicationController - `set_locale`, `current_locale`, `available_locale_options`, locale 우선순위 (params > user > session > default) | **Match** | `app/controllers/application_controller.rb` |
| 4 | Settings 페이지 - 언어 선택 UI + 저장 로직 | **Match** | `app/controllers/settings_controller.rb`, `app/views/settings/show.html.erb` |
| 5 | config/application.rb - `available_locales`, `default_locale`, `fallbacks` 설정 | **Match** | `config/application.rb` |
| 6 | 10개 Locale 파일 생성 (ko, ja, en, zh, fr, es, it, pt, tl, de) | **Match** | `config/locales/*.yml` |
| 7 | Layout - `lang` attribute 동적 설정 | **Match** | `app/views/layouts/application.html.erb`, `scoreboard_display.html.erb` |
| 8 | 인증 뷰 i18n (login, signup) | **Match** | `app/views/sessions/new.html.erb`, `app/views/registrations/new.html.erb` |
| 9 | Settings 뷰 완전 i18n | **Match** | `app/views/settings/show.html.erb` |
| 10 | Layout 사이드바 메뉴 i18n | **Match** | `app/views/layouts/application.html.erb` |
| 11 | 컨트롤러 flash 메시지 i18n (sessions, registrations, settings) | **Match** | `sessions_controller.rb`, `registrations_controller.rb`, `settings_controller.rb` |
| 12 | Scoreboard JS - UI_MESSAGES 10개 언어 번역 + `i18nForScoreboard()` + `applyStaticUiText()` | **Match** | `app/assets/javascripts/application.js` |
| 13 | Scoreboard control/display - `data-locale`, `data-voice-lang` data attribute 전달 | **Match** | `scoreboards/control.html.erb`, `scoreboards/display.html.erb` |
| 14 | Voice test - 언어별 preview_text + speech locale 매핑 | **Match** | `app/views/settings/show.html.erb` |

### 2.2 Gaps (Mismatch)

| # | Severity | Gap Description | Files |
|---|----------|----------------|-------|
| G1 | **Critical** | Clubs 뷰 전체 하드코딩 한국어 - index, show, new, edit, _form, backup | `app/views/clubs/*.html.erb` |
| G2 | **Critical** | Members 뷰 전체 하드코딩 한국어 - index, new, edit, _form | `app/views/members/*.html.erb` |
| G3 | **Critical** | Matches 뷰 전체 하드코딩 한국어 - index, show, new, edit | `app/views/matches/*.html.erb` |
| G4 | **Major** | Scoreboards index 뷰 하드코딩 ("점수판", "클럽 만들기") | `app/views/scoreboards/index.html.erb` |
| G5 | **Major** | Scoreboard control - `data-start-text`, `data-stop-text` 속성 하드코딩 한국어 | `app/views/scoreboards/control.html.erb:85-86` |
| G6 | **Major** | Scoreboard control - 일부 `aria-label` 하드코딩 한국어 (JS에서 `data-ui-aria-key`로 덮어쓰지만 초기값이 한국어) | `scoreboards/control.html.erb:304,319` |
| G7 | **Minor** | Share 레이아웃 - "농구 클럽 매니저", "경기 결과" 하드코딩 | `app/views/layouts/share.html.erb` |
| G8 | **Minor** | Stats 뷰 - 하드코딩 한국어 (content_for :title 등) | `app/views/stats/index.html.erb` |
| G9 | **Minor** | Admin 뷰 전체 하드코딩 한국어 | `app/views/admin/**/*.html.erb` |
| G10 | **Minor** | Locale 파일에 clubs/members/matches/stats/scoreboards 관련 번역 키 누락 | `config/locales/*.yml` |
| G11 | **Info** | Scoreboard control - "경기 추가", "공격 전환" 등 일부 버튼 텍스트가 ERB에 한국어로 쓰여 있으나 JS `applyStaticUiText()`가 `data-ui-key`로 덮어씀 - 실질적 문제는 작으나 JS 비활성시 한국어 노출 | `scoreboards/control.html.erb` |

---

## 3. Locale File Key Coverage

| Section | ko.yml | en.yml | ja.yml | zh.yml | fr.yml | es.yml | it.yml | pt.yml | tl.yml | de.yml |
|---------|--------|--------|--------|--------|--------|--------|--------|--------|--------|--------|
| app.name | O | O | O | O | O | O | O | O | O | O |
| auth.* | O | O | O | O | O | O | O | O | O | O |
| common.* | O | O | O | O | O | O | O | O | O | O |
| language.names.* | O | O | O | O | O | O | O | O | O | O |
| menu.* | O | O | O | O | O | O | O | O | O | O |
| settings.* | O | O | O | O | O | O | O | O | O | O |
| clubs.* | **X** | **X** | **X** | **X** | **X** | **X** | **X** | **X** | **X** | **X** |
| members.* | **X** | **X** | **X** | **X** | **X** | **X** | **X** | **X** | **X** | **X** |
| matches.* | **X** | **X** | **X** | **X** | **X** | **X** | **X** | **X** | **X** | **X** |
| stats.* | **X** | **X** | **X** | **X** | **X** | **X** | **X** | **X** | **X** | **X** |
| scoreboards.* | **X** | **X** | **X** | **X** | **X** | **X** | **X** | **X** | **X** | **X** |
| admin.* | **X** | **X** | **X** | **X** | **X** | **X** | **X** | **X** | **X** | **X** |

---

## 4. Score Breakdown

| Category | Weight | Score | Detail |
|----------|--------|-------|--------|
| Infrastructure (model, controller, config) | 25% | 25/25 | 완벽 구현 |
| Locale Files (auth, common, menu, settings) | 20% | 20/20 | 10개 언어 완성 |
| Auth/Settings 뷰 i18n | 15% | 15/15 | 완전 i18n |
| Layout i18n | 10% | 10/10 | 사이드바 + lang attr |
| Scoreboard JS i18n | 10% | 10/10 | 10개 언어 UI_MESSAGES |
| Clubs/Members/Matches 뷰 i18n | 15% | 0/15 | **전혀 미적용** |
| Locale 키 커버리지 (누락 섹션) | 5% | 0/5 | clubs/members/matches 키 없음 |

**Total Match Rate: 80/130 = 62%**

---

## 5. Recommendations

### 즉시 필요 (Match Rate 90% 달성을 위한)

1. **Locale 키 추가**: `config/locales/*.yml`에 clubs, members, matches, stats, scoreboards 섹션 추가 (10개 언어)
2. **Clubs 뷰 i18n 적용**: `_form.html.erb`, `index.html.erb`, `show.html.erb`, `new.html.erb`, `edit.html.erb`, `backup.html.erb`
3. **Members 뷰 i18n 적용**: `_form.html.erb`, `index.html.erb`, `new.html.erb`, `edit.html.erb`
4. **Matches 뷰 i18n 적용**: `index.html.erb`, `show.html.erb`, `new.html.erb`, `edit.html.erb`
5. **Scoreboards index 뷰 i18n 적용**

### 개선 권장

6. Scoreboard control의 `data-start-text`/`data-stop-text` data attribute를 locale 기반으로 변경
7. Share 레이아웃 i18n
8. Stats 뷰 i18n
9. Admin 뷰 i18n (낮은 우선순위 - admin은 내부용)
