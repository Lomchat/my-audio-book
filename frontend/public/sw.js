/* MyAudioBook service worker: share target + minimal offline app shell. No API caching. */
const SHELL_CACHE = 'mab-shell-v1'
const ASSET_CACHE = 'mab-assets-v1'
const SHARED_CACHE = 'shared-files'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(['/index.html', '/icon.svg'])).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => ![SHELL_CACHE, ASSET_CACHE, SHARED_CACHE].includes(k)).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

async function handleShare(request) {
  try {
    const form = await request.formData()
    const cache = await caches.open(SHARED_CACHE)
    for (const key of await cache.keys()) await cache.delete(key)
    let i = 0
    for (const value of form.getAll('file')) {
      if (typeof value === 'string') continue
      await cache.put(
        `/shared/${i++}`,
        new Response(value, {
          headers: {
            'Content-Type': value.type || 'application/octet-stream',
            'X-File-Name': encodeURIComponent(value.name || 'audio'),
            'X-File-Modified': String(value.lastModified || Date.now()),
          },
        }),
      )
    }
  } catch {
    /* fall through to the share page, which will show an empty state */
  }
  return Response.redirect('/share', 303)
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(handleShare(request))
    return
  }
  if (request.method !== 'GET' || url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) caches.open(SHELL_CACHE).then((c) => c.put('/index.html', res.clone()))
          return res
        })
        .catch(() => caches.match('/index.html')),
    )
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) caches.open(ASSET_CACHE).then((c) => c.put(request, res.clone()))
            return res
          }),
      ),
    )
  }
})
