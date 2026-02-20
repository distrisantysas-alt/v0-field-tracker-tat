"use client"

// ============================================================================
// components/pwa-installer.tsx
// - Registra el Service Worker
// - Muestra banner "Instalar app" en móvil
// - Escucha mensajes de sync del SW
// ============================================================================

import { useState, useEffect } from "react"
import { Download, X, Wifi, WifiOff } from "lucide-react"

export function PWAInstaller() {
  const [installPrompt, setInstallPrompt]   = useState<any>(null)
  const [showBanner, setShowBanner]         = useState(false)
  const [isOnline, setIsOnline]             = useState(true)
  const [syncMsg, setSyncMsg]               = useState<string | null>(null)

  useEffect(() => {
    // ── Registrar Service Worker ─────────────────────────────────────
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then(reg => {
          console.log('SW registrado:', reg.scope)

          // Escuchar mensajes del SW (sync completada)
          navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data?.type === 'SYNC_COMPLETE') {
              const { sincronizadas } = event.data
              if (sincronizadas > 0) {
                setSyncMsg(`✅ ${sincronizadas} visita${sincronizadas > 1 ? 's' : ''} sincronizada${sincronizadas > 1 ? 's' : ''}`)
                setTimeout(() => setSyncMsg(null), 4000)
              }
            }
          })
        })
        .catch(err => console.error('Error registrando SW:', err))
    }

    // ── Capturar prompt de instalación ───────────────────────────────
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e)
      // Mostrar banner solo si no fue descartado antes
      const descartado = localStorage.getItem('pwa_install_dismissed')
      if (!descartado) setShowBanner(true)
    }
    window.addEventListener('beforeinstallprompt', handler)

    // ── Estado de conexión ───────────────────────────────────────────
    const updateOnline = () => setIsOnline(navigator.onLine)
    window.addEventListener('online',  updateOnline)
    window.addEventListener('offline', updateOnline)
    setIsOnline(navigator.onLine)

    // Al reconectar → disparar sync
    window.addEventListener('online', () => {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'SYNC_NOW' })
      }
    })

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('online',  updateOnline)
      window.removeEventListener('offline', updateOnline)
    }
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) return
    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') {
      setShowBanner(false)
      setInstallPrompt(null)
    }
  }

  const handleDismiss = () => {
    setShowBanner(false)
    localStorage.setItem('pwa_install_dismissed', '1')
  }

  return (
    <>
      {/* Banner de instalación */}
      {showBanner && installPrompt && (
        <div className="fixed bottom-20 left-4 right-4 z-50 flex items-center gap-3 rounded-2xl bg-navy border border-navy-accent/40 shadow-xl p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-accent/20">
            <Download className="h-5 w-5 text-navy-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">Instalar Field Tracker</p>
            <p className="text-xs text-gray-400">Funciona sin internet después de instalar</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleInstall}
              className="rounded-lg bg-navy-accent px-3 py-1.5 text-xs font-bold text-white"
            >
              Instalar
            </button>
            <button onClick={handleDismiss} className="text-gray-500 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Indicador sin conexión */}
      {!isOnline && (
        <div className="fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2 bg-warning/90 py-2 text-dark-bg text-xs font-semibold">
          <WifiOff className="h-3.5 w-3.5" />
          Sin conexión — modo offline activo
        </div>
      )}

      {/* Mensaje de sync completada */}
      {syncMsg && (
        <div className="fixed top-10 inset-x-4 z-50 flex items-center justify-center gap-2 rounded-xl bg-success/90 py-3 text-white text-sm font-semibold shadow-lg">
          <Wifi className="h-4 w-4" />
          {syncMsg}
        </div>
      )}
    </>
  )
}
