/* Schedule Binder service worker — 완전 오프라인 지원
 * 앱 셸(HTML/CSS/JS/아이콘)을 캐시해 인터넷 없이도 실행되게 한다.
 * Supabase·Google 등 외부 API는 캐시하지 않고 네트워크로 통과시킨다.
 * 캐시를 새로 배포할 때는 CACHE 버전 문자열만 올리면 된다.
 */
const CACHE = "schedule-binder-v7";
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./styles.css",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // 외부 출처(Supabase, Google 등)는 가로채지 않고 네트워크로 통과 → 온라인 동기화 그대로
  if (url.origin !== self.location.origin) return;

  // 페이지 이동 요청: 네트워크 우선, 실패 시 캐시된 앱 셸로 폴백
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true })
          .then((m) => m || caches.match("./index.html", { ignoreSearch: true })))
    );
    return;
  }

  // 동일 출처 정적 자원: 캐시 우선 + 백그라운드 갱신(stale-while-revalidate)
  // ?v= 쿼리스트링이 붙어도 매칭되도록 ignoreSearch 사용
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
