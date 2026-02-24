# Plan: i18n-hardcoded-fix (다국어 미지원 부분 수정)

## 개요
컨트롤러, Concern, 모델, 뷰에 하드코딩된 한국어 텍스트를 `I18n.t()`로 전환한다. 4개 로케일 파일(ko, en, ja, zh)에 번역 키를 추가한다.

## 현황 분석

### 이미 완료된 부분
- 대부분의 ERB 뷰: `t()` 헬퍼 적용 완료
- Admin, Settings, Scoreboards 등 주요 영역 i18n 적용
- JavaScript UI_MESSAGES: 10개 언어 자체 번역 시스템 (별도 관리, 이번 범위 외)
- 로케일 파일 구조: 네임스페이스 기반 정리 완료 (649줄)

### 미지원 부분 (이번 작업 범위)

총 **52개 항목**, 3개 카테고리로 분류

## 수정 범위

### Category 1: 컨트롤러 Flash 메시지 (25개, 높음)

#### ClubsController (7개)
| 줄 | 현재 텍스트 | i18n 키 |
|----|------------|---------|
| 41 | "클럽이 생성되었습니다." | `clubs.notices.created` |
| 52 | "클럽 정보가 수정되었습니다." | `clubs.notices.updated` |
| 60 | "클럽이 삭제되었습니다." | `clubs.notices.deleted` |
| 78 | "JSON 파일을 선택해주세요." | `clubs.errors.no_file` |
| 83 | "파일 크기가 너무 큽니다. (최대 10MB)" | `clubs.errors.file_too_large` |
| 91 | "JSON 파일 형식이 올바르지 않습니다." | `clubs.errors.invalid_json` |
| 96 | "복원 중 오류가 발생했습니다." | `clubs.errors.restore_failed` |

#### MembersController (5개)
| 줄 | 현재 텍스트 | i18n 키 |
|----|------------|---------|
| 26 | "멤버가 추가되었습니다." | `members.notices.created` |
| 37 | "멤버가 수정되었습니다." | `members.notices.updated` |
| 45 | "멤버가 삭제되었습니다." | `members.notices.deleted` |
| 51 | "CSV 파일을 선택해주세요." | `members.errors.no_file` |
| 73 | "#{imported}명의 멤버를 가져왔습니다." | `members.notices.imported` |

#### MatchesController (5개)
| 줄 | 현재 텍스트 | i18n 키 |
|----|------------|---------|
| 70 | "팀이 생성되었습니다." | `matches.notices.teams_created` |
| 95 | "경기 정보가 수정되었습니다." | `matches.notices.updated` |
| 104 | "경기가 삭제되었습니다." | `matches.notices.deleted` |
| 131 | "이미 진행된 게임이 있어 팀을 섞을 수 없습니다." | `matches.errors.games_in_progress` |
| 157 | "팀을 랜덤하게 새로 섞었습니다." | `matches.notices.shuffled` |

#### 기타 컨트롤러
- SessionsController, RegistrationsController 등은 이미 i18n 적용됨

### Category 2: Concern 메시지 (16개, 높음)

#### MatchGames (6개)
| 현재 텍스트 | i18n 키 |
|------------|---------|
| "2팀 경기에서만 경기 삭제가 가능합니다." | `matches.errors.two_team_only` |
| "최소 1경기는 유지되어야 합니다." | `matches.errors.min_games` |
| "이미 진행된 경기는 삭제할 수 없습니다." | `matches.errors.game_started` |
| "미진행 경기를 삭제했습니다." | `matches.notices.game_removed` |
| "삭제할 경기를 찾을 수 없습니다." | `matches.errors.game_not_found` |
| "경기 삭제에 실패했습니다." | `matches.errors.remove_failed` |

#### MatchScoring (10개)
| 현재 텍스트 | i18n 키 |
|------------|---------|
| "경기 점수가 수정되었습니다." | `matches.notices.scores_updated` |
| "수정할 점수 데이터가 없습니다." | `matches.errors.no_scores` |
| "점수 수정에 실패했습니다." | `matches.errors.update_failed` |
| "중단된 경기만 점수를 리셋할 수 있습니다." | `matches.errors.not_paused` |
| "모든 점수가 초기화되었습니다." | `matches.notices.scores_reset` |
| "점수 리셋에 실패했습니다." | `matches.errors.reset_failed` |
| "이미 종료된 경기입니다." | `matches.errors.already_finished` |
| "점수가 기록된 게임이 없습니다." | `matches.errors.no_recorded_games` |
| "경기가 종료되었습니다. 결과가 확정되었습니다." | `matches.notices.finished` |
| "경기 종료에 실패했습니다." | `matches.errors.finish_failed` |

