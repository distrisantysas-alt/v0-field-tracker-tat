"use client"

// ============================================================================
// components/asesor/mapa-tab.tsx — MAPA REAL + BÚSQUEDA + NAVEGACIÓN
// ✅ Pins con iniciales del cliente (no emoji ⏳)
// ✅ Buscador por nombre de cliente
// ✅ Google Maps / Waze integration
// ============================================================================

import { useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { Loader2, MapPin, X, Check, AlertTriangle, Search } from "lucide-react"
import { type AsesorSession } from "./login-asesor"

const fetcher = (url: string) => fetch(url).then(r => r.json())

function fechaColombia() {
  return new Date().toLocaleString('en-CA', { timeZone: 'America/Bogota' }).split(',')[0]
}

function getInitials(nombre: string): string {
  return nombre.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
}

interface MapaTabProps { asesor: AsesorSession }

interface ClienteMap {
  id: string
  nombre: string
  direccion: string
  lat: number | null
  lng: number | null
  visitado_en: string | null
  validada: boolean | null
  distancia_metros: number | null
}

function abrirGoogleMaps(lat: number, lng: number) {
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`, '_blank')
}
function abrirWaze(lat: number, lng: number) {
  window.open(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`, '_blank')
}

export function MapaTab({ asesor }: MapaTabProps) {
  const mapRef        = useRef<HTMLDivElement>(null)
  const leafletRef    = useRef<any>(null)
  const markersRef    = useRef<any[]>([])
  const userMarkerRef = useRef<any>(null)

  const [mapReady, setMapReady]         = useState(false)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [clienteSel, setClienteSel]     = useState<ClienteMap | null>(null)
  const [mapError, setMapError]         = useState("")

  const [query, setQuery]             = useState("")
  const [showResults, setShowResults] = useState(false)

  const fecha = fechaColombia()

  const { data, isLoading } = useSWR(
    `/api/clientes-del-dia?asesor_id=${asesor.id}&fecha=${fecha}`,
    fetcher,
    { refreshInterval: 30000 }
  )

  const clientes: ClienteMap[] = data?.clientes ?? []

  const resultados = query.trim().length >= 2
    ? clientes.filter(c =>
        c.nombre.toLowerCase().includes(query.toLowerCase()) ||
        c.direccion?.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 6)
    : []

  // ── Cargar Leaflet ────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined" || leafletRef.current) return
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'
      link.rel = 'stylesheet'
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'
      document.head.appendChild(link)
    }
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'
    script.onload = () => { leafletRef.current = (window as any).L; setMapReady(true) }
    script.onerror = () => setMapError("Error cargando el mapa. Verifica tu conexión.")
    document.head.appendChild(script)
  }, [])

  // ── Inicializar mapa ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current || !leafletRef.current) return
    if ((mapRef.current as any)._leaflet_id) return
    const L = leafletRef.current
    const map = L.map(mapRef.current, { center: [7.119, -73.1227], zoom: 13, zoomControl: true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19
    }).addTo(map)
    ;(mapRef.current as any)._mapInstance = map
  }, [mapReady])

  // ── GPS del asesor ────────────────────────────────────────────────────────
  useEffect(() => {
    const update = () => navigator.geolocation?.getCurrentPosition(
      pos => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    )
    update()
    const t = setInterval(update, 10000)
    return () => clearInterval(t)
  }, [])

  // ── Pin del asesor ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !userLocation) return
    const map = (mapRef.current as any)?._mapInstance
    const L   = leafletRef.current
    if (!map || !L) return
    const userIcon = L.divIcon({
      className: '',
      html: `<div style="position:relative;width:20px;height:20px">
        <div style="position:absolute;inset:0;border-radius:50%;background:rgba(46,109,164,0.3);animation:ping 1.5s infinite"></div>
        <div style="position:absolute;inset:3px;border-radius:50%;background:#2E6DA4;border:2px solid white;box-shadow:0 0 8px rgba(46,109,164,0.8)"></div>
      </div>
      <style>@keyframes ping{0%,100%{transform:scale(1);opacity:0.7}50%{transform:scale(1.8);opacity:0}}</style>`,
      iconSize: [20, 20], iconAnchor: [10, 10],
    })
    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([userLocation.lat, userLocation.lng])
    } else {
      userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon })
        .addTo(map).bindPopup('<b>📍 Tu ubicación</b>')
      map.setView([userLocation.lat, userLocation.lng], 14)
    }
  }, [mapReady, userLocation])

  // ── Pins de clientes con iniciales ───────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !clientes.length) return
    const map = (mapRef.current as any)?._mapInstance
    const L   = leafletRef.current
    if (!map || !L) return
    markersRef.current.forEach(m => map.removeLayer(m))
    markersRef.current = []

    clientes.filter(c => c.lat && c.lng).forEach((c: ClienteMap) => {
      // Color según estado
      let bgColor  = '#4B5563' // gris — pendiente
      let txtColor = '#FFFFFF'

      if (c.visitado_en && c.validada === true) {
        bgColor  = '#1A7A4A' // verde — validada
      } else if (c.visitado_en && c.validada === false) {
        bgColor  = '#D97706' // amarillo — sospechosa
      }

      const initials = getInitials(c.nombre)

      const icon = L.divIcon({
        className: '',
        html: `
          <div style="
            background:${bgColor};
            border:2px solid white;
            border-radius:50% 50% 50% 0;
            width:32px;
            height:32px;
            transform:rotate(-45deg);
            box-shadow:0 2px 6px rgba(0,0,0,0.4);
            display:flex;
            align-items:center;
            justify-content:center;
          ">
            <span style="
              transform:rotate(45deg);
              font-size:10px;
              font-weight:700;
              color:${txtColor};
              font-family:sans-serif;
              line-height:1;
              letter-spacing:-0.5px;
            ">${initials}</span>
          </div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32],
      })

      const marker = L.marker([c.lat!, c.lng!], { icon }).addTo(map).on('click', () => {
        setClienteSel(c)
        setQuery("")
        setShowResults(false)
      })
      markersRef.current.push(marker)
    })

    // Ajustar vista si no hay GPS del asesor
    if (!userLocation) {
      const withCoords = clientes.filter(c => c.lat && c.lng)
      if (withCoords.length > 0) {
        const group = L.featureGroup(markersRef.current)
        map.fitBounds(group.getBounds().pad(0.15))
      }
    }
  }, [mapReady, data])

  // ── Volar al cliente buscado ──────────────────────────────────────────────
  const volarA = (cliente: ClienteMap) => {
    const map = (mapRef.current as any)?._mapInstance
    if (map && cliente.lat && cliente.lng) {
      map.setView([cliente.lat, cliente.lng], 17)
    }
    setClienteSel(cliente)
    setQuery("")
    setShowResults(false)
  }

  const stats  = data?.stats ?? { total: 0, validadas: 0, sospechosas: 0, pendientes: 0 }
  const sinGPS = clientes.filter(c => !c.lat || !c.lng).length

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 140px)' }}>

      {/* ── Buscador ── */}
      <div className="relative px-3 py-2 border-b border-white/10 bg-dark-surface z-[1001]">
        <div className="flex items-center gap-2 rounded-xl bg-dark-bg border border-white/10 px-3 py-2">
          <Search className="h-4 w-4 text-gray-500 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setShowResults(true) }}
            onFocus={() => setShowResults(true)}
            placeholder="Buscar cliente o dirección..."
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none"
          />
          {query && (
            <button onClick={() => { setQuery(""); setShowResults(false) }}>
              <X className="h-4 w-4 text-gray-500" />
            </button>
          )}
        </div>

        {/* Resultados */}
        {showResults && resultados.length > 0 && (
          <div className="absolute left-3 right-3 top-full mt-1 rounded-xl border border-white/10 bg-dark-bg shadow-2xl overflow-hidden">
            {resultados.map(c => (
              <button
                key={c.id}
                onClick={() => volarA(c)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/5 active:bg-white/10 border-b border-white/5 last:border-0"
              >
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                  c.visitado_en && c.validada ? 'bg-success/20' :
                  c.visitado_en ? 'bg-warning/20' : 'bg-gray-500/20'
                }`}>
                  {c.visitado_en && c.validada
                    ? <Check className="h-4 w-4 text-success" />
                    : c.visitado_en
                    ? <AlertTriangle className="h-4 w-4 text-warning" />
                    : <MapPin className="h-4 w-4 text-gray-400" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{c.nombre}</p>
                  <p className="text-xs text-gray-500 truncate">{c.direccion}</p>
                </div>
                {!c.lat && (
                  <span className="text-[10px] text-warning shrink-0">sin GPS</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Sin resultados */}
        {showResults && query.trim().length >= 2 && resultados.length === 0 && (
          <div className="absolute left-3 right-3 top-full mt-1 rounded-xl border border-white/10 bg-dark-bg px-4 py-3 shadow-2xl">
            <p className="text-sm text-gray-400">No se encontró "{query}"</p>
          </div>
        )}
      </div>

      {/* Stats rápidas */}
      <div className="flex items-center gap-3 border-b border-white/10 bg-dark-surface px-4 py-1.5">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-success" />
          <span className="text-[11px] text-gray-400">{stats.validadas} ok</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-warning" />
          <span className="text-[11px] text-gray-400">{stats.sospechosas} sospechosas</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-gray-500" />
          <span className="text-[11px] text-gray-400">{stats.pendientes} pendientes</span>
        </div>
        {sinGPS > 0 && (
          <div className="ml-auto flex items-center gap-1">
            <MapPin className="h-3 w-3 text-warning" />
            <span className="text-[10px] text-warning">{sinGPS} sin GPS</span>
          </div>
        )}
      </div>

      {/* Mapa */}
      <div className="relative flex-1">
        {(isLoading || !mapReady) && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-dark-bg gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-navy-accent" />
            <p className="text-xs text-gray-400">Cargando mapa...</p>
          </div>
        )}
        {mapError && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-dark-bg gap-3 px-8 text-center">
            <AlertTriangle className="h-10 w-10 text-warning" />
            <p className="text-sm text-gray-300">{mapError}</p>
          </div>
        )}
        <div ref={mapRef} className="h-full w-full" />
      </div>

      {/* ── Tarjeta del cliente seleccionado ── */}
      {clienteSel && (
        <div className="absolute bottom-20 left-3 right-3 z-[1000] rounded-2xl border border-white/10 bg-dark-surface/97 backdrop-blur-md shadow-2xl overflow-hidden">
          <div className="flex items-start gap-3 p-4">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              clienteSel.visitado_en && clienteSel.validada ? 'bg-success/20' :
              clienteSel.visitado_en ? 'bg-warning/20' : 'bg-gray-500/20'
            }`}>
              {clienteSel.visitado_en && clienteSel.validada
                ? <Check className="h-5 w-5 text-success" />
                : clienteSel.visitado_en
                ? <AlertTriangle className="h-5 w-5 text-warning" />
                : <MapPin className="h-5 w-5 text-gray-400" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{clienteSel.nombre}</p>
              <p className="text-xs text-gray-400 truncate">{clienteSel.direccion}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  clienteSel.visitado_en && clienteSel.validada ? 'bg-success/20 text-success' :
                  clienteSel.visitado_en ? 'bg-warning/20 text-warning' :
                  'bg-gray-500/20 text-gray-400'
                }`}>
                  {clienteSel.visitado_en && clienteSel.validada ? 'VISITADA ✓' :
                   clienteSel.visitado_en ? 'SOSPECHOSA' : 'PENDIENTE'}
                </span>
                {clienteSel.distancia_metros != null && (
                  <span className="text-[10px] font-mono text-gray-500">
                    {clienteSel.distancia_metros < 1000
                      ? `${Math.round(clienteSel.distancia_metros)}m`
                      : `${(clienteSel.distancia_metros / 1000).toFixed(1)}km`}
                  </span>
                )}
              </div>
            </div>
            <button onClick={() => setClienteSel(null)} className="shrink-0 p-1 text-gray-500 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Botones navegación */}
          {clienteSel.lat && clienteSel.lng ? (
            <div className="grid grid-cols-2 gap-0 border-t border-white/10">
              <button
                onClick={() => abrirGoogleMaps(clienteSel.lat!, clienteSel.lng!)}
                className="flex items-center justify-center gap-2 py-3.5 text-sm font-semibold text-white bg-[#4285F4]/20 hover:bg-[#4285F4]/30 active:bg-[#4285F4]/40 transition-colors border-r border-white/10"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                </svg>
                Google Maps
              </button>
              <button
                onClick={() => abrirWaze(clienteSel.lat!, clienteSel.lng!)}
                className="flex items-center justify-center gap-2 py-3.5 text-sm font-semibold text-white bg-[#33CCFF]/10 hover:bg-[#33CCFF]/20 active:bg-[#33CCFF]/30 transition-colors"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#33CCFF">
                  <path d="M12 1.5C6.2 1.5 1.5 6.2 1.5 12S6.2 22.5 12 22.5 22.5 17.8 22.5 12 17.8 1.5 12 1.5zm0 4c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm4 9.5c-.8 1.5-2.3 2.5-4 2.5s-3.2-1-4-2.5h8z"/>
                </svg>
                Waze
              </button>
            </div>
          ) : (
            <div className="border-t border-white/10 px-4 py-3 text-center">
              <p className="text-xs text-warning">⚠️ Sin coordenadas GPS registradas</p>
              <p className="text-[10px] text-gray-500 mt-0.5">Ve a Mi Ruta → capturar GPS</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
