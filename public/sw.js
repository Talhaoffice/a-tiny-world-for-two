const CACHE_PREFIX = 'tiny-world-shell-'
const CACHE_NAME = `${CACHE_PREFIX}v1`
const SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg']

function isSameOrigin(requestUrl) {
  return requestUrl.origin === self.location.origin
}

function isShellAsset(pathname) {
  return pathname === '/' || pathname === '/index.html'
    || pathname === '/manifest.webmanifest' || pathname === '/icon.svg'
    || pathname.startsWith('/assets/')
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)),
  )).then(() => self.clients.claim()))
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (!isSameOrigin(url) || !isShellAsset(url.pathname)) return

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone()
        void caches.open(CACHE_NAME).then(cache => cache.put('/index.html', copy))
      }
      return response
    }).catch(async () => (await caches.match('/index.html')) || Response.error()))
    return
  }

  event.respondWith(caches.match(request).then(cached => {
    if (cached) return cached
    return fetch(request).then(response => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone()
        void caches.open(CACHE_NAME).then(cache => cache.put(request, copy))
      }
      return response
    })
  }))
})
