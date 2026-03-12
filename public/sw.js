// ============================================================================
// public/sw.js — Service Worker DSRoute
// ✅ Versión automática — cambia en cada deploy de Vercel
// ✅ Notifica al asesor cuando hay actualización disponible
// ✅ El checkin offline lo maneja React/IndexedDB — SW no interfiere
// ============================================================================

const STATIC_ASSETS = ['/', '/offline.html']

let APP_VERSION = 'init'
let CACHE_NAME  = `dsroute-${APP_VERSION}`

async function fetchVersion() {
  try {
    const res = await fetch('/api/sw-version', { cache: 'no-store' })
    const data = await res.json()
    return data.version ?? Date.now().toString()
  } catch {
    return Date.now().toString()
  }
}

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
})

self.addEventListener('activate', (event) => {
  console.log(`[SW] Activando versión ${APP_VERSION}`)
  event.waitUntil(
    // Limpiar TODOS los cachés anteriores incluyendo la cola offline vieja
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => {
            console.log(`[SW] Eliminando caché: ${k}`)
            return caches.delete(k)
          })
      )
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    console.log(`[SW] skipWaiting solicitado`)
    self.skipWaiting()
  }
  if (event.data?.type === 'GET_VERSION') {
    event.source?.postMessage({ type: 'VERSION', version: APP_VERSION })
  }
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Nunca cachear la ruta de versión del SW
  if (url.pathname === '/api/sw-version') {
    event.respondWith(fetch(request, { cache: 'no-store' }))
    return
  }

  // ✅ CRÍTICO: NO interceptar checkin ni upload-foto
  // React maneja el offline de estas rutas con IndexedDB
  if (
    url.pathname === '/api/checkin' ||
    url.pathname === '/api/upload-foto'
  ) {
    event.respondWith(fetch(request))
    return
  }

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstApi(request))
    return
  }

  if (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'font'
  ) {
    event.respondWith(networkFirst(request))
    return
  }

  if (request.destination === 'image') {
    event.respondWith(cacheFirst(request))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(navigationHandler(request))
    return
  }
})

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
