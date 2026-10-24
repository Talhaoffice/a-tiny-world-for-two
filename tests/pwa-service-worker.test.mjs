import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

const ORIGIN = 'https://tiny-world.test'

async function startWorker(fetchImpl = async () => new Response('online')) {
  const handlers = new Map()
  const cacheNames = new Set()
  const cacheValues = new Map()
  const cache = {
    async addAll(paths) {
      for (const path of paths) cacheValues.set(new URL(path, ORIGIN).href, new Response(`shell:${path}`))
    },
    async match(request) {
      return cacheValues.get(typeof request === 'string' ? new URL(request, ORIGIN).href : request.url)
    },
    async put(request, response) {
      cacheValues.set(typeof request === 'string' ? new URL(request, ORIGIN).href : request.url, response)
    },
  }
  const caches = {
    async open(name) { cacheNames.add(name); return cache },
    async match(request) { return cache.match(request) },
    async keys() { return [...cacheNames] },
    async delete(name) { cacheNames.delete(name); return true },
  }
  const self = {
    location: { origin: ORIGIN },
    clients: { async claim() {} },
    addEventListener(name, callback) { handlers.set(name, callback) },
    async skipWaiting() {},
  }
  const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8')
  runInNewContext(source, { self, caches, fetch: fetchImpl, URL, Response, Promise })
  return { handlers, caches, cacheNames }
}

function fetchEvent(url, { method = 'GET', mode = 'cors' } = {}) {
  let responsePromise = null
  return {
    request: { url, method, mode },
    respondWith(value) { responsePromise = Promise.resolve(value) },
    get responsePromise() { return responsePromise },
  }
}

async function installWorker(worker) {
  let installPromise
  worker.handlers.get('install')({ waitUntil(value) { installPromise = Promise.resolve(value) } })
  await installPromise
}

test('static-shell worker skips Firebase, API, and non-GET requests', async () => {
  const worker = await startWorker()
  const firebase = fetchEvent('https://firestore.googleapis.com/v1/projects/test/databases/(default)/documents')
  const realtime = fetchEvent('https://tiny-world-default-rtdb.firebaseio.com/.json')
  const auth = fetchEvent('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword')
  const api = fetchEvent(`${ORIGIN}/api/private`)
  const write = fetchEvent(`${ORIGIN}/assets/app.js`, { method: 'POST' })

  worker.handlers.get('fetch')(firebase)
  worker.handlers.get('fetch')(realtime)
  worker.handlers.get('fetch')(auth)
  worker.handlers.get('fetch')(api)
  worker.handlers.get('fetch')(write)

  assert.equal(firebase.responsePromise, null)
  assert.equal(realtime.responsePromise, null)
  assert.equal(auth.responsePromise, null)
  assert.equal(api.responsePromise, null)
  assert.equal(write.responsePromise, null)
})

test('offline navigation falls back to the cached app shell', async () => {
  const worker = await startWorker(async () => { throw new Error('offline') })
  await installWorker(worker)
  const navigation = fetchEvent(`${ORIGIN}/`, { mode: 'navigate' })
  worker.handlers.get('fetch')(navigation)

  const response = await navigation.responsePromise
  assert.equal(await response.text(), 'shell:/index.html')
})

test('only prior app-shell cache versions are removed on activation', async () => {
  const worker = await startWorker()
  await worker.caches.open('tiny-world-shell-v0')
  await worker.caches.open('tiny-world-shell-v1')
  await worker.caches.open('unrelated-cache')
  let activatePromise
  worker.handlers.get('activate')({ waitUntil(value) { activatePromise = Promise.resolve(value) } })
  await activatePromise

  assert.deepEqual([...worker.cacheNames].sort(), ['tiny-world-shell-v1', 'unrelated-cache'])
})
