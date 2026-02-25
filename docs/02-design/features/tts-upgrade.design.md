# Design: tts-upgrade (스코어보드 고품질 TTS 업그레이드)

## 참조 문서

- Plan: `docs/01-plan/features/tts-upgrade.plan.md`

## 아키텍처 개요

```
┌─────────────────────────────────────────────────────────┐
│                    사전 생성 (1회성)                      │
│                                                          │
│  rails tts:generate                                      │
│     │                                                    │
│     ├── config/tts_voices.yml (언어별 voice_id 설정)     │
│     │                                                    │
│     ├── ElevenLabs API ──→ mp3 파일 생성                 │
│     │   POST /v1/text-to-speech/{voice_id}               │
│     │                                                    │
│     └── public/audio/tts/{locale}/                       │
│           ├── 0.mp3 ~ 50.mp3 (숫자)                      │
│           ├── vs.mp3 (접속사: 대/対/to/比)               │
│           └── countdown_1.mp3 ~ countdown_5.mp3          │
│                                                          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                 실시간 재생 (application.js)              │
│                                                          │
│  점수 변경 또는 카운트다운 이벤트                          │
│     │                                                    │
│     ├── [1순위] playTtsAudio()                           │
│     │     HTMLAudioElement로 mp3 즉시 재생               │
│     │     ↓ (파일 없음 / Audio 실패)                     │
│     │                                                    │
│     └── [2순위] Web Speech API (기존 폴백)               │
│           SpeechSynthesisUtterance + selectBestVoice()   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## 1. 사전 생성 시스템 (Rake 태스크)

### 1.1 config/tts_voices.yml

```yaml
# ElevenLabs 언어별 음성 설정
elevenlabs:
  api_url: "https://api.elevenlabs.io/v1/text-to-speech"
  model_id: "eleven_multilingual_v2"
  output_format: "mp3_44100_128"

voices:
  ko:
    voice_id: "<한국어 voice_id>"  # ElevenLabs에서 선택
    connector: "대"
    numbers:
      style: "sino_korean"  # 0→영, 1→일, 2→이, ..., 10→십, 11→십일
  ja:
    voice_id: "<일본어 voice_id>"
    connector: "対"
    numbers:
      style: "default"  # 0→零, 1→1, 2→2, ... (숫자 그대로)
  en:
    voice_id: "<영어 voice_id>"
    connector: "to"
    numbers:
      style: "default"  # 0→zero, 1→one, ... (TTS가 자동 변환)
  zh:
    voice_id: "<중국어 voice_id>"
    connector: "比"
    numbers:
      style: "default"  # 0→零, 1→1, ...

generation:
  countdown: [1, 2, 3, 4, 5]
  score_range: [0, 50]  # 0~50점 숫자 생성
```

### 1.2 lib/tasks/tts_generate.rake

```ruby
# 의사 코드
namespace :tts do
  desc "ElevenLabs API로 TTS 음성 파일 생성"
  task generate: :environment do
    config = YAML.load_file("config/tts_voices.yml")
    locale = ENV["LOCALE"]  # nil이면 전체 생성

    config["voices"].each do |lang, voice_config|
      next if locale && lang != locale

      voice_id = voice_config["voice_id"]
      output_dir = Rails.root.join("public", "audio", "tts", lang)
      FileUtils.mkdir_p(output_dir)

      # 1) 숫자 파일 생성 (0~50)
      texts = generate_number_texts(lang, voice_config, config["generation"]["score_range"])
      texts.each do |filename, text|
        generate_audio(config, voice_id, text, output_dir.join("#{filename}.mp3"))
      end

      # 2) 접속사 파일 생성
      connector = voice_config["connector"]
      generate_audio(config, voice_id, connector, output_dir.join("vs.mp3"))

      # 3) 카운트다운 파일 생성 (1~5)
      config["generation"]["countdown"].each do |n|
        text = countdown_text(lang, n)
        generate_audio(config, voice_id, text, output_dir.join("countdown_#{n}.mp3"))
      end
    end
  end
