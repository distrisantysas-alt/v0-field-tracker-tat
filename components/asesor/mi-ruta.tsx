"use client"

// ============================================================================
// components/asesor/mi-ruta.tsx - Vista Principal del Asesor
// ============================================================================

import { useState, useEffect } from "react"
import useSWR from "swr"
import { Bell, MapPin, Check, AlertTriangle, Clock, X, Loader2, Wifi, WifiOff, DollarSign } from "lucide-react"
import {
  type ClienteConEstado,
  formatearDistancia,
  obtenerPosicionGPS,
  hayConexion,
  guardarVisitaOffline,
  sincronizarVisitasOffline,
  generarOfflineID,
} from "@/lib/db"
import { type AsesorSession } from "./login-asesor"

type ClientStatus = "validada" | "sospechosa" | "en-progreso" | "pendiente" | "omitida"

const statusConfig: Record<ClientStatus, {
  color: string
  barColor: string
  label: string
  bgOpacity: string
  textColor: string
}> = {
  validada: {
    color: "bg-success",
    barColor: "bg-success",
    label: "VALIDADA",
    bgOpacity: "bg-success/15",
    textColor: "text-success"
  },
  sospechosa: {
    color: "bg-warning",
    barColor: "bg-warning",
    label: "SOSPECHOSA",
    bgOpacity: "bg-warning/15",
    textColor: "text-warning"
  },
  "en-progreso": {
    color: "bg-navy-accent",
    barColor: "bg-navy-accent",
    label: "EN PROGRESO",
    bgOpacity: "bg-navy-accent/15",
    textColor: "text-navy-accent"
  },
  pendiente: {
    color: "bg-gray-500",
    barColor: "bg-gray-500",
    label: "PENDIENTE",
    bgOpacity: "bg-gray-500/15",
    textColor: "text-gray-400"
  },
  omitida: {
    color: "bg-danger",
    barColor: "bg-danger",
    label: "OMITIDA",
    bgOpacity: "bg-danger/15",
    textColor: "text-danger"
  },
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function getCurrentTime() {
  const now = new Date()
  return now.toLocaleTimeString("es-CO", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  })
}

function determinarEstadoCliente(cliente: ClienteConEstado): ClientStatus {
  if (cliente.visitado_en) {
    return cliente.validada ? "validada" : "sospechosa"
  }
  return "pendiente"
}

