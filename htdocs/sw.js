const CACHE = 'training-plan-v1';

// Assets to precache on install
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon.svg',
];

// Install: precache shell assets
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE))
  );
});

// Activate: purge old cache versions
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch strategy:
//   • Navigation (HTML): network-first → cache fallback (always fresh if online)
//   • CDN / fonts:        cache-first  → revalidate in background
//   • Firebase:           network-only (auth/data must be live)
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Skip Firebase API calls — never intercept auth or Firestore
  if (url.hostname.includes('googleapis.com') ||
      url.hostname.includes('firebaseio.com') ||
      url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('identitytoolkit.googleapis.com')) {
    return;
  }

  // Navigation requests: network-first
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          // Clone synchronously — the original is returned and its body consumed
          // immediately, so cloning inside the async cache .then would be too late.
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Everything else: cache-first, update in background
  e.respondWith(
    caches.match(req).then(cached => {
      const networkFetch = fetch(req).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);

      return cached || networkFetch;
    })
  );
});
