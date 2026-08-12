"use client"

// ============================================================================
// components/entregador/entregador-layout.tsx
// ✅ Sin vista de pedidos
// ✅ Ruta obligatoria antes de ver clientes o mapa
// ✅ Mapa solo carga los clientes de la ruta seleccionada
// ✅ Buscador en mapa y en lista
// ============================================================================

import { useState, useEffect, useRef } from "react"
import useSWR from "swr"
import {
  ChevronDown, ChevronUp, Loader2, AlertTriangle,
  Navigation, Phone, X, LogOut, RefreshCw, Map,
  Users, Search, MapPin, Check
} from "lucide-react"
import { fetcher } from "@/lib/fetcher"

function fechaColombia() {
  return new Date().toLocaleString('en-CA', { timeZone: 'America/Bogota' }).split(',')[0]
}
function getInitials(nombre: string) {
  return nombre.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
}
function abrirGoogleMaps(lat: number, lng: number) {
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`, '_blank')
}
function abrirWaze(lat: number, lng: number) {
  window.open(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`, '_blank')
}

interface EntregadorSession {
  id: string; nombre: string; email: string; rol: string
}
interface EntregadorLayoutProps {
  entregador: EntregadorSession
  onLogout: () => void
}

export function EntregadorLayout({ entregador, onLogout }: EntregadorLayoutProps) {
  const [vista,      setVista]      = useState<'clientes' | 'mapa'>('clientes')
  const [filtroRuta, setFiltroRuta] = useState<string>("")
  const fecha = fechaColombia()

  // Solo cargar clientes cuando hay ruta seleccionada
  const { data: dataClientes, isLoading: loadingClientes, mutate: mutateClientes } = useSWR(
    filtroRuta ? `/api/entregador/clientes?fecha=${fecha}&ruta=${filtroRuta}` : null,
    fetcher,
    { refreshInterval: 120000 }
  )

  // Rutas disponibles — carga ligera solo para los chips
  const { data: dataTodas, isLoading: loadingRutas } = useSWR(
    `/api/entregador/clientes?fecha=${fecha}`,
    fetcher,
    { refreshInterval: 300000 }
  )

  const rutasUnicas: string[] = (dataTodas?.rutas_unicas ?? []).filter((r: string) => r !== 'SIN RUTA')

  // Lista plana para el mapa
  const clientesMapa: any[] = filtroRuta
    ? (dataClientes?.por_asesor ?? []).flatMap((a: any) =>
        a.rutas.flatMap((r: any) =>
          r.clientes.map((c: any) => ({ ...c, asesor: a.asesor }))
        )
      )
    : []

  return (
    <div className="flex flex-col min-h-screen bg-dark-bg">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-dark-surface">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-500/20 text-sm font-bold text-orange-400">
            {getInitials(entregador.nombre)}
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{entregador.nombre}</p>
            <p className="text-xs text-orange-400 font-medium">Entregador</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => mutateClientes()}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-dark-bg text-gray-400 hover:text-white transition-colors">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button onClick={onLogout}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-dark-bg text-gray-400 hover:text-danger transition-colors">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Selector de ruta */}
      <div className="px-4 pt-4 pb-2 border-b border-white/10">
        <p className="text-xs text-gray-500 mb-2 font-medium">
          {filtroRuta ? `📍 Ruta ${filtroRuta} seleccionada` : 'Selecciona una ruta para comenzar'}
        </p>
        {loadingRutas ? (
          <div className="flex items-center gap-2 py-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-400" />
            <span className="text-xs text-gray-500">Cargando rutas...</span>
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {rutasUnicas.map(r => (
              <button key={r}
                onClick={() => { setFiltroRuta(r); setVista('clientes') }}
                className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-all ${
                  filtroRuta === r
                    ? "bg-orange-500 text-white shadow-lg shadow-orange-500/25"
                    : "bg-dark-surface text-gray-400 border border-white/10 hover:border-orange-500/40"
                }`}>
                Ruta {r}
              </button>
            ))}
          </div>
        )}
        {filtroRuta && (
          <button onClick={() => { setFiltroRuta(""); setVista('clientes') }}
            className="mt-2 text-[10px] text-gray-600 hover:text-gray-400 flex items-center gap-1">
            <X className="h-3 w-3" /> Cambiar ruta
          </button>
        )}
      </div>

      {/* Toggle Clientes / Mapa — solo con ruta */}
      {filtroRuta && (
        <div className="flex gap-2 px-4 pt-3 pb-1">
          <button onClick={() => setVista('clientes')}
            className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold transition-all ${
              vista === 'clientes' ? 'bg-orange-500 text-white' : 'bg-dark-surface text-gray-400 border border-white/10'
            }`}>
            <Users className="h-3.5 w-3.5" /> Clientes
          </button>
          <button onClick={() => setVista('mapa')}
            className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold transition-all ${
              vista === 'mapa' ? 'bg-orange-500 text-white' : 'bg-dark-surface text-gray-400 border border-white/10'
            }`}>
            <Map className="h-3.5 w-3.5" /> Mapa
          </button>
        </div>
      )}

      {/* Contenido */}
      <div className={`flex-1 ${vista !== 'mapa' ? 'overflow-y-auto px-4 pb-20' : 'overflow-hidden'}`}>

        {/* Pantalla inicial sin ruta */}
        {!filtroRuta && (
          <div className="flex flex-col items-center justify-center py-24 text-center px-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-500/10 mb-4">
              <Map className="h-8 w-8 text-orange-400" />
            </div>
            <p className="text-white font-semibold mb-1">¿Qué ruta vas a entregar?</p>
            <p className="text-xs text-gray-500 mt-1">
              Selecciona la ruta arriba para ver los clientes y navegar hasta ellos
            </p>
          </div>
        )}

        {/* Lista clientes */}
        {filtroRuta && vista === 'clientes' && (
          loadingClientes ? <Spinner /> :
          !dataClientes?.por_asesor?.length ? (
            <Empty
              icon={<Users className="h-12 w-12 text-gray-600" />}
              texto={`Sin clientes en ruta ${filtroRuta}`}
              sub="Intenta con otra ruta"
            />
          ) : (
            <ListaClientes porAsesor={dataClientes.por_asesor} filtroRutaActivo={filtroRuta} />
          )
        )}

        {/* Mapa */}
        {filtroRuta && vista === 'mapa' && (
          loadingClientes ? <Spinner /> :
          <MapaEntregador clientes={clientesMapa} ruta={filtroRuta} />
        )}
      </div>
    </div>
  )
}

// ============================================================================
// LISTA DE CLIENTES
// ============================================================================
function ListaClientes({ porAsesor, filtroRutaActivo }: { porAsesor: any[]; filtroRutaActivo: string }) {
  const [expandidoAsesor, setExpandidoAsesor] = useState<string | null>(null)
  const [expandidoRuta,   setExpandidoRuta]   = useState<string | null>(null)
  const [buscar, setBuscar]                   = useState("")

  useEffect(() => {
    if (filtroRutaActivo && porAsesor.length > 0) {
      setExpandidoAsesor(porAsesor[0].asesor)
      setExpandidoRuta(`${porAsesor[0].asesor}-${filtroRutaActivo}`)
    }
  }, [filtroRutaActivo, porAsesor])

  const filtrados = buscar.trim().length >= 2
    ? porAsesor.map((a: any) => ({
        ...a,
        rutas: a.rutas.map((r: any) => ({
          ...r,
          clientes: r.clientes.filter((c: any) =>
            c.nombre.toLowerCase().includes(buscar.toLowerCase()) ||
            c.direccion?.toLowerCase().includes(buscar.toLowerCase())
          )
        })).filter((r: any) => r.clientes.length > 0)
      })).filter((a: any) => a.rutas.length > 0)
    : porAsesor

  return (
    <div className="space-y-3 pt-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
        <input type="text" value={buscar} onChange={e => setBuscar(e.target.value)}
          placeholder="Buscar cliente o dirección..."
          className="w-full rounded-xl border border-white/10 bg-dark-surface pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-orange-500 focus:outline-none" />
        {buscar && (
          <button onClick={() => setBuscar("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {filtrados.map((grupo: any) => (
        <div key={grupo.asesor} className="rounded-xl bg-dark-surface border border-white/10 overflow-hidden">
          <button onClick={() => setExpandidoAsesor(expandidoAsesor === grupo.asesor ? null : grupo.asesor)}
            className="flex w-full items-center gap-3 p-4 text-left">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-accent/20 text-xs font-bold text-navy-accent">
              {getInitials(grupo.asesor)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">{grupo.asesor}</p>
              <p className="text-xs text-gray-500">
                {grupo.total} clientes
                {grupo.con_pedido > 0 && ` · ${grupo.con_pedido} con pedido`}
              </p>
            </div>
            {expandidoAsesor === grupo.asesor
              ? <ChevronUp className="h-4 w-4 text-gray-500 shrink-0" />
              : <ChevronDown className="h-4 w-4 text-gray-500 shrink-0" />}
          </button>

          {expandidoAsesor === grupo.asesor && (
            <div className="border-t border-white/10">
              {grupo.rutas.map((r: any) => (
                <div key={r.ruta} className="border-b border-white/5 last:border-0">
                  <button
                    onClick={() => setExpandidoRuta(
                      expandidoRuta === `${grupo.asesor}-${r.ruta}` ? null : `${grupo.asesor}-${r.ruta}`
                    )}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left bg-dark-bg/50">
                    <span className="shrink-0 rounded bg-orange-500/20 px-2 py-0.5 text-[10px] font-bold font-mono text-orange-400">
                      Ruta {r.ruta}
                    </span>
                    <span className="flex-1 text-xs text-gray-400">{r.total} clientes</span>
                    {expandidoRuta === `${grupo.asesor}-${r.ruta}`
                      ? <ChevronUp className="h-3.5 w-3.5 text-gray-600" />
                      : <ChevronDown className="h-3.5 w-3.5 text-gray-600" />}
                  </button>

                  {expandidoRuta === `${grupo.asesor}-${r.ruta}` && (
                    <div className="divide-y divide-white/5">
                      {r.clientes.map((c: any) => (
                        <div key={c.id} className="px-4 py-3 space-y-2">
                          <div className="flex items-start gap-2">
                            <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                              c.hubo_pedido ? 'bg-success' : c.visitado ? 'bg-navy-accent' : 'bg-gray-600'
                            }`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white truncate">{c.nombre}</p>
                              <p className="text-xs text-gray-500 truncate">{c.direccion || 'Sin dirección'}</p>
                              {c.hubo_pedido && (
                                <p className="text-xs text-success font-semibold mt-0.5">{c.valor_formato}</p>
                              )}
                            </div>
                          </div>
                          {c.lat && c.lng ? (
                            <div className="grid grid-cols-2 gap-2">
                              <button onClick={() => abrirGoogleMaps(c.lat, c.lng)}
                                className="flex items-center justify-center gap-1.5 rounded-lg bg-[#4285F4]/15 border border-[#4285F4]/30 py-1.5 text-xs font-semibold text-[#4285F4] active:scale-95">
                                <Navigation className="h-3 w-3" /> Maps
                              </button>
                              <button onClick={() => abrirWaze(c.lat, c.lng)}
                                className="flex items-center justify-center gap-1.5 rounded-lg bg-[#33CCFF]/10 border border-[#33CCFF]/30 py-1.5 text-xs font-semibold text-[#33CCFF] active:scale-95">
                                <Navigation className="h-3 w-3" /> Waze
                              </button>
                            </div>
                          ) : (
                            <p className="text-[10px] text-gray-600 text-center">Sin coordenadas GPS</p>
                          )}
                          {c.telefono && (
                            <a href={`tel:${c.telefono}`}
                              className="flex items-center justify-center gap-1.5 rounded-lg bg-success/10 border border-success/20 py-1.5 text-xs font-semibold text-success w-full">
                              <Phone className="h-3 w-3" /> {c.telefono}
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ============================================================================
// MAPA — solo se monta con ruta seleccionada
// ============================================================================
function MapaEntregador({ clientes, ruta }: { clientes: any[]; ruta: string }) {
  const mapRef        = useRef<HTMLDivElement>(null)
  const leafletRef    = useRef<any>(null)
  const markersRef    = useRef<any[]>([])
  const userMarkerRef = useRef<any>(null)

  const [mapReady,     setMapReady]     = useState(false)
  const [mapError,     setMapError]     = useState("")
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [clienteSel,   setClienteSel]   = useState<any>(null)
  const [query,        setQuery]        = useState("")
  const [showResults,  setShowResults]  = useState(false)

  const resultados = query.trim().length >= 2
    ? clientes.filter(c =>
        c.nombre.toLowerCase().includes(query.toLowerCase()) ||
        c.direccion?.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 6)
    : []

  useEffect(() => {
    if (typeof window === "undefined" || leafletRef.current) return
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'; link.rel = 'stylesheet'
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'
      document.head.appendChild(link)
    }
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'
    script.onload  = () => { leafletRef.current = (window as any).L; setMapReady(true) }
    script.onerror = () => setMapError("Error cargando el mapa.")
    document.head.appendChild(script)
  }, [])

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

  useEffect(() => {
    if (!mapReady || !userLocation) return
    const map = (mapRef.current as any)?._mapInstance
    const L   = leafletRef.current
    if (!map || !L) return
    const icon = L.divIcon({
      className: '',
      html: `<div style="position:relative;width:20px;height:20px">
        <div style="position:absolute;inset:0;border-radius:50%;background:rgba(249,115,22,0.3);animation:ping 1.5s infinite"></div>
        <div style="position:absolute;inset:3px;border-radius:50%;background:#f97316;border:2px solid white;box-shadow:0 0 8px rgba(249,115,22,0.8)"></div>
      </div>
      <style>@keyframes ping{0%,100%{transform:scale(1);opacity:0.7}50%{transform:scale(1.8);opacity:0}}</style>`,
      iconSize: [20, 20], iconAnchor: [10, 10],
    })
    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([userLocation.lat, userLocation.lng])
    } else {
      userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], { icon })
        .addTo(map).bindPopup('<b>📦 Tu ubicación</b>')
      map.setView([userLocation.lat, userLocation.lng], 14)
    }
  }, [mapReady, userLocation])

  useEffect(() => {
    if (!mapReady) return
    const map = (mapRef.current as any)?._mapInstance
    const L   = leafletRef.current
    if (!map || !L) return

    markersRef.current.forEach(m => map.removeLayer(m))
    markersRef.current = []
    if (!clientes.length) return

    clientes.filter(c => c.lat && c.lng).forEach((c: any) => {
      let bgColor = '#4B5563'
      if (c.hubo_pedido)   bgColor = '#1A7A4A'
      else if (c.visitado) bgColor = '#D97706'

      const icon = L.divIcon({
        className: '',
        html: `<div style="background:${bgColor};border:2px solid white;border-radius:50% 50% 50% 0;
            width:32px;height:32px;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,0.4);
            display:flex;align-items:center;justify-content:center;">
            <span style="transform:rotate(45deg);font-size:10px;font-weight:700;color:#fff;
              font-family:sans-serif;line-height:1;letter-spacing:-0.5px;">
              ${getInitials(c.nombre)}
            </span>
          </div>`,
        iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32],
      })
      const marker = L.marker([c.lat, c.lng], { icon }).addTo(map)
      marker.on('click', () => { setClienteSel(c); setQuery(""); setShowResults(false) })
      markersRef.current.push(marker)
    })

    if (markersRef.current.length > 0 && !userLocation) {
      const group = L.featureGroup(markersRef.current)
      map.fitBounds(group.getBounds().pad(0.15))
    }
  }, [mapReady, clientes])

  const volarA = (c: any) => {
    const map = (mapRef.current as any)?._mapInstance
    if (map && c.lat && c.lng) map.setView([c.lat, c.lng], 17)
    setClienteSel(c); setQuery(""); setShowResults(false)
  }

  const conPedido = clientes.filter(c => c.hubo_pedido).length
  const sinGPS    = clientes.filter(c => !c.lat || !c.lng).length

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 280px)' }}>

      {/* Buscador */}
      <div className="relative px-3 py-2 border-b border-white/10 bg-dark-surface z-[1001]">
        <div className="flex items-center gap-2 rounded-xl bg-dark-bg border border-white/10 px-3 py-2">
          <Search className="h-4 w-4 text-gray-500 shrink-0" />
          <input type="text" value={query}
            onChange={e => { setQuery(e.target.value); setShowResults(true) }}
            onFocus={() => setShowResults(true)}
            placeholder={`Buscar en ruta ${ruta}...`}
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none" />
          {query && (
            <button onClick={() => { setQuery(""); setShowResults(false) }}>
              <X className="h-4 w-4 text-gray-500" />
            </button>
          )}
        </div>
        {showResults && resultados.length > 0 && (
          <div className="absolute left-3 right-3 top-full mt-1 rounded-xl border border-white/10 bg-dark-bg shadow-2xl overflow-hidden z-[1002]">
            {resultados.map((c: any) => (
              <button key={c.id} onClick={() => volarA(c)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/5 border-b border-white/5 last:border-0">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                  c.hubo_pedido ? 'bg-success/20' : c.visitado ? 'bg-warning/20' : 'bg-gray-500/20'
                }`}>
                  {c.hubo_pedido ? <Check className="h-4 w-4 text-success" /> :
                   c.visitado    ? <AlertTriangle className="h-4 w-4 text-warning" /> :
                                   <MapPin className="h-4 w-4 text-gray-400" />}
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
          <div className="absolute left-3 right-3 top-full mt-1 rounded-xl border border-white/10 bg-dark-bg px-4 py-3 shadow-2xl z-[1002]">
            <p className="text-sm text-gray-400">No se encontró "{query}"</p>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 border-b border-white/10 bg-dark-surface px-4 py-1.5">
        <span className="text-[11px] text-gray-400">{clientes.length} clientes · Ruta {ruta}</span>
        {conPedido > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-success" />
            <span className="text-[11px] text-gray-400">{conPedido} con pedido</span>
          </div>
        )}
        {sinGPS > 0 && (
          <div className="ml-auto flex items-center gap-1">
            <MapPin className="h-3 w-3 text-warning" />
            <span className="text-[10px] text-warning">{sinGPS} sin GPS</span>
          </div>
        )}
      </div>

      {/* Mapa */}
      <div className="relative flex-1">
        {!mapReady && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-dark-bg gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-orange-400" />
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

      {/* Tarjeta cliente seleccionado */}
      {clienteSel && (
        <div className="absolute bottom-0 left-0 right-0 z-[1000] rounded-t-2xl border-t border-white/10 bg-dark-surface/97 backdrop-blur-md shadow-2xl overflow-hidden">
          <div className="flex items-start gap-3 p-4">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              clienteSel.hubo_pedido ? 'bg-success/20' : clienteSel.visitado ? 'bg-warning/20' : 'bg-gray-500/20'
            }`}>
              {clienteSel.hubo_pedido ? <Check className="h-5 w-5 text-success" /> :
               clienteSel.visitado    ? <AlertTriangle className="h-5 w-5 text-warning" /> :
                                        <MapPin className="h-5 w-5 text-gray-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{clienteSel.nombre}</p>
              <p className="text-xs text-gray-400 truncate">{clienteSel.direccion}</p>
              {clienteSel.hubo_pedido && (
                <p className="text-xs text-success font-semibold mt-0.5">{clienteSel.valor_formato}</p>
              )}
            </div>
            <button onClick={() => setClienteSel(null)} className="shrink-0 p-1 text-gray-500 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          {clienteSel.lat && clienteSel.lng ? (
            <div className="grid grid-cols-2 gap-0 border-t border-white/10">
              <button onClick={() => abrirGoogleMaps(clienteSel.lat, clienteSel.lng)}
                className="flex items-center justify-center gap-2 py-3.5 text-sm font-semibold text-white bg-[#4285F4]/20 hover:bg-[#4285F4]/30 border-r border-white/10">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                </svg>
                Google Maps
              </button>
              <button onClick={() => abrirWaze(clienteSel.lat, clienteSel.lng)}
                className="flex items-center justify-center gap-2 py-3.5 text-sm font-semibold text-white bg-[#33CCFF]/10 hover:bg-[#33CCFF]/20">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#33CCFF">
                  <path d="M12 1.5C6.2 1.5 1.5 6.2 1.5 12S6.2 22.5 12 22.5 22.5 17.8 22.5 12 17.8 1.5 12 1.5zm0 4c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm4 9.5c-.8 1.5-2.3 2.5-4 2.5s-3.2-1-4-2.5h8z"/>
                </svg>
                Waze
              </button>
            </div>
          ) : (
            <div className="border-t border-white/10 px-4 py-3 text-center">
              <p className="text-xs text-warning">⚠️ Sin coordenadas GPS registradas</p>
            </div>
          )}
          {clienteSel.telefono && (
            <a href={`tel:${clienteSel.telefono}`}
              className="flex items-center justify-center gap-2 py-3 text-sm font-semibold text-success bg-success/10 border-t border-white/10">
              <Phone className="h-4 w-4" /> {clienteSel.telefono}
            </a>
          )}
        </div>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-8 w-8 animate-spin text-orange-400" />
    </div>
  )
}
function Empty({ icon, texto, sub }: { icon: React.ReactNode; texto: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon}
      <p className="text-gray-400 font-medium mt-3">{texto}</p>
      <p className="text-xs text-gray-600 mt-1">{sub}</p>
    </div>
  )
}