function getInitials(nombre: string): string {
  return nombre
    .split(' ')
    .map((n: string) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

interface MiRutaProps {
  asesor: AsesorSession
}

export function MiRuta({ asesor }: MiRutaProps) {
  const ASESOR_ID = asesor.id

  // Obtener fecha actual en zona horaria Colombia
  const fecha = new Date().toLocaleString('en-CA', {
    timeZone: 'America/Bogota'
  }).split(',')[0]

  const [showNoteField, setShowNoteField] = useState(false)
  const [currentTime, setCurrentTime] = useState(getCurrentTime())
  const [isOnline, setIsOnline] = useState(true)
  const [isCheckinLoading, setIsCheckinLoading] = useState(false)
  const [selectedCliente, setSelectedCliente] = useState<ClienteConEstado | null>(null)
  const [nota, setNota] = useState("")
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [huboPedido, setHuboPedido] = useState(false)
  const [valorPedido, setValorPedido] = useState("")
  const [mostrarResumen, setMostrarResumen] = useState(false)

  const { data, error, mutate } = useSWR(
    `/api/clientes-del-dia?asesor_id=${ASESOR_ID}&fecha=${fecha}`,
    fetcher,
    {
      refreshInterval: 30000,
      revalidateOnFocus: true,
    }
  )

  const { data: resumenData } = useSWR(
    `/api/resumen-dia?asesor_id=${ASESOR_ID}&fecha=${fecha}`,
    fetcher,
    {
      refreshInterval: 30000,
      revalidateOnFocus: true,
    }
  )

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(getCurrentTime())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine)

    window.addEventListener('online', updateOnlineStatus)
    window.addEventListener('offline', updateOnlineStatus)

    if (navigator.onLine) {
      sincronizarVisitasOffline().then(({ sincronizadas, errores }) => {
        if (sincronizadas > 0) {
          console.log(`✅ Sincronizadas ${sincronizadas} visitas offline`)
          mutate()
        }
        if (errores > 0) {
          console.error(`❌ ${errores} visitas no pudieron sincronizarse`)
        }
      })
    }

    return () => {
      window.removeEventListener('online', updateOnlineStatus)
      window.removeEventListener('offline', updateOnlineStatus)
    }
  }, [isOnline, mutate])

  useEffect(() => {
    const updateLocation = async () => {
      try {
        const position = await obtenerPosicionGPS()
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })
      } catch (error) {
        console.error('Error obteniendo GPS:', error)
      }
    }

    updateLocation()
    const interval = setInterval(updateLocation, 10000)
    return () => clearInterval(interval)
  }, [])

  const validarPedido = (): boolean => {
    if (huboPedido && (!valorPedido || parseFloat(valorPedido) <= 0)) {
      alert('Si hubo pedido, debes especificar un valor válido')
      return false
    }
    return true
  }

  const handleCheckin = async () => {
    if (!selectedCliente || !userLocation) return
    if (!validarPedido()) return

    setIsCheckinLoading(true)

    try {
      const visitaData = {
        asesor_id: ASESOR_ID,
        cliente_id: selectedCliente.id,
        lat: userLocation.lat,
        lng: userLocation.lng,
        notas: nota || null,
        hubo_pedido: huboPedido,
        valor_pedido: huboPedido ? parseFloat(valorPedido) : 0
      }

      if (hayConexion()) {
        const response = await fetch('/api/checkin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(visitaData),
        })

        if (!response.ok) throw new Error('Error registrando visita')

        const result = await response.json()
        console.log('✅ Visita registrada:', result.mensajes)
      } else {
        await guardarVisitaOffline({
          offline_id: generarOfflineID(),
          asesor_id: visitaData.asesor_id,
          cliente_id: visitaData.cliente_id,
          lat_capturada: visitaData.lat,
          lng_capturada: visitaData.lng,
          notas: visitaData.notas,
          timestamp: new Date().toISOString(),
          synced: false,
        })
        console.log('💾 Visita guardada offline')
      }

      setNota("")
      setHuboPedido(false)
      setValorPedido("")
      setShowNoteField(false)
      setSelectedCliente(null)
      setMostrarResumen(true)

      mutate()
    } catch (error) {
      console.error('Error en check-in:', error)
      alert('Error al registrar la visita. Intenta nuevamente.')
    } finally {
      setIsCheckinLoading(false)
    }
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center px-4">
        <div className="text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-danger" />
          <p className="mt-4 text-white">Error cargando datos</p>
          <button onClick={() => mutate()} className="mt-2 text-sm text-navy-accent hover:underline">
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-navy-accent" />
      </div>
    )
  }

  const { clientes, stats } = data
  const total = stats.total
  const visited = stats.validadas + stats.sospechosas

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-navy-accent text-sm font-bold text-white">
            {getInitials(asesor.nombre)}
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{asesor.nombre}</p>
            <p className="text-xs text-gray-400">
              Asesor Comercial{asesor.zona ? ` — ${asesor.zona}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isOnline ? (
            <Wifi className="h-4 w-4 text-success" />
          ) : (
            <WifiOff className="h-4 w-4 text-warning" />
          )}
          <button className="relative flex h-10 w-10 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-white/10 hover:text-white">
            <Bell className="h-5 w-5" />
            {stats.sospechosas > 0 && (
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-danger" />
            )}
          </button>
        </div>
      </div>

      {/* Progress Hero Card */}
      <div className="mx-4 mt-3 overflow-hidden rounded-xl bg-navy p-5">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />

        <div className="relative">
          <div className="flex items-baseline gap-1">
            <span className="text-5xl font-bold tracking-tight text-white">{visited}</span>
            <span className="text-2xl font-medium text-white/50">/ {total}</span>
          </div>
          <p className="mt-0.5 text-sm text-white/60">visitas completadas hoy</p>

          <div className="relative mt-4 h-3 overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                (visited / total) * 100 >= 80
                  ? "bg-success"
                  : (visited / total) * 100 >= 60
                  ? "bg-warning"
                  : "bg-danger"
              }`}
              style={{ width: `${total > 0 ? (visited / total) * 100 : 0}%` }}
            >
              <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-success" />
              <span className="text-xs font-medium text-success">{stats.validadas} Validadas</span>
            </div>
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
              <span className="text-xs font-medium text-warning">{stats.sospechosas} Sospechosas</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-xs font-medium text-gray-400">{stats.pendientes} Pendientes</span>
            </div>
          </div>

          <div className="mt-3 text-right">
            <span className="font-mono text-xs text-white/40">{currentTime}</span>
          </div>
        </div>
      </div>

      {/* Resumen del Día */}
      {resumenData && resumenData.metricas.visitas.total > 0 && (
        <div className="mx-4 mt-4 overflow-hidden rounded-xl bg-gradient-to-br from-navy-accent/20 to-success/10 border border-navy-accent/30 p-4">
          <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Resumen del Día
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <p className="text-xs text-white/60">Pedidos</p>
              <p className="text-2xl font-bold text-success">
                {resumenData.metricas.pedidos.efectivos}
              </p>
              <p className="text-xs text-white/40">
                {resumenData.metricas.pedidos.tasa_conversion}
              </p>
            </div>
            <div className="text-center border-l border-r border-white/10">
              <p className="text-xs text-white/60">Total</p>
              <p className="text-lg font-bold text-white">
                {resumenData.metricas.pedidos.total_vendido_formato}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-white/60">Promedio</p>
              <p className="text-lg font-bold text-white">
                {resumenData.metricas.pedidos.promedio_pedido_formato}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Client List */}
      <div className="mt-4 flex flex-col gap-2.5 px-4 pb-32">
        {clientes.map((cliente: ClienteConEstado) => {
          const status = determinarEstadoCliente(cliente)
          const config = statusConfig[status]
          const isSelected = selectedCliente?.id === cliente.id

          let distanciaActual = "---"
          if (userLocation && !cliente.visitado_en) {
            const R = 6371000
            const toRad = (deg: number) => (deg * Math.PI) / 180
            const dLat = toRad(cliente.lat - userLocation.lat)
            const dLng = toRad(cliente.lng - userLocation.lng)
            const a =
              Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRad(userLocation.lat)) *
                Math.cos(toRad(cliente.lat)) *
                Math.sin(dLng / 2) *
                Math.sin(dLng / 2)
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
            distanciaActual = formatearDistancia(R * c)
          } else if (cliente.distancia_metros) {
            distanciaActual = formatearDistancia(cliente.distancia_metros)
          }

          return (
            <div
              key={cliente.id}
              onClick={() => !cliente.visitado_en && setSelectedCliente(cliente)}
              className={`flex overflow-hidden rounded-xl border transition-all duration-200 active:scale-[0.98] ${
                !cliente.visitado_en ? "cursor-pointer" : "cursor-default"
              } ${
                isSelected
                  ? "border-navy-accent bg-navy-accent/10"
                  : "border-white/5 bg-dark-surface"
              }`}
            >
              <div
                className={`w-1 shrink-0 ${config.barColor} ${
                  isSelected ? "animate-pulse-dot" : ""
                }`}
              />

              <div className="flex flex-1 items-center gap-3 px-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">{cliente.nombre}</p>
                  <p className="truncate text-xs text-gray-500">{cliente.direccion}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-mono text-[11px] text-gray-400">{distanciaActual}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${config.bgOpacity} ${config.textColor}`}>
                    {config.label}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Check-in FAB */}
      {selectedCliente && (
        <div className="fixed inset-x-0 bottom-16 z-40 px-4 pb-3">
          <button
            onClick={handleCheckin}
            disabled={isCheckinLoading || !userLocation}
            className="flex w-full animate-pulse-glow flex-col items-center justify-center rounded-xl bg-success px-4 py-3.5 text-white shadow-lg shadow-success/25 transition-all active:scale-[0.97] disabled:opacity-50"
          >
            <div className="flex items-center gap-2">
              {isCheckinLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <MapPin className="h-5 w-5" />
              )}
              <span className="text-base font-bold">
                {isCheckinLoading ? "REGISTRANDO..." : "REGISTRAR VISITA"}
              </span>
            </div>
            {userLocation && (
              <span className="mt-0.5 text-xs text-white/70">
                Distancia: {formatearDistancia(
                  (() => {
                    const R = 6371000
                    const toRad = (deg: number) => (deg * Math.PI) / 180
                    const dLat = toRad(selectedCliente.lat - userLocation.lat)
                    const dLng = toRad(selectedCliente.lng - userLocation.lng)
                    const a =
                      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                      Math.cos(toRad(userLocation.lat)) *
                        Math.cos(toRad(selectedCliente.lat)) *
                        Math.sin(dLng / 2) *
                        Math.sin(dLng / 2)
                    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
                    return R * c
                  })()
                )}
              </span>
            )}
          </button>

          <div className="mt-2 space-y-2 rounded-lg border border-white/10 bg-dark-surface p-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={huboPedido}
                onChange={(e) => setHuboPedido(e.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-white/10 text-success focus:ring-success"
              />
              <span className="text-sm font-medium text-white">¿Hubo pedido?</span>
            </label>

            {huboPedido && (
              <div className="flex items-center gap-2 pt-1">
                <DollarSign className="h-4 w-4 text-gray-400" />
                <input
                  type="number"
                  value={valorPedido}
                  onChange={(e) => setValorPedido(e.target.value)}
                  placeholder="0"
                  min="0"
                  step="1000"
                  autoFocus
                  inputMode="numeric"
                  className="flex-1 rounded-lg border border-white/10 bg-navy px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-navy-accent focus:outline-none focus:ring-2 focus:ring-navy-accent/50"
                />
              </div>
            )}
          </div>

          {!showNoteField ? (
            <button
              onClick={() => setShowNoteField(true)}
              className="mt-2 w-full text-center text-xs text-gray-500 transition-colors hover:text-gray-300"
            >
              Agregar nota opcional +
            </button>
          ) : (
            <div className="mt-2 flex items-start gap-2">
              <textarea
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                className="flex-1 resize-none rounded-lg border border-white/10 bg-dark-surface px-3 py-2 text-xs text-white placeholder:text-gray-500 focus:border-navy-accent focus:outline-none"
                placeholder="Escribe una nota..."
                rows={2}
              />
              <button
                onClick={() => { setShowNoteField(false); setNota("") }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <p className="mt-1.5 text-center font-mono text-[10px] text-gray-600">
            {userLocation
              ? `GPS activo · Precisión: ±8m ${!isOnline ? "· MODO OFFLINE" : ""}`
              : "Activando GPS..."}
          </p>
        </div>
      )}
    </div>
  )
}
