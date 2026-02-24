# Gap Analysis: i18n-hardcoded-fix (다국어 미지원 부분 수정)

## 분석 개요
- **분석일**: 2026-02-24
- **Plan 문서**: `docs/01-plan/features/i18n-hardcoded-fix.plan.md`
- **Match Rate**: 98%
- **판정**: PASS (>= 90%)

## 전체 점수

| 카테고리 | 점수 | 상태 |
|----------|:-----:|:------:|
| Design Match (Plan 항목 구현율) | 96% | PASS |
| 로케일 키 일관성 (4개 파일 간) | 100% | PASS |
| 하드코딩 제거율 (대상 파일 내) | 100% | PASS |
| **전체** | **98%** | **PASS** |

## 항목별 매칭 결과

| 카테고리 | Plan 항목 수 | 구현 수 | 매칭율 |
|----------|:-----------:|:------:|:------:|
| Category 1: 컨트롤러 Flash (25개) | 25 | 25 | 100% |
| Category 2: Concern 메시지 (16개) | 16 | 16 | 100% |
| Category 3: ERB 뷰 (5개) | 5 | 5 | 100% |
| Category 4: 모델+CSV (11개) | 11 | 11 | 100% |
| **합계** | **57** | **57** | **100%** |

> Plan 문서에는 "52개 항목"으로 기재되어 있으나, 실제 본문 Category 합산은 57개.

## Plan 대비 변경된 구현 (1건)

| 항목 | Plan | 실제 구현 | 영향도 |
|------|------|----------|:------:|
| `POSITION_NAMES` 상수 | 한국어 → `I18n.t()` 전환 | 영어 fallback 상수 유지 + `position_name` 메서드에서 `I18n.t()` 사용 | 낮음 (더 안전한 방식) |

## Plan에 없지만 추가 구현된 항목 (15개+)

구현 과정에서 Plan 범위 외의 하드코딩도 함께 i18n으로 전환:
- `members.errors.import_failed` (CSV 가져오기 실패)
- `matches.notices.results_saved` (경기 결과 저장)
- `matches.errors.create_failed/delete_failed` (CRUD 실패)
- `matches.errors.no_members_to_shuffle/shuffle_failed` (팀 섞기)
- `matches.errors.invalid_share_link/members_not_found/min_members/max_members` (검증)
- `matches.errors.two_team_only_add/max_games/invalid_teams/add_game_failed` (게임 추가)
- `scoreboards.control.*` 추가 키 다수

## 로케일 키 일관성

| 파일 | Plan 요구 키 | 추가 키 | 구조 일치 |
|------|:-----------:|:------:|:---------:|
| `ko.yml` | 전체 존재 | 다수 추가 | PASS |
| `en.yml` | 전체 존재 | 다수 추가 | PASS |
| `ja.yml` | 전체 존재 | 다수 추가 | PASS |
| `zh.yml` | 전체 존재 | 다수 추가 | PASS |

## 성공 기준 달성

| 기준 | 상태 |
|------|:----:|
| 모든 대상 파일 텍스트 `t()`/`I18n.t()` 적용 | PASS |
| 4개 로케일 파일 동일 키 구조 | PASS |
| `bin/rubocop` 통과 | PASS (0 offenses) |
| `bin/brakeman` 통과 | PASS (0 warnings) |
| CSV 호환성 유지 (다중 헤더 매핑) | PASS |

## 후속 PDCA 제안

Plan 범위 외 파일에 남아있는 한국어 하드코딩 약 25개:
- `match_membership.rb` (~10개)
- `club_invitations_controller.rb` (~2개)
- `club_memberships_controller.rb` (~7개)
- `club_joins_controller.rb` (~4개)
- `feedbacks_controller.rb` (~1개)
- `admin/feedbacks_controller.rb` (~1개)

## 결론

Plan 문서에서 정의한 범위 내 모든 항목이 올바르게 구현되었으며, 추가로 15개 이상의 하드코딩도 함께 i18n 전환 완료. 4개 로케일 파일 간 키 구조 일관성 완벽. Match Rate **98%**.
