// Keeps the app's own files so Haven opens and runs with no connection. Nothing from the friends server is stored here.
const VERSION = '__VERSION__';
const CACHE = `haven-${VERSION}`;
const FILES = ['./', './index.html', './app.js', './app.css', './manifest.webmanifest', './fonts/bricolage.woff2', './fonts/figtree.woff2', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('haven-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.endsWith('/config.json')) return;
  // Other pages on the site (the privacy policy, account deletion) are not the app: leave them alone.
  const app = /\/(index\.html)?$/.test(url.pathname);
  if (event.request.mode === 'navigate' && !app) return;
  // The page itself: newest when online, the kept copy when not.
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); return res; }).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request)));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window' }).then(list => (list[0] ? list[0].focus() : self.clients.openWindow('./'))));
});