### Category 3: ERB 뷰 하드코딩 (6개, 높음)

#### control.html.erb
| 현재 텍스트 | i18n 키 |
|------------|---------|
| "디스플레이 열기" (data-ui-key) | `scoreboards.control.open_display` |
| "리셋" (data-ui-key) | `scoreboards.control.reset` |
| "파울" (data-ui-key) | `scoreboards.control.foul` |
| "음성안내" (data-voice-label) | `scoreboards.control.voice_label` |
| "경기별 쿼터 점수" (data-ui-key) | `scoreboards.control.quarter_table_matchup` |

> 참고: 이 뷰에서 `data-ui-key` 속성의 값(한글)은 JS에서 i18n 함수로 교체되므로, 초기 렌더링 시 `t()` 헬퍼로 감싸면 됨.

### Category 4: 모델 상수 + CSV 헤더 (11개, 중간)

#### Member::POSITION_NAMES (5개)
- "포인트 가드", "슈팅 가드", "스몰 포워드", "파워 포워드", "센터"
- → `I18n.t("members.positions.#{key}")` 형태로 변경

#### CSV 헤더 (members_controller.rb) (5+1개)
- 내보내기 헤더: `%w[이름 나이 키 포지션 등번호]`
- 가져오기 파싱: 한글 컬럼명 매핑
- → `I18n.t("members.csv.name")` 등으로 변경

## 수정 대상 파일

| 파일 | 변경 항목 수 | 카테고리 |
|------|:-----------:|----------|
| `app/controllers/clubs_controller.rb` | 7 | Flash |
| `app/controllers/members_controller.rb` | 5+6 | Flash + CSV |
| `app/controllers/matches_controller.rb` | 5 | Flash |
| `app/controllers/concerns/match_games.rb` | 6 | Concern |
| `app/controllers/concerns/match_scoring.rb` | 10 | Concern |
| `app/views/scoreboards/control.html.erb` | 5 | 뷰 |
| `app/models/member.rb` | 5 | 모델 |
| `config/locales/ko.yml` | 52+ | 번역 키 |
| `config/locales/en.yml` | 52+ | 번역 키 |
| `config/locales/ja.yml` | 52+ | 번역 키 |
| `config/locales/zh.yml` | 52+ | 번역 키 |

## 범위 외 (이번 작업에서 제외)

1. **JavaScript UI_MESSAGES**: 이미 10개 언어로 자체 번역 시스템 구축 완료. Rails i18n API로의 전환은 별도 PDCA 필요
2. **DaisyUI 컴포넌트 텍스트**: 프레임워크 기본 텍스트
3. **Rails 기본 에러 메시지**: `activerecord.errors` 네임스페이스 (Rails 기본 제공)

## 작업 순서

1. **로케일 파일 키 추가** (4개 파일, 52+ 키)
2. **컨트롤러 Flash → t()** (3개 파일)
3. **Concern → t()** (2개 파일)
4. **ERB 뷰 → t()** (1개 파일)
5. **모델 상수 → I18n.t()** (1개 파일)
6. **CSV 헤더 → I18n.t()** (1개 파일)
7. **rubocop + brakeman 검사**

## 성공 기준

- [ ] 모든 사용자 대면 텍스트가 `t()` 또는 `I18n.t()`로 감싸져 있음
- [ ] 4개 로케일 파일(ko, en, ja, zh)에 동일한 키 구조 유지
- [ ] `bin/rubocop` 통과
- [ ] `bin/brakeman --no-pager` 통과
- [ ] 한국어 ↔ 영어 전환 시 모든 Flash 메시지가 올바르게 표시됨

## 기술적 제약

1. **interpolation 처리**: `"#{imported}명"` 같은 변수 포함 메시지는 `t('key', count: imported)` 형태 사용
2. **10개 로케일 파일**: 실제로는 10개 언어 파일이 있지만, 핵심 4개(ko, en, ja, zh)만 완전 번역. 나머지 6개(de, fr, es, it, pt, tl)는 ko fallback으로 동작
3. **CSV 호환성**: CSV 헤더 변경 시 기존 CSV 파일 가져오기 호환성 유지 필요 (다중 헤더 매핑)
