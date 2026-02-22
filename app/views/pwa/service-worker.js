// BM Scoreboard Service Worker - 오프라인 스코어보드 지원
const CACHE_VERSION = "v1";
const CACHE_NAME = `bm-scoreboard-${CACHE_VERSION}`;

// 캐시할 에셋 패턴
const ASSET_EXTENSIONS = /\.(css|js|woff2?|ttf|eot|png|svg|ico)(\?|$)/;

// 캐시할 CDN 호스트 (Pretendard 폰트, Material Icons)
const CACHEABLE_CDN_HOSTS = [
  "cdn.jsdelivr.net",
  "fonts.googleapis.com",
  "fonts.gstatic.com"
];

// Network-first로 캐시할 페이지 경로
const OFFLINE_PAGES = [
  "/standalone_scoreboard",
  "/standalone_display"
];

// install: 기본 에셋 프리캐시
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        "/standalone_scoreboard",
        "/standalone_display",
        "/manifest"
      ]);
    }).then(() => self.skipWaiting())
  );
});

// activate: 이전 버전 캐시 정리
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key.startsWith("bm-scoreboard-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// fetch: 요청별 캐싱 전략
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // WebSocket, POST 등 비대상 요청은 무시
  if (event.request.method !== "GET") return;
  if (url.protocol === "ws:" || url.protocol === "wss:") return;

  // ActionCable 폴링 무시
  if (url.pathname === "/cable") return;

  // 스코어보드 페이지: Network-first (온라인이면 최신, 오프라인이면 캐시)
  if (OFFLINE_PAGES.some((p) => url.pathname === p)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // 에셋 파일 (CSS, JS, 폰트, 이미지): Cache-first
  if (ASSET_EXTENSIONS.test(url.pathname)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // CDN 리소스 (폰트): Cache-first
  if (CACHEABLE_CDN_HOSTS.includes(url.host)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }
});

// Network-first 전략: 네트워크 우선, 실패 시 캐시
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response("Offline - 캐시된 페이지 없음", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }
}

// Cache-first 전략: 캐시 우선, 없으면 네트워크에서 가져와 캐시
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    return new Response("", { status: 503 });
  }
}