end
```

#### API 호출 함수

```ruby
def generate_audio(config, voice_id, text, output_path)
  return if File.exist?(output_path) && !ENV["FORCE"]

  uri = URI("#{config['elevenlabs']['api_url']}/#{voice_id}")
  response = Net::HTTP.post(
    uri,
    { text: text, model_id: config["elevenlabs"]["model_id"] }.to_json,
    "xi-api-key" => ENV["ELEVENLABS_API_KEY"],
    "Content-Type" => "application/json",
    "Accept" => "audio/mpeg"
  )

  if response.code == "200"
    File.binwrite(output_path, response.body)
    puts "✅ Generated: #{output_path}"
  else
    puts "❌ Failed: #{text} (#{response.code})"
  end

  sleep 0.5  # Rate limit 방지
end
```

> `Net::HTTP`를 직접 사용하므로 **추가 gem 불필요** (httparty/faraday 제거)

### 1.3 한국어 숫자 텍스트 생성

한국어는 TTS에 숫자를 그대로 넘기면 고유어("하나, 둘")로 읽을 수 있으므로, 한자어 텍스트로 변환하여 전달:

```ruby
def generate_number_texts(lang, voice_config, range)
  (range[0]..range[1]).map do |n|
    text = if voice_config.dig("numbers", "style") == "sino_korean"
             to_sino_korean(n)  # 0→영, 10→십, 23→이십삼
           else
             n.to_s
           end
    [n.to_s, text]  # [filename, tts_text]
  end
end
```

### 1.4 파일 구조

```
public/audio/tts/
├── ko/
│   ├── 0.mp3          # "영"
│   ├── 1.mp3          # "일"
│   ├── ...
│   ├── 50.mp3         # "오십"
│   ├── vs.mp3         # "대"
│   ├── countdown_1.mp3 # "일"
│   ├── countdown_2.mp3 # "이"
│   ├── countdown_3.mp3 # "삼"
│   ├── countdown_4.mp3 # "사"
│   └── countdown_5.mp3 # "오"
├── ja/
│   ├── 0.mp3 ~ 50.mp3
│   ├── vs.mp3         # "対"
│   └── countdown_1~5.mp3
├── en/
│   ├── 0.mp3 ~ 50.mp3
│   ├── vs.mp3         # "to"
│   └── countdown_1~5.mp3
└── zh/
    ├── 0.mp3 ~ 50.mp3
    ├── vs.mp3         # "比"
    └── countdown_1~5.mp3
```

**총 파일 수**: (51 + 1 + 5) * 4 = **228개**
**예상 용량**: ~1.1MB (파일당 ~5KB)

## 2. 프론트엔드 Audio API 재생 (application.js)

### 2.1 TTS Audio 플레이어 모듈

`application.js`의 스코어보드 초기화 블록 내에 추가:

```javascript
// ── TTS Audio 플레이어 ──────────────────────────────
const TTS_AUDIO_BASE = "/audio/tts";
const ttsAudioCache = {};  // { "ko/5": HTMLAudioElement }
let ttsAvailable = null;   // null=미확인, true/false

// mp3 파일 존재 여부 확인 (최초 1회)
const checkTtsAvailability = () => {
  if (ttsAvailable !== null) return Promise.resolve(ttsAvailable);
  const langPrefix = uiLocale;
  const testUrl = `${TTS_AUDIO_BASE}/${langPrefix}/vs.mp3`;
  return fetch(testUrl, { method: "HEAD" })
    .then((r) => { ttsAvailable = r.ok; return ttsAvailable; })
    .catch(() => { ttsAvailable = false; return false; });
};

// Audio 프리로드 및 캐싱
const getTtsAudio = (locale, filename) => {
  const key = `${locale}/${filename}`;
  if (ttsAudioCache[key]) return ttsAudioCache[key];
  const audio = new Audio(`${TTS_AUDIO_BASE}/${key}.mp3`);
  audio.preload = "auto";
  ttsAudioCache[key] = audio;
  return audio;
};

// 단일 mp3 재생 (Promise 반환)
const playTtsFile = (locale, filename) => {
  return new Promise((resolve, reject) => {
    const audio = getTtsAudio(locale, filename);
    audio.currentTime = 0;
    audio.onended = resolve;
    audio.onerror = reject;
    audio.play().catch(reject);
  });
};

