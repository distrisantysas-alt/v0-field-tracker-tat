"use client"

import { useState, useEffect } from "react"
import useSWR from "swr"
import { MapPin, Loader2 } from "lucide-react"

type PinStatus = "validada" | "sospechosa" | "en-progreso" | "pendiente" | "omitida"

interface Cliente {
  id: string
  codigo: string
  nombre: string
  direccion: string
  lat: number
  lng: number
  visitado_en: string | null
  validada: boolean | null
  distancia_metros: number | null
}

interface MapPin2 {
  x: number
  y: number
  label: string
  status: PinStatus
  distance?: string
  cliente: Cliente
}

const pinColors: Record<PinStatus, string> = {
  validada: "#1A7A4A",
  sospechosa: "#D97706",
  "en-progreso": "#2E6DA4",
  pendiente: "#6B7280",
  omitida: "#DC2626",
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function MapaTab() {
  const ASESOR_ID = "0a2da93b-5e18-4b2d-882c-d40f8e84b374"
  const fecha = new Date().toLocaleString('en-CA', { 
    timeZone: 'America/Bogota' 
  }).split(',')[0]

  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null)

  // Fetch clientes del día
  const { data, error } = useSWR(
    `/api/clientes-del-dia?asesor_id=${ASESOR_ID}&fecha=${fecha}`,
    fetcher,
    { refreshInterval: 30000 }
  )

  // Obtener ubicación GPS del usuario
  useEffect(() => {
    const updateLocation = async () => {
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 30000,
            maximumAge: 10000
          })
        })

        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        })
      } catch (error) {
        console.error('Error obteniendo GPS:', error)
      }
    }

    updateLocation()
    const interval = setInterval(updateLocation, 10000)
    return () => clearInterval(interval)
  }, [])

  // Seleccionar cliente más cercano pendiente
  useEffect(() => {
    if (!data?.clientes || !userLocation) return

    const pendientes = data.clientes.filter((c: Cliente) => !c.visitado_en)
    if (pendientes.length === 0) {
      setSelectedCliente(null)
      return
    }

    // Calcular distancias
    const conDistancia = pendientes.map((c: Cliente) => {
      const R = 6371000
      const toRad = (deg: number) => (deg * Math.PI) / 180
      const dLat = toRad(c.lat - userLocation.lat)
      const dLng = toRad(c.lng - userLocation.lng)
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(toRad(userLocation.lat)) * Math.cos(toRad(c.lat)) *
                Math.sin(dLng/2) * Math.sin(dLng/2)
      const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
      return { ...c, distancia_calculada: dist }
    })

    conDistancia.sort((a, b) => a.distancia_calculada - b.distancia_calculada)
    setSelectedCliente(conDistancia[0])
  }, [data, userLocation])

  const handleCheckIn = () => {
    // Navegar a la pestaña Mi Ruta para hacer check-in
    const miRutaTab = document.querySelector('[href="#mi-ruta"]') as HTMLElement
    if (miRutaTab) miRutaTab.click()
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-red-500">Error cargando mapa</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-navy-accent" />
      </div>
    )
  }

  const { clientes, stats } = data

  // Calcular bounds del mapa
  const bounds = clientes.reduce(
    (acc: any, c: Cliente) => ({
      minLat: Math.min(acc.minLat, c.lat),
      maxLat: Math.max(acc.maxLat, c.lat),
      minLng: Math.min(acc.minLng, c.lng),
      maxLng: Math.max(acc.maxLng, c.lng)
    }),
    { minLat: Infinity, maxLat: -Infinity, minLng: Infinity, maxLng: -Infinity }
  )

  // Incluir ubicación del usuario en bounds
  if (userLocation) {
    bounds.minLat = Math.min(bounds.minLat, userLocation.lat)
    bounds.maxLat = Math.max(bounds.maxLat, userLocation.lat)
    bounds.minLng = Math.min(bounds.minLng, userLocation.lng)
    bounds.maxLng = Math.max(bounds.maxLng, userLocation.lng)
  }

  // Convertir coordenadas GPS a posición % en el mapa
  const latToY = (lat: number) => {
    const range = bounds.maxLat - bounds.minLat || 0.01
    return ((bounds.maxLat - lat) / range) * 100
  }

  const lngToX = (lng: number) => {
    const range = bounds.maxLng - bounds.minLng || 0.01
    return ((lng - bounds.minLng) / range) * 100
  }

  // Convertir clientes a pins con posiciones reales
  const pins: MapPin2[] = clientes.map((c: Cliente) => {
    let status: PinStatus = "pendiente"
    if (c.visitado_en) {
      status = c.validada ? "validada" : "sospechosa"
    } else if (selectedCliente?.id === c.id) {
      status = "en-progreso"
    }

    return {
      x: lngToX(c.lng),
      y: latToY(c.lat),
      label: c.nombre,
      status,
      cliente: c,
      distance: c.distancia_metros 
        ? c.distancia_metros < 1000
          ? `~${Math.round(c.distancia_metros)}m`
          : `~${(c.distancia_metros / 1000).toFixed(1)}km`
        : undefined
    }
  })

  // Posición del usuario en el mapa
  const userPos = userLocation
    ? { x: lngToX(userLocation.lng), y: latToY(userLocation.lat) }
    : null

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="px-4 pb-2 pt-4">
        <h2 className="text-lg font-bold text-white">Mapa de Ruta</h2>
        <p className="text-xs text-gray-400">{stats.total} puntos de visita asignados</p>
      </div>

      {/* Map */}
      <div className="relative mx-4 flex-1 overflow-hidden rounded-xl border border-white/10 bg-[#0C1520]" style={{ minHeight: "460px" }}>
        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `
              linear-gradient(rgba(46,109,164,0.3) 1px, transparent 1px),
              linear-gradient(90deg, rgba(46,109,164,0.3) 1px, transparent 1px)
            `,
            backgroundSize: "40px 40px",
          }}
        />

        {/* Street-like lines */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {/* Horizontal streets */}
          <line x1="0" y1="30" x2="100" y2="30" stroke="rgba(46,109,164,0.2)" strokeWidth="0.5" />
          <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(46,109,164,0.25)" strokeWidth="0.7" />
          <line x1="0" y1="70" x2="100" y2="70" stroke="rgba(46,109,164,0.2)" strokeWidth="0.5" />

          {/* Vertical streets */}
          <line x1="25" y1="0" x2="25" y2="100" stroke="rgba(46,109,164,0.2)" strokeWidth="0.5" />
          <line x1="50" y1="0" x2="50" y2="100" stroke="rgba(46,109,164,0.25)" strokeWidth="0.7" />
          <line x1="75" y1="0" x2="75" y2="100" stroke="rgba(46,109,164,0.2)" strokeWidth="0.5" />

          {/* Route connecting pending pins */}
          <polyline
            points={pins
              .filter(p => p.status === "pendiente" || p.status === "en-progreso")
              .map((p) => `${p.x},${p.y}`)
              .join(" ")}
            fill="none"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="0.4"
            strokeDasharray="2,1.5"
          />
        </svg>

        {/* User position (pulsing blue dot) */}
        {userPos && (
          <div
            className="absolute z-20 flex items-center justify-center"
            style={{
              left: `${userPos.x}%`,
              top: `${userPos.y}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            <div className="h-4 w-4 rounded-full border-2 border-white bg-navy-accent shadow-[0_0_12px_rgba(46,109,164,0.6)]">
              <div className="absolute inset-0 animate-ping rounded-full bg-navy-accent/40" />
            </div>
          </div>
        )}

        {/* Pin markers */}
        {pins.map((pin, i) => (
          <div
            key={i}
            className="group absolute z-10 cursor-pointer"
            style={{
              left: `${pin.x}%`,
              top: `${pin.y}%`,
              transform: "translate(-50%, -100%)",
            }}
            onClick={() => setSelectedCliente(pin.cliente)}
          >
            <div className="relative">
              <MapPin
                className="h-6 w-6 drop-shadow-lg"
                fill={pinColors[pin.status]}
                color={pinColors[pin.status]}
                strokeWidth={1}
              />
              {/* Tooltip on hover */}
              <div className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded-lg bg-dark-surface px-2 py-1 text-[10px] text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                {pin.label}
              </div>
            </div>
          </div>
        ))}

        {/* Legend */}
        <div className="absolute left-3 top-3 z-30 flex flex-col gap-1 rounded-lg bg-dark-bg/90 p-2.5 backdrop-blur-sm">
          {[
            { color: "bg-success", label: `Validada (${stats.validadas})` },
            { color: "bg-warning", label: `Sospechosa (${stats.sospechosas})` },
            { color: "bg-navy-accent", label: "En Progreso" },
            { color: "bg-gray-500", label: `Pendiente (${stats.pendientes})` },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <div className={`h-2 w-2 rounded-full ${item.color}`} />
              <span className="text-[9px] text-gray-400">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom floating card - Cliente seleccionado */}
      {selectedCliente && (
        <div className="mx-4 mb-4 mt-3 flex items-center gap-3 rounded-xl border border-white/10 bg-dark-surface p-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy-accent/20">
            <MapPin className="h-5 w-5 text-navy-accent" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">{selectedCliente.nombre}</p>
            <p className="font-mono text-xs text-gray-400">
              {selectedCliente.distancia_metros 
                ? selectedCliente.distancia_metros < 1000
                  ? `${Math.round(selectedCliente.distancia_metros)}m de distancia`
                  : `${(selectedCliente.distancia_metros / 1000).toFixed(1)}km de distancia`
                : userLocation ? 'Calculando...' : 'Activando GPS...'
              }
            </p>
          </div>
          {!selectedCliente.visitado_en && (
            <button 
              onClick={handleCheckIn}
              className="rounded-lg bg-success px-4 py-2 text-xs font-bold text-white shadow-lg shadow-success/20 transition-all active:scale-95"
            >
              CHECK-IN
            </button>
          )}
        </div>
      )}
    </div>
  )
}
