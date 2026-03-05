// ============================================================================
// public/sw.js — Service Worker DSRoute
// ✅ Versión automática — cambia en cada deploy de Vercel
// ✅ Notifica al asesor cuando hay actualización disponible
// ✅ Soporte offline intacto
// ============================================================================

const OFFLINE_QUEUE = 'dsroute-offline-visitas'
const STATIC_ASSETS = ['/', '/offline.html']

let APP_VERSION = 'init'
let CACHE_NAME  = `dsroute-${APP_VERSION}`

// ── Obtener versión del servidor al instalar ──────────────────────────────────
async function fetchVersion() {
  try {
    const res = await fetch('/api/sw-version', { cache: 'no-store' })
    const data = await res.json()
    return data.version ?? Date.now().toString()
  } catch {
    return Date.now().toString()
  }
}

// ── Instalación ──────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    fetchVersion().then(async (version) => {
      APP_VERSION = version
      CACHE_NAME  = `dsroute-${APP_VERSION}`
      console.log(`[SW] Instalando versión ${APP_VERSION}`)
      const cache = await caches.open(CACHE_NAME)
      await cache.addAll(STATIC_ASSETS)
    })
  )
  // NO usar self.skipWaiting() aquí — dejar que el cliente decida cuándo activar
})

// ── Activación ───────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log(`[SW] Activando versión ${APP_VERSION}`)
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== OFFLINE_QUEUE)
          .map(k => {
            console.log(`[SW] Eliminando caché antigua: ${k}`)
            return caches.delete(k)
          })
      )
    ).then(() => self.clients.claim())
  )
})

// ── Mensajes ─────────────────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    console.log(`[SW] skipWaiting solicitado — activando versión ${APP_VERSION}`)
    self.skipWaiting()
  }
  if (event.data?.type === 'SYNC_NOW') {
    syncVisitas()
  }
  if (event.data?.type === 'GET_VERSION') {
    event.source?.postMessage({ type: 'VERSION', version: APP_VERSION })
  }
})

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Nunca cachear la ruta de versión del SW
  if (url.pathname === '/api/sw-version') {
    event.respondWith(fetch(request, { cache: 'no-store' }))
    return
  }

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstApi(request))
    return
  }

  // Para assets estáticos: network-first en vez de cache-first
  // Esto asegura que siempre se intenten obtener los archivos más recientes
  if (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'font'
  ) {
    event.respondWith(networkFirst(request))
    return
  }

  // Imágenes sí pueden ser cache-first (no cambian entre deploys)
  if (request.destination === 'image') {
    event.respondWith(cacheFirst(request))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(navigationHandler(request))
    return
  }
})

// ── Estrategias de caché ──────────────────────────────────────────────────────

// Network first con fallback a caché (para scripts, styles, fonts)
async function networkFirst(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    return new Response('Asset no disponible offline', { status: 503 })
  }
}

async function networkFirstApi(request) {
  try {
    const response = await fetch(request.clone())
    if (response.ok) {
      const url = new URL(request.url)
      if (
        request.method === 'GET' &&
        (url.pathname.includes('clientes-del-dia') ||
         url.pathname.includes('resumen-dia'))
      ) {
        const cache = await caches.open(CACHE_NAME)
        cache.put(request, response.clone())
      }
    }
    return response
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    if (request.method === 'POST' && request.url.includes('/api/checkin')) {
      await enqueueOfflineVisita(request)
      return new Response(
        JSON.stringify({ success: true, offline: true, message: 'Guardado offline' }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }
    return new Response(
      JSON.stringify({ error: 'Sin conexión', offline: true }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    return new Response('Asset no disponible offline', { status: 503 })
  }
}

async function navigationHandler(request) {
  try {
    const response = await fetch(request)
    return response
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    const offline = await caches.match('/offline.html')
    return offline || new Response('<h1>Sin conexión</h1>', {
      headers: { 'Content-Type': 'text/html' }
    })
  }
}

// ── Queue offline ─────────────────────────────────────────────────────────────
async function enqueueOfflineVisita(request) {
  try {
    const body = await request.clone().json()
    const queue = await getOfflineQueue()
    queue.push({
      id: `offline_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      url: request.url,
      body,
      timestamp: new Date().toISOString(),
    })
    await saveOfflineQueue(queue)
  } catch (e) {
    console.error('Error encolando visita offline:', e)
  }
}

async function getOfflineQueue() {
  try {
    const cache = await caches.open(OFFLINE_QUEUE)
    const response = await cache.match('queue')
    if (response) return await response.json()
  } catch {}
  return []
}

async function saveOfflineQueue(queue) {
  const cache = await caches.open(OFFLINE_QUEUE)
  await cache.put('queue', new Response(JSON.stringify(queue), {
    headers: { 'Content-Type': 'application/json' }
  }))
}

// ── Background Sync ───────────────────────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-visitas') {
    event.waitUntil(syncVisitas())
  }
})

async function syncVisitas() {
  const queue = await getOfflineQueue()
  if (queue.length === 0) return
  const pendientes = []
  for (const item of queue) {
    try {
      const res = await fetch(item.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.body),
      })
      if (!res.ok) pendientes.push(item)
    } catch {
      pendientes.push(item)
    }
  }
  await saveOfflineQueue(pendientes)
  const clients = await self.clients.matchAll()
  clients.forEach(client => {
    client.postMessage({
      type: 'SYNC_COMPLETE',
      sincronizadas: queue.length - pendientes.length,
      pendientes: pendientes.length,
    })
  })
}
