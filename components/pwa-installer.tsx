'use client'

// ============================================================================
// components/pwa-installer.tsx
// ✅ Detecta nueva versión del SW automáticamente
// ✅ Muestra banner "Nueva versión disponible" al asesor
// ✅ Un toque actualiza sin limpiar caché manualmente
// ============================================================================

import { useEffect, useState } from 'react'
import { RefreshCw, X, Download } from 'lucide-react'

export function PWAInstaller() {
  const [updateAvailable, setUpdateAvailable]     = useState(false)
  const [waitingWorker, setWaitingWorker]         = useState<ServiceWorker | null>(null)
  const [installing, setInstalling]               = useState(false)
  const [showInstallPrompt, setShowInstallPrompt] = useState(false)
  const [deferredPrompt, setDeferredPrompt]       = useState<any>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    // ── Registrar SW ──────────────────────────────────────────────────────
    navigator.serviceWorker.register('/sw.js').then(registration => {
      console.log('[PWA] SW registrado:', registration.scope)

      // Nueva versión ya esperando
      if (registration.waiting) {
        setWaitingWorker(registration.waiting)
        setUpdateAvailable(true)
      }

      // Nueva versión termina de instalarse
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing
        if (!newWorker) return
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingWorker(newWorker)
            setUpdateAvailable(true)
            console.log('[PWA] Nueva versión lista')
          }
        })
      })

      // Verificar actualizaciones cada 60 segundos
      setInterval(() => registration.update(), 60 * 1000)

    }).catch(err => console.error('[PWA] Error:', err))

    // Recargar cuando el nuevo SW toma control
    let refreshing = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) { refreshing = true; window.location.reload() }
    })

    // Mensajes del SW
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'SYNC_COMPLETE') {
        console.log(`[PWA] ${event.data.sincronizadas} visitas sincronizadas`)
      }
    })

    // Prompt de instalación
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      if (!window.matchMedia('(display-mode: standalone)').matches) {
        setShowInstallPrompt(true)
      }
    })

  }, [])

  const handleUpdate = () => {
    if (!waitingWorker) return
    setInstalling(true)
    waitingWorker.postMessage({ type: 'SKIP_WAITING' })
  }

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') { setShowInstallPrompt(false); setDeferredPrompt(null) }
  }

  return (
    <>
      {/* Banner de actualización */}
      {updateAvailable && (
        <div className="fixed top-0 inset-x-0 z-[9999] flex items-center gap-3 bg-navy-accent px-4 py-3 shadow-lg">
          <RefreshCw className={`h-5 w-5 text-white shrink-0 ${installing ? 'animate-spin' : ''}`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">Nueva versión disponible</p>
            <p className="text-xs text-white/70">Toca para actualizar ahora</p>
          </div>
          <button
            onClick={handleUpdate}
            disabled={installing}
            className="shrink-0 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/30 active:scale-95 transition-all disabled:opacity-50"
          >
            {installing ? 'Actualizando...' : 'Actualizar'}
          </button>
          {!installing && (
            <button onClick={() => setUpdateAvailable(false)} className="shrink-0 text-white/60 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* Prompt de instalación */}
      {showInstallPrompt && !updateAvailable && (
        <div className="fixed bottom-24 inset-x-4 z-[9998] flex items-center gap-3 rounded-2xl bg-dark-surface border border-white/10 px-4 py-3 shadow-2xl">
          <Download className="h-5 w-5 text-navy-accent shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">Instalar DSRoute</p>
            <p className="text-xs text-gray-400">Accede más rápido desde tu pantalla</p>
          </div>
          <button
            onClick={handleInstall}
            className="shrink-0 rounded-lg bg-navy-accent px-3 py-1.5 text-xs font-bold text-white active:scale-95 transition-all"
          >
            Instalar
          </button>
          <button onClick={() => setShowInstallPrompt(false)} className="shrink-0 text-gray-500 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  )
}
