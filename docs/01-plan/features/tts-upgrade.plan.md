# Plan: tts-upgrade (스코어보드 음성 안내 고품질 TTS 업그레이드)

## 개요

현재 스코어보드 음성 안내는 Web Speech API(브라우저 내장 TTS)를 사용하는데, 일본어/중국어/영어 등 한국어 외 언어에서 음성 품질이 부자연스럽다. ElevenLabs API를 활용하여 고품질 음성 파일을 사전 생성(pre-generate)하고, Audio API로 재생하는 방식으로 업그레이드한다.

## 현황 분석

### 현재 구현 (Web Speech API)

- **위치**: `app/assets/javascripts/application.js`
- **음성 종류**: 2가지
  - **점수 안내**: `voice_score_pattern` (예: "5 대 3", "5 to 3", "5 対 3")
  - **카운트다운**: `voice_countdown_pattern` (예: "5", "4", "3", "2", "1")
- **음성 선택**: `selectBestVoice()` 함수 — 품질 점수 기반 (Premium > Google > 일반)
- **지원 언어**: 10개 (ko, ja, en, zh, fr, es, it, pt, tl, de)
- **문제점**:
  - 브라우저/OS에 따라 음성 품질 천차만별
  - 특히 ja, zh, en에서 로봇 같은 어색한 음성
  - macOS compact 음성이 선택될 수 있음
  - 사용자가 음성 품질을 제어할 수 없음

### 음성 안내가 사용되는 시점

1. **점수 변경 시** (`speakScore()` → `doSpeakScore()`)
   - home/away 점수를 읽어줌: "5 대 3"
   - control 역할에서만 발화
2. **카운트다운** (`speakCountdownIfNeeded()` → `speak()`)
   - 쿼터/샷클락 5초 이하일 때: "5", "4", "3", "2", "1"
3. **한국어 특수 처리**: `toSinoKoreanNumber()`로 한자어 숫자 변환 (십, 이십 등)

## 전략: 사전 생성 + 로컬 캐싱 (방식 B)

### 이유

스코어보드 TTS의 특성상 발화 내용이 **제한적이고 반복적**이다:
- 카운트다운: 1~5 (5개)
- 점수: 0~150 범위의 숫자 조합 (실질적으로 0~50 정도)
- 점수 패턴: "{숫자} {접속사} {숫자}"

따라서 실시간 API 호출 대신 **미리 음성 파일을 생성**해두면:
- 지연 시간 없음 (로컬 재생)
- API 비용 1회성
- 오프라인에서도 작동
- 일관된 고품질 보장

### 사전 생성할 음성 목록

#### 언어별 공통 (4개 언어: ko, ja, en, zh)

| 카테고리 | 내용 | 파일 수/언어 |
|----------|------|:----------:|
| 카운트다운 | "1" ~ "5" | 5개 |
| 숫자 (점수용) | "0" ~ "50" | 51개 |
| 접속사 | "대", "対", "to", "比" | 1개 |
| **소계** | | **57개** |
| **4개 언어 합계** | | **228개** |

> 점수 안내는 "{숫자}" + "{접속사}" + "{숫자}"를 **3개 오디오를 연결 재생**하는 방식으로 구현하면, 숫자 파일 51개 + 접속사 1개만으로 모든 점수 조합 커버 가능

### ElevenLabs API 사용량 추정

- 숫자 1개 평균: ~2자
- 접속사 1개 평균: ~3자
- 총: (51 * 2 + 3) * 4언어 = **420자** (Free tier 월 20분 대비 극히 적음)

## 수정 범위

### 새로 추가할 파일

| 파일 | 역할 |
|------|------|
| `lib/tasks/tts_generate.rake` | ElevenLabs API로 음성 파일 생성 Rake 태스크 |
| `public/audio/tts/{locale}/{text}.mp3` | 사전 생성된 음성 파일 (228개) |
| `config/tts_config.yml` | ElevenLabs voice_id, 언어 매핑 설정 |

### 수정할 기존 파일

