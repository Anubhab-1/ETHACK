const CACHE_NAME = "aether-cache-v2";
const PRECACHE_ASSETS = [
  "/",
  "/field-officer",
  "/citizen",
  "/reports",
  "/advisory",
  "/forecast",
  "/dashboard",
  "/manifest.json",
  "/icon-192x192.png",
  "/icon-512x512.png",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
];

// On install, precache the shell pages and essential static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[Service Worker] Precaching app shell");
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  self.skipWaiting();
});

// On activation, clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log("[Service Worker] Deleting old cache:", cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch interception with a hybrid Network-First & Cache-First strategy
self.addEventListener("fetch", (event) => {
  // Only handle standard GET requests
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // 1. API requests: Network-First, cache fresh responses for offline reading
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Clone response and save to cache
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Fall back to cached API response (so static widgets show last-loaded state offline)
          return caches.match(event.request);
        })
    );
    return;
  }

  // 2. HTML document navigations: Network-First, fall back to cache
  const isHTMLNavigation = event.request.mode === "navigate" || 
    event.request.headers.get("accept")?.includes("text/html");

  if (isHTMLNavigation) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            // Fallback to home page if specific route is not cached
            return caches.match("/");
          });
        })
    );
    return;
  }

  // 3. Static assets (JS, CSS, images, Leaflet tiles): Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Trigger background fetch to update the cache
        fetch(event.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse);
            });
          }
        }).catch(() => {/* Ignore background sync failures */});
        
        return cachedResponse;
      }
      
      // Cache miss: fetch, cache, and return
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch((err) => {
        console.log("Fetch failed for asset:", event.request.url, err);
      });
    })
  );
});
