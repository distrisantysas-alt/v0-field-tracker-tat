"use client"

// ============================================================================
// components/pwa-updater.tsx
// ✅ Detecta cuando hay una nueva versión del SW esperando
// ✅ Muestra banner visible al asesor con botón "Actualizar"
// ✅ Al confirmar → envía SKIP_WAITING → recarga con versión nueva
// ✅ Silencioso si no hay actualización pendiente
// ============================================================================

import { useEffect, useState } from "react"
import { RefreshCw, X } from "lucide-react"

export function PWAUpdater() {
  const [swWaiting, setSwWaiting]       = useState<ServiceWorker | null>(null)
  const [visible, setVisible]           = useState(false)
  const [actualizando, setActualizando] = useState(false)
  const [version, setVersion]           = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return

    const registerSW = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          updateViaCache: "none", // ← fuerza que el navegador siempre descargue sw.js fresco
        })

        // ── Pedir versión actual al SW activo ─────────────────────────────
        if (reg.active) {
          const canal = new MessageChannel()
          canal.port1.onmessage = (e) => {
            if (e.data?.type === "VERSION") setVersion(e.data.version)
          }
          reg.active.postMessage({ type: "GET_VERSION" }, [canal.port2])
        }

        // ── Caso 1: ya había un SW esperando al cargar la página ──────────
        if (reg.waiting) {
          setSwWaiting(reg.waiting)
          setVisible(true)
        }

        // ── Caso 2: nueva versión encontrada mientras la app está abierta ─
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing
          if (!newWorker) return

          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              // Hay un SW nuevo instalado esperando activarse
              setSwWaiting(newWorker)
              setVisible(true)
            }
          })
        })

        // ── Polling cada 5 minutos para detectar actualizaciones ──────────
        // (por si el navegador no dispara updatefound automáticamente)
        const interval = setInterval(() => {
          reg.update().catch(() => {})
        }, 5 * 60 * 1000)

        return () => clearInterval(interval)

      } catch (err) {
        console.warn("[PWAUpdater] Error registrando SW:", err)
      }
    }

    registerSW()

    // ── Recargar automáticamente cuando el SW nuevo toma control ──────────
    // (ocurre justo después de SKIP_WAITING)
    let recargando = false
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!recargando) {
        recargando = true
        window.location.reload()
      }
    })
  }, [])

  const handleActualizar = () => {
    if (!swWaiting) return
    setActualizando(true)
    // Decirle al SW que se active ya — esto dispara "controllerchange" arriba
    swWaiting.postMessage({ type: "SKIP_WAITING" })
  }

  const handleIgnorar = () => {
    setVisible(false)
    // Volver a mostrar en 30 min si sigue sin actualizar
    setTimeout(() => {
      if (swWaiting) setVisible(true)
    }, 30 * 60 * 1000)
  }

  if (!visible) return null

  return (
    <div className="fixed top-0 inset-x-0 z-50 px-4 pt-3 pb-1 pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-sm rounded-2xl border border-navy-accent/40 bg-[#0d1b3e] shadow-2xl shadow-black/50 overflow-hidden">

        {/* Barra de acento superior */}
        <div className="h-1 w-full bg-gradient-to-r from-navy-accent via-blue-400 to-navy-accent" />

        <div className="flex items-start gap-3 px-4 py-3">
          {/* Ícono animado */}
          <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-accent/20 ${actualizando ? "animate-spin" : ""}`}>
            <RefreshCw className="h-4 w-4 text-navy-accent" />
          </div>

          {/* Texto */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">
              {actualizando ? "Actualizando..." : "Nueva versión disponible"}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {actualizando
                ? "La app se reiniciará en un momento"
                : "Hay una actualización lista. Toca para instalar."
              }
            </p>
            {version && !actualizando && (
              <p className="text-[10px] text-gray-600 mt-1 font-mono">v{version}</p>
            )}
          </div>

          {/* Botón cerrar */}
          {!actualizando && (
            <button
              onClick={handleIgnorar}
              className="shrink-0 text-gray-600 hover:text-gray-400 transition-colors mt-0.5"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Botón principal */}
        {!actualizando && (
          <div className="px-4 pb-3">
            <button
              onClick={handleActualizar}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-navy-accent py-2.5 text-sm font-bold text-white transition-all active:scale-[0.97] hover:bg-navy-accent/90"
            >
              <RefreshCw className="h-4 w-4" />
              Actualizar ahora
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
