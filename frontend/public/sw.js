// Pamoja service worker: makes the app installable and keeps the shell available on a weak connection.
// - Pages: network first, so a new deploy shows up straight away; the cached page is only a fallback offline.
// - /assets/*: file names carry a content hash, so they are cached once and reused.
// - /api/* and anything on another host (Solana RPC, wallets, payment providers) is never cached.
const VERSION = 'pamoja-v1'
const SHELL = ['/', '/manifest.webmanifest', '/favicon-192.png', '/favicon-512.png', '/maskable-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put('/', copy)) }
          return res
        })
        .catch(() => caches.match('/').then((r) => r || Response.error())),
    )
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)) }
        return res
      })),
    )
    return
  }

  // other files (icons, images): serve from cache if present, refresh in the background
  event.respondWith(
    caches.match(req).then((hit) => {
      const fresh = fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)) }
        return res
      }).catch(() => hit)
      return hit || fresh
    }),
  )
})
