"use client"

// ============================================================================
// components/asesor/mapa-tab.tsx — MAPA REAL + NAVEGACIÓN GPS
// ✅ Mapa real con calles OpenStreetMap (sin API key)
// ✅ ASESOR_ID dinámico desde props
// ✅ Pin azul pulsante = ubicación del asesor
// ✅ Pins coloreados según estado de visita
// ✅ Click en pin → tarjeta con botones "Cómo llegar"
// ✅ Abre Google Maps o Waze con navegación completa
// ============================================================================

import { useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { Loader2, MapPin, Navigation, X, Check, AlertTriangle } from "lucide-react"
import { type AsesorSession } from "./login-asesor"

const fetcher = (url: string) => fetch(url).then(r => r.json())

function fechaColombia() {
  return new Date().toLocaleString('en-CA', { timeZone: 'America/Bogota' }).split(',')[0]
}

interface MapaTabProps {
  asesor: AsesorSession
}

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

// Abre Google Maps con navegación paso a paso
function abrirGoogleMaps(lat: number, lng: number) {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
  window.open(url, '_blank')
}

// Abre Waze con navegación
function abrirWaze(lat: number, lng: number) {
  const url = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
  window.open(url, '_blank')
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

  const fecha = fechaColombia()

  const { data, isLoading } = useSWR(
    `/api/clientes-del-dia?asesor_id=${asesor.id}&fecha=${fecha}`,
    fetcher,
    { refreshInterval: 30000 }
  )

  // ── Cargar Leaflet dinámicamente ─────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return
    if (leafletRef.current) return

    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id   = 'leaflet-css'
      link.rel  = 'stylesheet'
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'
      document.head.appendChild(link)
    }

    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'
    script.onload = () => {
      leafletRef.current = (window as any).L
      setMapReady(true)
    }
    script.onerror = () => setMapError("Error cargando el mapa. Verifica tu conexión.")
    document.head.appendChild(script)
  }, [])

  // ── Inicializar mapa ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current || !leafletRef.current) return
    if ((mapRef.current as any)._leaflet_id) return

    const L = leafletRef.current
    const map = L.map(mapRef.current, {
      center: [7.119, -73.1227], // Bucaramanga
      zoom: 13,
      zoomControl: true,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map)

    ;(mapRef.current as any)._mapInstance = map
  }, [mapReady])

  // ── GPS del asesor ────────────────────────────────────────────────────────
  useEffect(() => {
    const update = () => {
      navigator.geolocation?.getCurrentPosition(
        pos => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {},
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      )
    }
    update()
    const t = setInterval(update, 10000)
    return () => clearInterval(t)
  }, [])

  // ── Pin del asesor (azul pulsante) ────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !userLocation) return
    const map = (mapRef.current as any)?._mapInstance
    const L   = leafletRef.current
    if (!map || !L) return

    const userIcon = L.divIcon({
      className: '',
      html: `
        <div style="position:relative;width:20px;height:20px">
          <div style="position:absolute;inset:0;border-radius:50%;background:rgba(46,109,164,0.3);animation:ping 1.5s infinite"></div>
          <div style="position:absolute;inset:3px;border-radius:50%;background:#2E6DA4;border:2px solid white;box-shadow:0 0 8px rgba(46,109,164,0.8)"></div>
        </div>
        <style>@keyframes ping{0%,100%{transform:scale(1);opacity:0.7}50%{transform:scale(1.8);opacity:0}}</style>
      `,
      iconSize:   [20, 20],
      iconAnchor: [10, 10],
    })

    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([userLocation.lat, userLocation.lng])
    } else {
      userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon })
        .addTo(map)
        .bindPopup('<b>📍 Tu ubicación</b>')
      map.setView([userLocation.lat, userLocation.lng], 14)
    }
  }, [mapReady, userLocation])

  // ── Pins de clientes ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !data?.clientes) return
    const map = (mapRef.current as any)?._mapInstance
    const L   = leafletRef.current
    if (!map || !L) return

    markersRef.current.forEach(m => map.removeLayer(m))
    markersRef.current = []

    const clientes: ClienteMap[] = data.clientes.filter((c: ClienteMap) => c.lat && c.lng)

    clientes.forEach((c: ClienteMap) => {
      let color = '#6B7280'
      let emoji = '⏳'
      if (c.visitado_en && c.validada === true)  { color = '#1A7A4A'; emoji = '✅' }
      if (c.visitado_en && c.validada === false) { color = '#D97706'; emoji = '⚠️' }

      const icon = L.divIcon({
        className: '',
        html: `
          <div style="
            background:${color};border:2px solid white;
            border-radius:50% 50% 50% 0;width:28px;height:28px;
            transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,0.4);
            display:flex;align-items:center;justify-content:center;
          ">
            <span style="transform:rotate(45deg);font-size:12px">${emoji}</span>
          </div>
        `,
        iconSize:    [28, 28],
        iconAnchor:  [14, 28],
        popupAnchor: [0, -28],
      })

      const marker = L.marker([c.lat!, c.lng!], { icon })
        .addTo(map)
        .on('click', () => setClienteSel(c))

      markersRef.current.push(marker)
    })

    if (clientes.length > 0 && !userLocation) {
      const group = L.featureGroup(markersRef.current)
      map.fitBounds(group.getBounds().pad(0.15))
    }
  }, [mapReady, data])

  const stats  = data?.stats    ?? { total: 0, validadas: 0, sospechosas: 0, pendientes: 0 }
  const sinGPS = (data?.clientes ?? []).filter((c: ClienteMap) => !c.lat || !c.lng).length

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 140px)' }}>

      {/* Stats rápidas */}
      <div className="flex items-center gap-3 border-b border-white/10 bg-dark-surface px-4 py-2">
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-success" />
          <span className="text-xs text-gray-400">{stats.validadas} ok</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-warning" />
          <span className="text-xs text-gray-400">{stats.sospechosas} sospechosas</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-gray-500" />
          <span className="text-xs text-gray-400">{stats.pendientes} pendientes</span>
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

          {/* Cabecera */}
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

          {/* Botones de navegación — solo si tiene coordenadas */}
          {clienteSel.lat && clienteSel.lng && (
            <div className="grid grid-cols-2 gap-0 border-t border-white/10">

              {/* Google Maps */}
              <button
                onClick={() => abrirGoogleMaps(clienteSel.lat!, clienteSel.lng!)}
                className="flex items-center justify-center gap-2 py-3.5 text-sm font-semibold text-white bg-[#4285F4]/20 hover:bg-[#4285F4]/30 active:bg-[#4285F4]/40 transition-colors border-r border-white/10"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                </svg>
                Google Maps
              </button>

              {/* Waze */}
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
          )}

          {/* Si no tiene GPS registrado */}
          {(!clienteSel.lat || !clienteSel.lng) && (
            <div className="border-t border-white/10 px-4 py-3 text-center">
              <p className="text-xs text-warning">⚠️ Este cliente no tiene coordenadas GPS registradas</p>
              <p className="text-[10px] text-gray-500 mt-0.5">Ve a Mi Ruta → capturar GPS para registrarlas</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
