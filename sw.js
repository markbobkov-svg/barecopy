/* Barecopy service worker — precache all app assets so the tool works fully
   offline after the first visit. Cache-first; the app is static so this is safe. */
const CACHE = "barecopy-v1.3.2";
const ASSETS = [
  "/",
  "/index.html",
  "/config.js",
  "/fonts.css",
  "/vendor/jszip.min.js",
  "/vendor/pdf-lib.min.js",
  "/vendor/exif.min.js",
  "/fonts/sans-400.woff2",
  "/fonts/sans-500.woff2",
  "/fonts/sans-600.woff2",
  "/fonts/sans-700.woff2",
  "/fonts/cond-600.woff2",
  "/fonts/cond-700.woff2",
  "/fonts/mono-400.woff2",
  "/fonts/mono-500.woff2",
  "/fonts/mono-600.woff2",
  "/favicon.svg",
  "/manifest.webmanifest"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      // Don't fail the whole install if one optional asset 404s.
      Promise.allSettled(ASSETS.map(u => c.add(u)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  // Never intercept cross-origin (e.g. the Polar licence check must hit network).
  if(url.origin !== self.location.origin) return;
  if(e.request.method !== "GET") return;

  const isHTML = e.request.mode === "navigate" || url.pathname.endsWith(".html") || url.pathname === "/";

  if(isHTML){
    // Network-first for HTML: every deploy is visible on the very next load.
    // The cache is only a fallback when there's genuinely no connection —
    // that's what keeps the "works in airplane mode" claim true.
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(()=>{});
        return res;
      }).catch(() => caches.match(e.request).then(hit => hit || caches.match("/index.html")))
    );
    return;
  }

  // Cache-first for static assets (fonts, vendor libs): these change only
  // when the CACHE version bumps, so instant offline loading is safe here.
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(()=>{});
      return res;
    }).catch(() => caches.match("/index.html")))
  );
});
