// Built assets and game data are cache-first; pages are network-first with the cached app shell as the offline fallback.
const CACHE = 'gg-editor-v1'
const SHELL = new URL('./', self.location).pathname

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // Shared files are opened from the Open button; the page explains that.
  if (req.method === 'POST' && url.pathname === `${SHELL}share`) {
    e.respondWith(Response.redirect(`${SHELL}share`, 303))
    return
  }
  if (req.method !== 'GET') return

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(SHELL, copy))
          return res
        })
        .catch(() => caches.match(SHELL)),
    )
    return
  }

  const rel = url.pathname.slice(SHELL.length)
  if (/^(assets|data|community)\//.test(rel) || /\.(png|svg|webmanifest)$/.test(rel)) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) }
        return res
      })),
    )
  }
})
