// sw.js — 梗灵大陆 PWA Service Worker
// 策略：app-shell 安装时预缓存 + 同域 GET 运行时 cache-first（图片/音频等大资源按需缓存），
//       断网时回退到已缓存的 index.html，实现离线可玩。
const CACHE = 'gengling-v1';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/game.css',
  './css/cartoon.css',
  './js/main.js',
  './js/core/rng.js',
  './js/core/board.js',
  './js/data/characters.js',
  './js/data/levels.js',
  './js/data/items.js',
  './js/game/save.js',
  './js/game/meta.js',
  './js/game/battle.js',
  './js/game/skills.js',
  './js/game/sfx.js',
  './js/ui/render.js',
  './js/ui/scenes.js',
  './js/ui/input.js',
  './js/ui/avatars.js',
  './js/ui/map.js',
  './js/ui/art.js',
  './assets/icon-1024.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // 仅缓存同域资源

  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match('./index.html'));   // 断网回退到外壳
    })
  );
});
