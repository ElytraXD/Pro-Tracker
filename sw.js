/* =============================================
   ELYTRA — Service Worker (PWA)
   ============================================= */

const CACHE_NAME = 'elytra-v1';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './media/pro-tracker-logo.png',
    './media/sounds/habit_complete.mp3',
    './media/sounds/totem.mp3',
    './media/sounds/level_up.mp3',
    './media/sounds/achievement.mp3',
    './media/sounds/bg_music.mp3',
];

// Install — cache core assets
self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Activate — clean up old caches
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// Fetch — network-first for API calls, cache-first for assets
self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);

    // Always go to network for Firebase/Firestore API calls
    if (url.hostname.includes('googleapis.com') ||
        url.hostname.includes('firebaseio.com') ||
        url.hostname.includes('gstatic.com') ||
        url.hostname.includes('google.com')) {
        return;
    }

    // Cache-first for local assets
    e.respondWith(
        caches.match(e.request).then(cached => {
            const networkFetch = fetch(e.request).then(response => {
                // Update cache with fresh version
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
                }
                return response;
            }).catch(() => cached); // Offline fallback to cache

            return cached || networkFetch;
        })
    );
});
