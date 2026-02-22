"use client"

// ============================================================================
// components/asesor/mapa-tab.tsx — MAPA + BÚSQUEDA + NAVEGACIÓN + RUTERO
// ✅ Selección de clientes directamente en el mapa
// ✅ Optimización de recorrido por proximidad
// ✅ Navegación parada por parada
// ============================================================================

import { useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { Loader2, MapPin, X, Check, AlertTriangle, Search, Route, ChevronRight } from "lucide-react"
import { type AsesorSession } from "./login-asesor"

const fetcher = (url: string) => fetch(url).then(r => r.json())

function fechaColombia() {
  return new Date().toLocaleString('en-CA', { timeZone: 'America/Bogota' }).split(',')[0]
}
function getInitials(nombre: string): string {
  return nombre.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
}
function getNombreSinRuta(nombre: string) {
  const partes = nombre.split(' ')
  return partes.length > 1 ? partes.slice(1).join(' ') : nombre
}
function distanciaKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}
function optimizarRuta(origen: {lat:number;lng:number}, clientes: ClienteMap[]): ClienteMap[] {
  const pendientes = [...clientes]
  const ruta: ClienteMap[] = []
  let pos = origen
  while (pendientes.length > 0) {
    let minDist = Infinity, idx = 0
    pendientes.forEach((c, i) => {
      if (!c.lat || !c.lng) return
      const d = distanciaKm(pos.lat, pos.lng, c.lat, c.lng)
      if (d < minDist) { minDist = d; idx = i }
    })
    ruta.push(pendientes[idx])
    pos = { lat: pendientes[idx].lat!, lng: pendientes[idx].lng! }
    pendientes.splice(idx, 1)
  }
  return ruta
}
function abrirGoogleMaps(lat: number, lng: number) {
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`, '_blank')
}
function abrirWaze(lat: number, lng: number) {
  window.open(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`, '_blank')
}

interface MapaTabProps { asesor: AsesorSession }
interface ClienteMap {
  id: string; nombre: string; direccion: string
  lat: number | null; lng: number | null
  visitado_en: string | null; validada: boolean | null; distancia_metros: number | null
}

