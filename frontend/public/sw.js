const CACHE_NAME = 'productivity-app-shell-v5';

// Derive the deploy base path from where this worker was registered
// ("" for root deploys, "/cheeryhub-manager/" for GitHub Pages).
const BASE_PATH = self.location.pathname.replace(/sw\.js$/, '').replace(/\/$/, '');
const INDEX_URL = `${BASE_PATH}/index.html`;

const APP_SHELL = [
  `${BASE_PATH}/`,
  INDEX_URL,
  `${BASE_PATH}/manifest.webmanifest`,
  `${BASE_PATH}/icon-192.png`,
  `${BASE_PATH}/icon-512.png`,
  // Critical fonts are part of first paint — never wait on the network for them.
  `${BASE_PATH}/fonts/manrope-latin.woff2`,
  `${BASE_PATH}/fonts/manrope-latin-ext.woff2`,
  `${BASE_PATH}/fonts/noto-sans-tamil-tamil.woff2`,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => Promise.allSettled(APP_SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Content-hashed bundles and fonts are immutable: serve from cache when
// possible and populate it on the first network miss. Everything else stays
// network-first (below) so fresh HTML/icons win over staleness.
function isImmutableAsset(url) {
  return url.pathname.startsWith(`${BASE_PATH}/assets/`) ||
    url.pathname.startsWith(`${BASE_PATH}/fonts/`);
}

function cacheFirst(request) {
  return caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    });
  });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never touch API responses, sockets or anything marked private/no-store.
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/socket.io/')) return;
  if (request.headers.has('authorization')) return;
  if (request.cache === 'no-store') return;

  // Navigations: network first, never cache error responses, fall back to
  // the cached app shell so a deep link (e.g. /goals) works offline too.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(INDEX_URL, copy));
            return response;
          }
          // Server answered (e.g. 404): serve the app shell instead of
          // persisting a stale error page.
          return caches.match(INDEX_URL).then((cached) => cached || response);
        })
        .catch(() =>
          caches.match(INDEX_URL).then((cached) => cached || Response.error())
        )
    );
    return;
  }

  // Hashed bundles + fonts: cache first (immutable). Other static files:
  // network first with cache fallback — same behaviour as before.
  if (isImmutableAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Static assets: cache successful responses only.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || Response.error()))
  );
});
