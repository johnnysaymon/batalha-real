/* Service worker: guarda os arquivos do jogo para funcionar offline */
'use strict';
const CACHE = 'batalha-real-v1';
const ARQUIVOS = [
  './',
  'index.html',
  'css/style.css',
  'js/deck.js',
  'js/rules.js',
  'js/ai.js',
  'js/ui.js',
  'js/game.js',
  'manifest.webmanifest',
  'favicon.ico',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

/* Rede primeiro (para receber atualizações); sem conexão, usa o cache */
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        if (resp.ok) {
          const copia = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copia));
        }
        return resp;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
