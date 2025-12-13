// Version 7: บังคับอัปเดตใหม่
const CACHE_NAME = 'repeater-map-v7'; 
const DATA_CACHE_NAME = 'repeater-data-v7';
const TILE_CACHE_NAME = 'repeater-tiles-v7';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  
  // *** ไฟล์รูปภาพไอค่อน (ตรวจสอบว่าอัปโหลดไฟล์จริงครบทุกชื่อ) ***
  './antenna.png',        
  './antenna_dstar.png',  
  './antenna_echo.png',
  './antenna_center.png', 

  // Libraries และรูปเสริม
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js',
  'https://cdn-icons-png.flaticon.com/128/25/25694.png', // Home Icon
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_TO_CACHE)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keyList => Promise.all(keyList.map(key => {
      if (key !== CACHE_NAME && key !== DATA_CACHE_NAME && key !== TILE_CACHE_NAME) return caches.delete(key);
    })))
  );
  return self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (url.hostname.includes('google.com') && url.pathname.includes('spreadsheets')) {
    event.respondWith(
        fetch(event.request).then(response => {
            return caches.open(DATA_CACHE_NAME).then(cache => {
                cache.put(event.request, response.clone());
                return response;
            });
        }).catch(() => caches.match(event.request))
    );
  }
  else if (url.hostname.includes('openstreetmap.org')) {
    event.respondWith(
      caches.open(TILE_CACHE_NAME).then(cache => {
        return cache.match(event.request).then(response => {
          const fetchPromise = fetch(event.request).then(networkResponse => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
          return response || fetchPromise;
        });
      })
    );
  }
  else {
    event.respondWith(caches.match(event.request).then(response => response || fetch(event.request)));
  }
});