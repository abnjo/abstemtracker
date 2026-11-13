// AB STEM Tracker Service Worker (Offline PWA Engine)
const CACHE_NAME = 'abstemtracker-v1';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './manifest.json',
  './resources/stem.png',
  './resources/stem.svg',
  './resources/icon-192.png',
  './resources/icon-512.png',
  './resources/icon-maskable-192.png',
  './resources/icon-maskable-512.png',
  './resources/apple-touch-icon.png',
  './resources/favicon-32.png',
  './resources/favicon-16.png',
  './resources/favicon.ico',
  './resources/katex/katex.min.css',
  './resources/katex/katex.min.js',
  './resources/katex/contrib/auto-render.min.js',
  './resources/katex/fonts/KaTeX_AMS-Regular.woff2',
  './resources/katex/fonts/KaTeX_Caligraphic-Bold.woff2',
  './resources/katex/fonts/KaTeX_Caligraphic-Regular.woff2',
  './resources/katex/fonts/KaTeX_Fraktur-Bold.woff2',
  './resources/katex/fonts/KaTeX_Fraktur-Regular.woff2',
  './resources/katex/fonts/KaTeX_Main-Bold.woff2',
  './resources/katex/fonts/KaTeX_Main-BoldItalic.woff2',
  './resources/katex/fonts/KaTeX_Main-Italic.woff2',
  './resources/katex/fonts/KaTeX_Main-Regular.woff2',
  './resources/katex/fonts/KaTeX_Math-BoldItalic.woff2',
  './resources/katex/fonts/KaTeX_Math-Italic.woff2',
  './resources/katex/fonts/KaTeX_SansSerif-Bold.woff2',
  './resources/katex/fonts/KaTeX_SansSerif-Italic.woff2',
  './resources/katex/fonts/KaTeX_SansSerif-Regular.woff2',
  './resources/katex/fonts/KaTeX_Script-Regular.woff2',
  './resources/katex/fonts/KaTeX_Size1-Regular.woff2',
  './resources/katex/fonts/KaTeX_Size2-Regular.woff2',
  './resources/katex/fonts/KaTeX_Size3-Regular.woff2',
  './resources/katex/fonts/KaTeX_Size4-Regular.woff2',
  './resources/katex/fonts/KaTeX_Typewriter-Regular.woff2'
];

// Install: Pre-cache core shell & assets
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      // Use individual caching so if any non-critical font is missing it won't abort
      const cachePromises = CORE_ASSETS.map(url => {
        return fetch(new Request(url, { cache: 'reload' }))
          .then(response => {
            if (response && response.status === 200) {
              return cache.put(url, response);
            }
          })
          .catch(err => {
            console.warn(`[PWA SW] Pre-cache fallback for ${url}:`, err.message);
          });
      });
      await Promise.all(cachePromises);
    })
  );
});

// Activate: Clean up older cache versions and claim clients immediately
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('[PWA SW] Removing outdated cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Cache-First with Stale-While-Revalidate & Offline Fallback
self.addEventListener('fetch', event => {
  const req = event.request;

  // Only handle GET requests
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Skip chrome-extension and unsupported schemes
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  event.respondWith(
    caches.match(req).then(cachedResponse => {
      // Background revalidation
      const fetchPromise = fetch(req).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const resClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(req, resClone);
          });
        }
        return networkResponse;
      }).catch(err => {
        // Network failed (offline)
        if (req.mode === 'navigate') {
          return caches.match('./index.html');
        }
        throw err;
      });

      // Return cached version immediately if available, otherwise wait for network
      if (cachedResponse) {
        // Kick off revalidation in background
        event.waitUntil(fetchPromise.catch(() => {/* ignore offline error */}));
        return cachedResponse;
      }

      return fetchPromise.catch(() => {
        // If neither cache nor network worked
        if (req.mode === 'navigate') {
          return caches.match('./index.html');
        }
        if (req.destination === 'image') {
          return caches.match('./resources/icon-192.png');
        }
      });
    })
  );
});

// Message listener for skipWaiting or manual sync
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