| 파일 | 변경 내용 |
|------|----------|
| `app/assets/javascripts/application.js` | Audio API 재생 로직 추가, Web Speech API를 폴백으로 전환 |
| `app/views/scoreboards/control.html.erb` | TTS 모드 선택 UI (고품질/기본) |
| `app/views/settings/show.html.erb` | TTS 설정 옵션 (선택적) |
| `Gemfile` | httparty 또는 faraday gem 추가 (API 호출용) |
| `.gitignore` | ElevenLabs API 키 파일 제외 |

### 환경변수

| 변수 | 설명 |
|------|------|
| `ELEVENLABS_API_KEY` | ElevenLabs API 키 (Railway/Render 환경변수) |

## 구현 계획

### Phase 1: 음성 파일 사전 생성 시스템

1. ElevenLabs API 연동 Rake 태스크 작성
   - `rails tts:generate` — 전체 음성 생성
   - `rails tts:generate LOCALE=ja` — 특정 언어만
2. 언어별 voice_id 설정 (config/tts_config.yml)
3. 생성된 mp3 파일을 `public/audio/tts/` 에 저장

### Phase 2: 프론트엔드 Audio API 재생

1. `application.js`에 Audio 기반 TTS 재생기 추가
   - `playTtsAudio(locale, text)` — 캐싱된 mp3 재생
   - `playScoreAnnouncement(home, away)` — 숫자+접속사 연결 재생
2. Web Speech API를 폴백으로 유지
   - mp3 파일이 없거나 Audio API 실패 시 기존 방식으로 폴백
3. `HTMLAudioElement` 프리로드로 지연 최소화

### Phase 3: UI 및 설정

1. control.html.erb에 TTS 품질 토글 (고품질/기본)
2. 사용자 설정에 TTS 모드 저장 (선택적)

### Phase 4: 배포 및 검증

1. Rake 태스크로 음성 파일 생성
2. mp3 파일을 Git에 포함 (용량 작음, ~228개 * ~5KB = ~1.1MB)
3. 실기기 테스트 (ko, ja, en, zh)

## 기술적 고려사항

### Audio API 연결 재생 전략

점수 "5 대 3"을 안내할 때:
```
[5.mp3] → [대.mp3] → [3.mp3]
```
- 각 오디오의 `onended` 이벤트로 다음 파일 재생
- 간격: 50~100ms pause로 자연스러운 리듬

### 폴백 체인

```
1. ElevenLabs 사전생성 mp3 (고품질)
   ↓ (파일 없음 또는 Audio API 실패)
2. Web Speech API (기존 방식)
   ↓ (speechSynthesis 미지원)
3. 무음 (음성 비활성화 상태)
```

### 파일 크기 추정

- ElevenLabs mp3: 평균 ~5KB/파일 (짧은 숫자)
- 228개 파일: ~1.1MB 총량
- Git 저장 가능한 수준

### 오프라인 지원

- mp3 파일이 `public/` 에 있으므로 PWA Service Worker로 캐싱 가능
- 기존 `service-worker.js`에 `/audio/tts/` 경로 추가

## 검증 방법

1. **음성 품질**: 4개 언어(ko, ja, en, zh)에서 점수/카운트다운 자연스러운지 확인
2. **지연 시간**: Audio API 재생이 Web Speech API 대비 빠르거나 동등한지 확인
3. **폴백**: mp3 없는 언어(fr, es 등)에서 Web Speech API로 정상 폴백 확인
4. **오프라인**: 인터넷 없이 mp3 재생 정상 동작 확인
5. **rubocop / brakeman**: 코드 품질 검사 통과

## 의존성

- ElevenLabs 계정 + API 키 (Free tier 충분)
- httparty 또는 faraday gem (Rake 태스크에서 API 호출)

## 일정 추정

| Phase | 작업량 |
|-------|--------|
| Phase 1: Rake 태스크 + 음성 생성 | 중간 |
| Phase 2: Audio API 프론트엔드 | 중간 |
| Phase 3: UI 토글 | 작음 |
| Phase 4: 테스트 + 배포 | 작음 |