export function MapaTab({ asesor }: MapaTabProps) {
  const mapRef        = useRef<HTMLDivElement>(null)
  const leafletRef    = useRef<any>(null)
  const markersMapRef = useRef<Map<string, any>>(new Map()) // id -> marker
  const userMarkerRef = useRef<any>(null)

  const [mapReady, setMapReady]         = useState(false)
  const [userLocation, setUserLocation] = useState<{lat:number;lng:number}|null>(null)
  const [clienteSel, setClienteSel]     = useState<ClienteMap|null>(null)
  const [mapError, setMapError]         = useState("")
  const [query, setQuery]               = useState("")
  const [showResults, setShowResults]   = useState(false)

  // Rutero
  const [modoRutero, setModoRutero]         = useState(false)
  const [seleccionados, setSeleccionados]   = useState<Set<string>>(new Set())
  const [ruteroActivo, setRuteroActivo]     = useState<ClienteMap[]>([])
  const [parada, setParada]                 = useState(0)
  const [vistaRutero, setVistaRutero]       = useState(false)

  const fecha = fechaColombia()
  const { data, isLoading } = useSWR(
    `/api/clientes-del-dia?asesor_id=${asesor.id}&fecha=${fecha}`,
    fetcher, { refreshInterval: 30000 }
  )
  const clientes: ClienteMap[] = data?.clientes ?? []
  const stats = data?.stats ?? { total:0, validadas:0, sospechosas:0, pendientes:0 }
  const sinGPS = clientes.filter(c => !c.lat || !c.lng).length

  const resultados = query.trim().length >= 2
    ? clientes.filter(c =>
        c.nombre.toLowerCase().includes(query.toLowerCase()) ||
        c.direccion?.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 6)
    : []

  // ── Color de un marker según estado y selección ───────────────────────────
  const getColor = (c: ClienteMap, esSel: boolean) => {
    if (esSel) return '#2E6DA4'
    if (c.visitado_en && c.validada === true)  return '#1A7A4A'
    if (c.visitado_en && c.validada === false) return '#D97706'
    return '#4B5563'
  }

  // ── Crear icono para un marker ────────────────────────────────────────────
  const crearIcono = (L: any, c: ClienteMap, esSel: boolean) => {
    const bg = getColor(c, esSel)
    const initials = getInitials(c.nombre)
    const border = esSel ? '3px solid #60A5FA' : '2px solid white'
    return L.divIcon({
      className: '',
      html: `<div style="background:${bg};border:${border};border-radius:50% 50% 50% 0;width:32px;height:32px;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;">
        <span style="transform:rotate(45deg);font-size:10px;font-weight:700;color:#fff;font-family:sans-serif;line-height:1;letter-spacing:-0.5px;">${initials}</span>
      </div>`,
      iconSize: [32,32], iconAnchor: [16,32], popupAnchor: [0,-32],
    })
  }

  // ── Cargar Leaflet ────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined" || leafletRef.current) return
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id='leaflet-css'; link.rel='stylesheet'
      link.href='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'
      document.head.appendChild(link)
    }
    const script = document.createElement('script')
    script.src='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'
    script.onload = () => { leafletRef.current = (window as any).L; setMapReady(true) }
    script.onerror = () => setMapError("Error cargando el mapa.")
    document.head.appendChild(script)
  }, [])

  // ── Inicializar mapa ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current || !leafletRef.current) return
    if ((mapRef.current as any)._leaflet_id) return
    const L = leafletRef.current
    const map = L.map(mapRef.current, { center:[7.119,-73.1227], zoom:13, zoomControl:true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:'© OpenStreetMap', maxZoom:19
    }).addTo(map)
    ;(mapRef.current as any)._mapInstance = map
  }, [mapReady])

  // ── GPS del asesor ────────────────────────────────────────────────────────
  useEffect(() => {
    const update = () => navigator.geolocation?.getCurrentPosition(
      pos => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}, { enableHighAccuracy:true, timeout:15000, maximumAge:10000 }
    )
    update()
    const t = setInterval(update, 10000)
    return () => clearInterval(t)
  }, [])

  // ── Pin del asesor ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !userLocation) return
    const map = (mapRef.current as any)?._mapInstance
    const L = leafletRef.current
    if (!map || !L) return
    const userIcon = L.divIcon({
      className:'',
      html:`<div style="position:relative;width:20px;height:20px">
        <div style="position:absolute;inset:0;border-radius:50%;background:rgba(46,109,164,0.3);animation:ping 1.5s infinite"></div>
        <div style="position:absolute;inset:3px;border-radius:50%;background:#2E6DA4;border:2px solid white;box-shadow:0 0 8px rgba(46,109,164,0.8)"></div>
      </div>
      <style>@keyframes ping{0%,100%{transform:scale(1);opacity:0.7}50%{transform:scale(1.8);opacity:0}}</style>`,
      iconSize:[20,20], iconAnchor:[10,10],
    })
    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([userLocation.lat, userLocation.lng])
    } else {
      userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], { icon:userIcon })
        .addTo(map).bindPopup('<b>📍 Tu ubicación</b>')
      map.setView([userLocation.lat, userLocation.lng], 14)
    }
  }, [mapReady, userLocation])

  // ── Dibujar markers UNA SOLA VEZ cuando llega la data ────────────────────
  useEffect(() => {
    if (!mapReady || !clientes.length) return
    const map = (mapRef.current as any)?._mapInstance
    const L = leafletRef.current
    if (!map || !L) return

    // Eliminar markers viejos
    markersMapRef.current.forEach(m => map.removeLayer(m))
    markersMapRef.current.clear()

    clientes.filter(c => c.lat && c.lng).forEach((c: ClienteMap) => {
      const icon = crearIcono(L, c, false)
      const marker = L.marker([c.lat!, c.lng!], { icon }).addTo(map)
      marker.on('click', () => handleMarkerClick(c))
      markersMapRef.current.set(c.id, marker)
    })

    if (!userLocation) {
      const arr = Array.from(markersMapRef.current.values())
      if (arr.length > 0) {
        const group = L.featureGroup(arr)
        map.fitBounds(group.getBounds().pad(0.15))
      }
    }
  }, [mapReady, data])

  // ── Click en marker: actualiza SOLO ese marker ───────────────────────────
  const handleMarkerClick = (c: ClienteMap) => {
    if (modoRutero) {
      // Actualizar solo este marker
      setSeleccionados(prev => {
        const next = new Set(prev)
        const esSel = next.has(c.id)
        if (esSel) { next.delete(c.id) } else { next.add(c.id) }
        // Actualizar icono directamente en Leaflet
        const marker = markersMapRef.current.get(c.id)
        if (marker && leafletRef.current) {
          marker.setIcon(crearIcono(leafletRef.current, c, !esSel))
        }
        return next
      })
    } else {
      setClienteSel(c)
      setQuery("")
      setShowResults(false)
    }
  }

  // ── Activar/desactivar modo rutero ────────────────────────────────────────
  const toggleModoRutero = () => {
    if (modoRutero) {
      // Limpiar selección — resetear colores
      seleccionados.forEach(id => {
        const c = clientes.find(cl => cl.id === id)
        const marker = markersMapRef.current.get(id)
        if (c && marker && leafletRef.current) {
          marker.setIcon(crearIcono(leafletRef.current, c, false))
        }
      })
      setSeleccionados(new Set())
      setClienteSel(null)
    }
    setModoRutero(prev => !prev)
  }

  // ── Optimizar y arrancar rutero ───────────────────────────────────────────
  const iniciarRutero = () => {
    const clientesSel = clientes.filter(c => seleccionados.has(c.id) && c.lat && c.lng)
    const origen = userLocation ?? { lat: 7.119, lng: -73.1227 }
    const optimizado = optimizarRuta(origen, clientesSel)
    setRuteroActivo(optimizado)
    setParada(0)
    setVistaRutero(true)
    setModoRutero(false)
  }

  // ── Volar al cliente buscado ──────────────────────────────────────────────
  const volarA = (cliente: ClienteMap) => {
    const map = (mapRef.current as any)?._mapInstance
    if (map && cliente.lat && cliente.lng) map.setView([cliente.lat, cliente.lng], 17)
    setClienteSel(cliente)
    setQuery(""); setShowResults(false)
  }

  // ── VISTA RUTERO ──────────────────────────────────────────────────────────
  if (vistaRutero && ruteroActivo.length > 0) {
    const actual = ruteroActivo[parada]
    const totalDist = ruteroActivo.reduce((acc, c, i) => {
      if (!c.lat || !c.lng) return acc
      if (i === 0) {
        const o = userLocation ?? { lat:7.119, lng:-73.1227 }
        return acc + distanciaKm(o.lat, o.lng, c.lat, c.lng)
      }
      const prev = ruteroActivo[i-1]
      return acc + (prev.lat && prev.lng ? distanciaKm(prev.lat, prev.lng, c.lat, c.lng) : 0)
    }, 0)

    return (
      <div className="flex flex-col" style={{ height:'calc(100vh - 140px)' }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-dark-surface">
          <button onClick={() => { setVistaRutero(false); setSeleccionados(new Set()) }}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-dark-bg text-gray-400">
            <X className="h-4 w-4" />
          </button>
          <div className="flex-1">
            <p className="text-sm font-bold text-white">Rutero activo</p>
            <p className="text-xs text-gray-500">{ruteroActivo.length} paradas · {totalDist.toFixed(1)} km estimado</p>
          </div>
          <span className="rounded-full bg-navy-accent/20 px-3 py-1 text-xs font-bold text-navy-accent">
            {parada+1} / {ruteroActivo.length}
          </span>
        </div>

        {/* Parada actual */}
        {actual && (
          <div className="p-4 border-b border-white/10 bg-dark-bg space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-navy-accent text-xs font-bold text-white shrink-0">{parada+1}</div>
              <span className="text-xs font-semibold text-navy-accent uppercase tracking-wide">Próxima parada</span>
            </div>
            <div>
              <p className="text-base font-bold text-white">{getNombreSinRuta(actual.nombre)}</p>
              <p className="text-sm text-gray-400 mt-0.5">{actual.direccion || '—'}</p>
            </div>
            {actual.lat && actual.lng && (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => abrirGoogleMaps(actual.lat!, actual.lng!)}
                  className="flex items-center justify-center gap-2 rounded-xl bg-[#4285F4]/20 py-3 text-sm font-semibold text-white">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                  Google Maps
                </button>
                <button onClick={() => abrirWaze(actual.lat!, actual.lng!)}
                  className="flex items-center justify-center gap-2 rounded-xl bg-[#33CCFF]/10 py-3 text-sm font-semibold text-white">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="#33CCFF"><path d="M12 1.5C6.2 1.5 1.5 6.2 1.5 12S6.2 22.5 12 22.5 22.5 17.8 22.5 12 17.8 1.5 12 1.5zm0 4c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm4 9.5c-.8 1.5-2.3 2.5-4 2.5s-3.2-1-4-2.5h8z"/></svg>
                  Waze
                </button>
              </div>
            )}
            <div className="flex gap-2">
              {parada > 0 && (
                <button onClick={() => setParada(p => p-1)}
                  className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm text-gray-300">← Anterior</button>
              )}
              {parada < ruteroActivo.length-1 ? (
                <button onClick={() => setParada(p => p+1)}
                  className="flex-1 rounded-xl bg-navy-accent py-2.5 text-sm font-bold text-white">Siguiente →</button>
              ) : (
                <button onClick={() => { setVistaRutero(false); setSeleccionados(new Set()) }}
                  className="flex-1 rounded-xl bg-success py-2.5 text-sm font-bold text-dark-bg">✓ Finalizar</button>
              )}
            </div>
          </div>
        )}

        {/* Lista paradas */}
        <div className="flex-1 overflow-y-auto">
          <p className="px-4 py-2 text-[10px] text-gray-500 uppercase tracking-widest">Todas las paradas</p>
          {ruteroActivo.map((c, i) => (
            <button key={c.id} onClick={() => setParada(i)}
              className={`flex w-full items-center gap-3 px-4 py-3 border-b border-white/5 text-left ${i === parada ? 'bg-navy-accent/10' : 'hover:bg-white/5'}`}>
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${i < parada ? 'bg-success/20 text-success' : i === parada ? 'bg-navy-accent text-white' : 'bg-white/10 text-gray-400'}`}>
                {i < parada ? <Check className="h-3.5 w-3.5" /> : i+1}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${i === parada ? 'text-white' : 'text-gray-300'}`}>{getNombreSinRuta(c.nombre)}</p>
                <p className="text-xs text-gray-500 truncate">{c.direccion || '—'}</p>
              </div>
              {i === parada && <ChevronRight className="h-4 w-4 text-navy-accent shrink-0" />}
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── VISTA MAPA ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col" style={{ height:'calc(100vh - 140px)' }}>

      {/* Buscador */}
      <div className="relative px-3 py-2 border-b border-white/10 bg-dark-surface z-[1001]">
        <div className="flex items-center gap-2 rounded-xl bg-dark-bg border border-white/10 px-3 py-2">
          <Search className="h-4 w-4 text-gray-500 shrink-0" />
          <input type="text" value={query}
            onChange={e => { setQuery(e.target.value); setShowResults(true) }}
            onFocus={() => setShowResults(true)}
            placeholder="Buscar cliente o dirección..."
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none"
          />
          {query && <button onClick={() => { setQuery(""); setShowResults(false) }}><X className="h-4 w-4 text-gray-500" /></button>}
        </div>
        {showResults && resultados.length > 0 && (
          <div className="absolute left-3 right-3 top-full mt-1 rounded-xl border border-white/10 bg-dark-bg shadow-2xl overflow-hidden">
            {resultados.map(c => (
              <button key={c.id} onClick={() => volarA(c)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/5 border-b border-white/5 last:border-0">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${c.visitado_en && c.validada ? 'bg-success/20' : c.visitado_en ? 'bg-warning/20' : 'bg-gray-500/20'}`}>
                  {c.visitado_en && c.validada ? <Check className="h-4 w-4 text-success" /> : c.visitado_en ? <AlertTriangle className="h-4 w-4 text-warning" /> : <MapPin className="h-4 w-4 text-gray-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{c.nombre}</p>
                  <p className="text-xs text-gray-500 truncate">{c.direccion}</p>
                </div>
                {!c.lat && <span className="text-[10px] text-warning shrink-0">sin GPS</span>}
              </button>
            ))}
          </div>
        )}
        {showResults && query.trim().length >= 2 && resultados.length === 0 && (
          <div className="absolute left-3 right-3 top-full mt-1 rounded-xl border border-white/10 bg-dark-bg px-4 py-3 shadow-2xl">
            <p className="text-sm text-gray-400">No se encontró "{query}"</p>
          </div>
        )}
      </div>

      {/* Stats + botón rutero */}
      <div className="flex items-center gap-3 border-b border-white/10 bg-dark-surface px-3 py-1.5">
        <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-success" /><span className="text-[11px] text-gray-400">{stats.validadas} ok</span></div>
        <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-warning" /><span className="text-[11px] text-gray-400">{stats.sospechosas} sosp.</span></div>
        <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-gray-500" /><span className="text-[11px] text-gray-400">{stats.pendientes} pend.</span></div>
        <div className="ml-auto flex items-center gap-2">
          {sinGPS > 0 && <span className="text-[10px] text-warning">{sinGPS} sin GPS</span>}
          <button onClick={toggleModoRutero}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${modoRutero ? 'bg-warning text-dark-bg' : 'bg-white/10 text-gray-300'}`}>
            <Route className="h-3 w-3" />
            {modoRutero ? `Selec. (${seleccionados.size})` : 'Rutero'}
          </button>
        </div>
      </div>

      {/* Banner modo selección */}
      {modoRutero && (
        <div className="flex items-center gap-3 bg-warning/10 border-b border-warning/20 px-4 py-2.5 z-[1001]">
          <MapPin className="h-4 w-4 text-warning shrink-0" />
          <p className="flex-1 text-xs text-warning">Toca los clientes en el mapa para seleccionarlos</p>
          {seleccionados.size >= 2 && (
            <button onClick={iniciarRutero}
              className="shrink-0 rounded-full bg-warning px-3 py-1 text-xs font-bold text-dark-bg">
              Optimizar →
            </button>
          )}
        </div>
      )}

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

      {/* Tarjeta cliente seleccionado (solo fuera de modo rutero) */}
      {clienteSel && !modoRutero && (
        <div className="absolute bottom-20 left-3 right-3 z-[1000] rounded-2xl border border-white/10 bg-dark-surface/97 backdrop-blur-md shadow-2xl overflow-hidden">
          <div className="flex items-start gap-3 p-4">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${clienteSel.visitado_en && clienteSel.validada ? 'bg-success/20' : clienteSel.visitado_en ? 'bg-warning/20' : 'bg-gray-500/20'}`}>
              {clienteSel.visitado_en && clienteSel.validada ? <Check className="h-5 w-5 text-success" /> : clienteSel.visitado_en ? <AlertTriangle className="h-5 w-5 text-warning" /> : <MapPin className="h-5 w-5 text-gray-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{clienteSel.nombre}</p>
              <p className="text-xs text-gray-400 truncate">{clienteSel.direccion}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${clienteSel.visitado_en && clienteSel.validada ? 'bg-success/20 text-success' : clienteSel.visitado_en ? 'bg-warning/20 text-warning' : 'bg-gray-500/20 text-gray-400'}`}>
                  {clienteSel.visitado_en && clienteSel.validada ? 'VISITADA ✓' : clienteSel.visitado_en ? 'SOSPECHOSA' : 'PENDIENTE'}
                </span>
                {clienteSel.distancia_metros != null && (
                  <span className="text-[10px] font-mono text-gray-500">
                    {clienteSel.distancia_metros < 1000 ? `${Math.round(clienteSel.distancia_metros)}m` : `${(clienteSel.distancia_metros/1000).toFixed(1)}km`}
                  </span>
                )}
              </div>
            </div>
            <button onClick={() => setClienteSel(null)} className="shrink-0 p-1 text-gray-500 hover:text-white"><X className="h-4 w-4" /></button>
          </div>
          {clienteSel.lat && clienteSel.lng ? (
            <div className="grid grid-cols-2 gap-0 border-t border-white/10">
              <button onClick={() => abrirGoogleMaps(clienteSel.lat!, clienteSel.lng!)}
                className="flex items-center justify-center gap-2 py-3.5 text-sm font-semibold text-white bg-[#4285F4]/20 hover:bg-[#4285F4]/30 border-r border-white/10">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                Google Maps
              </button>
              <button onClick={() => abrirWaze(clienteSel.lat!, clienteSel.lng!)}
                className="flex items-center justify-center gap-2 py-3.5 text-sm font-semibold text-white bg-[#33CCFF]/10 hover:bg-[#33CCFF]/20">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#33CCFF"><path d="M12 1.5C6.2 1.5 1.5 6.2 1.5 12S6.2 22.5 12 22.5 22.5 17.8 22.5 12 17.8 1.5 12 1.5zm0 4c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm4 9.5c-.8 1.5-2.3 2.5-4 2.5s-3.2-1-4-2.5h8z"/></svg>
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
