// ============================================================================
// public/sw.js — Service Worker para Field Tracker TAT
// ============================================================================

const CACHE_NAME = 'tat-v1'
const OFFLINE_QUEUE = 'tat-offline-visitas'

// Assets que se cachean al instalar
const STATIC_ASSETS = [
  '/',
  '/offline.html',
]

// ── Instalación ──────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

// ── Activación ───────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

// ── Fetch: estrategia por tipo de request ────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // API requests → Network first, fallback a respuesta vacía útil
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstApi(request))
    return
  }

  // Assets estáticos → Cache first
  if (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'image' ||
    request.destination === 'font'
  ) {
    event.respondWith(cacheFirst(request))
    return
  }

  // Navegación (páginas HTML) → Network first, fallback offline
  if (request.mode === 'navigate') {
    event.respondWith(navigationHandler(request))
    return
  }
})

// ── Estrategias de caché ─────────────────────────────────────────────────────

// Network first con fallback para APIs
async function networkFirstApi(request) {
  try {
    const response = await fetch(request.clone())
    if (response.ok) {
      // Cachear respuestas GET de clientes del día
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
    // Sin red → buscar en caché
    const cached = await caches.match(request)
    if (cached) return cached

    // Si es un POST de checkin → encolar para sync
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

// Cache first para assets
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

// Navegación con fallback
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

// ── Queue de visitas offline ─────────────────────────────────────────────────
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

// ── Background Sync ──────────────────────────────────────────────────────────
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
      pendientes.push(item) // Reintentar después
    }
  }

  await saveOfflineQueue(pendientes)

  // Notificar a todos los clientes que se sincronizó
  const clients = await self.clients.matchAll()
  clients.forEach(client => {
    client.postMessage({
      type: 'SYNC_COMPLETE',
      sincronizadas: queue.length - pendientes.length,
      pendientes: pendientes.length,
    })
  })
}

// Escuchar mensajes de la app
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
  if (event.data?.type === 'SYNC_NOW') {
    syncVisitas()
  }
})