// 점수 안내: [home.mp3] → [vs.mp3] → [away.mp3] 연결 재생
const playScoreAnnouncement = async (homeScore, awayScore) => {
  const locale = uiLocale;
  const home = Math.min(Math.max(0, homeScore), 50);
  const away = Math.min(Math.max(0, awayScore), 50);
  try {
    await playTtsFile(locale, String(home));
    await new Promise((r) => setTimeout(r, 80));  // 자연스러운 간격
    await playTtsFile(locale, "vs");
    await new Promise((r) => setTimeout(r, 80));
    await playTtsFile(locale, String(away));
  } catch (e) {
    console.warn("🔊 TTS audio failed, falling back to Web Speech API", e);
    throw e;  // 호출자가 폴백 처리
  }
};

// 카운트다운 재생
const playCountdownAudio = async (count) => {
  try {
    await playTtsFile(uiLocale, `countdown_${count}`);
  } catch (e) {
    throw e;  // 호출자가 폴백 처리
  }
};
```

### 2.2 기존 speak() 함수 수정

**변경 전** (카운트다운):
```javascript
const speak = (text) => {
  if (!isVoiceEnabled() || !("speechSynthesis" in window)) return;
  // ... SpeechSynthesisUtterance 생성 및 재생
};
```

**변경 후**:
```javascript
const speak = (text) => {
  if (!isVoiceEnabled()) return;

  const numText = Number(text);
  if (numText === lastSpokenCountdown) return;
  lastSpokenCountdown = numText;
  setTimeout(() => {
    if (lastSpokenCountdown === numText) lastSpokenCountdown = -1;
  }, 2000);

  // 1순위: TTS Audio (mp3)
  if (ttsAvailable && numText >= 1 && numText <= 5) {
    playCountdownAudio(numText).catch(() => {
      speakWithWebSpeechAPI(text);  // 폴백
    });
    return;
  }

  // 2순위: Web Speech API (기존)
  speakWithWebSpeechAPI(text);
};

// 기존 Web Speech API 로직을 별도 함수로 분리
const speakWithWebSpeechAPI = (text) => {
  if (!("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(
    i18nForScoreboard("voice_countdown_pattern", { count: text })
  );
  utterance.lang = scoreboardVoiceLang;
  utterance.rate = currentVoiceRate();
  utterance.volume = 1.0;
  const langPrefix = String(scoreboardVoiceLang || "").toLowerCase().split("-")[0];
  const bestVoice = selectBestVoice(langPrefix);
  if (bestVoice) utterance.voice = bestVoice;
  safeSpeak(utterance);
};
```

### 2.3 기존 doSpeakScore() 함수 수정

**변경 전**:
```javascript
const doSpeakScore = () => {
  initializeVoice();
  // ... SpeechSynthesisUtterance 생성 및 재생
};
```

**변경 후**:
```javascript
const doSpeakScore = () => {
  const [visualHome, visualAway] = currentMatchup();
  const homeScore = visualHome.score;
  const awayScore = visualAway.score;

  // 1순위: TTS Audio (mp3 연결 재생)
  if (ttsAvailable && homeScore <= 50 && awayScore <= 50) {
    playScoreAnnouncement(homeScore, awayScore).catch(() => {
      doSpeakScoreWithWebSpeechAPI(homeScore, awayScore);  // 폴백
    });
    return;
  }

  // 2순위: Web Speech API (기존)
  doSpeakScoreWithWebSpeechAPI(homeScore, awayScore);
};

// 기존 Web Speech API 점수 안내를 별도 함수로 분리
const doSpeakScoreWithWebSpeechAPI = (homeScore, awayScore) => {
  initializeVoice();
  const homeScoreText = spokenNumber(homeScore);
  const awayScoreText = spokenNumber(awayScore);
  const text = i18nForScoreboard("voice_score_pattern", {
    home: homeScoreText, away: awayScoreText
  });
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = scoreboardVoiceLang;
  utterance.rate = currentVoiceRate();
  utterance.volume = 1.0;
  utterance.pitch = 1.0;
  // ... (기존 speakWithVoice 로직 유지)
};
```

### 2.4 초기화 시 TTS 가용성 확인

스코어보드 초기화 시 mp3 파일 존재 여부를 비동기로 확인:

```javascript
// 스코어보드 초기화 블록 끝부분에 추가
checkTtsAvailability().then((available) => {
  console.log("🔊 TTS Audio available:", available);
  if (available) {
    // 자주 사용할 파일 프리로드
    [1, 2, 3, 4, 5].forEach((n) => getTtsAudio(uiLocale, `countdown_${n}`));
    getTtsAudio(uiLocale, "vs");
  }
});
```

## 3. Service Worker 캐싱

### 기존 service-worker.js에 추가

```javascript
// TTS 오디오 파일 캐싱 (오프라인 지원)
const TTS_CACHE = "tts-audio-v1";
const TTS_URLS = [];  // 동적 생성 또는 별도 매니페스트

self.addEventListener("fetch", (event) => {
  if (event.request.url.includes("/audio/tts/")) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(TTS_CACHE).then((cache) => cache.put(event.request, clone));
          return response;
        });
      })
    );
  }
});
```

## 4. 구현 순서 (체크리스트)

### Step 1: Rake 태스크 + 설정 파일
- [ ] `config/tts_voices.yml` 생성
- [ ] `lib/tasks/tts_generate.rake` 생성
- [ ] `to_sino_korean()` Ruby 헬퍼 함수 작성
- [ ] `rails tts:generate` 실행하여 228개 mp3 생성
- [ ] `public/audio/tts/` 에 파일 확인

### Step 2: application.js 수정
- [ ] TTS Audio 플레이어 모듈 추가 (`checkTtsAvailability`, `getTtsAudio`, `playTtsFile`, `playScoreAnnouncement`, `playCountdownAudio`)
- [ ] `speak()` 함수 수정 (TTS 1순위 + Web Speech API 폴백)
- [ ] `doSpeakScore()` 함수 수정 (TTS 1순위 + Web Speech API 폴백)
- [ ] 초기화 시 `checkTtsAvailability()` 호출 + 프리로드

### Step 3: Service Worker 업데이트
- [ ] `/audio/tts/` 경로 캐싱 로직 추가

### Step 4: 검증
- [ ] 4개 언어 점수 안내 테스트 (ko, ja, en, zh)
- [ ] 4개 언어 카운트다운 테스트
- [ ] 50점 초과 시 Web Speech API 폴백 확인
- [ ] mp3 없는 언어(fr 등) Web Speech API 폴백 확인
- [ ] 오프라인 상태에서 mp3 재생 확인
- [ ] rubocop / brakeman 통과

## 5. 기존 코드와의 호환성

| 항목 | 영향 | 대응 |
|------|------|------|
| `voice_enabled` state | 변경 없음 | TTS Audio도 동일 플래그 체크 |
| `voice_rate` state | TTS Audio에는 미적용 | mp3는 고정 속도, Web Speech API 폴백 시에만 적용 |
| `scoreboardVoiceLang` | 언어 결정에 사용 | `uiLocale`로 mp3 폴더 결정 |
| `toSinoKoreanNumber()` | TTS Audio에서는 불필요 | mp3가 이미 한자어로 생성됨, Web Speech API 폴백 시에만 사용 |
| `safeSpeak()` | Web Speech API 전용 | 폴백 함수에서만 호출 |
| 카운트다운 중복 방지 | 유지 | `lastSpokenCountdown` 로직 유지 |
| 점수 debounce | 유지 | `speakScoreTimeout` 로직 유지 |

## 6. 위험 요소 및 대응

| 위험 | 확률 | 대응 |
|------|------|------|
| ElevenLabs API 키 만료/변경 | 낮음 | mp3는 이미 생성된 정적 파일, API 키 없어도 재생 가능 |
| 점수 50점 초과 | 낮음 | Web Speech API로 자동 폴백 |
| Audio API 비지원 브라우저 | 매우 낮음 | Web Speech API로 폴백 |
| mp3 파일 로딩 지연 | 낮음 | 프리로드 + 캐싱으로 최소화 |
| 연결 재생 시 부자연스러운 간격 | 중간 | 80ms pause 조정으로 자연스럽게 |
