"use client"

// ============================================================================
// components/entregador/entregador-layout.tsx
// Vista del entregador — mapa + lista de pedidos del día
// ============================================================================

import { useState, useEffect, useRef } from "react"
import useSWR from "swr"
import {
  MapPin, Package, DollarSign, ChevronDown, ChevronUp,
  Loader2, AlertTriangle, Navigation, Phone, X,
  LogOut, RefreshCw, Map, List, Users, Search
} from "lucide-react"

const fetcher = (url: string) => fetch(url).then(r => r.json())

function fechaColombia() {
  return new Date().toLocaleString('en-CA', { timeZone: 'America/Bogota' }).split(',')[0]
}

function getInitials(nombre: string) {
  return nombre.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
}

function abrirGoogleMaps(lat: number, lng: number, nombre: string) {
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`, '_blank')
}

function abrirWaze(lat: number, lng: number) {
  window.open(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`, '_blank')
}

interface EntregadorSession {
  id: string
  nombre: string
  email: string
  rol: string
}

interface EntregadorLayoutProps {
  entregador: EntregadorSession
  onLogout: () => void
}

export function EntregadorLayout({ entregador, onLogout }: EntregadorLayoutProps) {
  const [vista, setVista] = useState<'pedidos' | 'clientes' | 'mapa'>('pedidos')
  const [expandido, setExpandido] = useState<string | null>(null)
  const [pedidoSel, setPedidoSel] = useState<any>(null)
  const fecha = fechaColombia()

  const { data, isLoading, mutate } = useSWR(
    `/api/entregador/pedidos-dia?fecha=${fecha}`,
    fetcher,
    { refreshInterval: 60000 }
  )

  const { data: dataClientes, isLoading: loadingClientes } = useSWR(
    `/api/entregador/clientes?fecha=${fecha}`,
    fetcher,
    { refreshInterval: 60000 }
  )

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
          <button
            onClick={() => mutate()}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-dark-bg text-gray-400 hover:text-white transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={onLogout}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-dark-bg text-gray-400 hover:text-danger transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* KPIs */}
      {data && (
        <div className="grid grid-cols-2 gap-3 px-4 pt-4">
          <div className="rounded-xl bg-orange-500/10 border border-orange-500/20 p-3">
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-4 w-4 text-orange-400" />
              <span className="text-xs text-gray-400">Pedidos hoy</span>
            </div>
            <p className="text-2xl font-bold text-white">{data.total_pedidos}</p>
          </div>
          <div className="rounded-xl bg-success/10 border border-success/20 p-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-success" />
              <span className="text-xs text-gray-400">Total</span>
            </div>
            <p className="text-lg font-bold text-success">{data.total_formato}</p>
          </div>
        </div>
      )}

      {/* Toggle vista */}
      <div className="flex gap-2 px-4 pt-3">
        <button
          onClick={() => setVista('pedidos')}
          className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold transition-all ${
            vista === 'pedidos' ? 'bg-orange-500 text-white' : 'bg-dark-surface text-gray-400 border border-white/10'
          }`}
        >
          <Package className="h-3.5 w-3.5" /> Pedidos
        </button>
        <button
          onClick={() => setVista('clientes')}
          className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold transition-all ${
            vista === 'clientes' ? 'bg-orange-500 text-white' : 'bg-dark-surface text-gray-400 border border-white/10'
          }`}
        >
          <Users className="h-3.5 w-3.5" /> Clientes
        </button>
        <button
          onClick={() => setVista('mapa')}
          className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold transition-all ${
            vista === 'mapa' ? 'bg-orange-500 text-white' : 'bg-dark-surface text-gray-400 border border-white/10'
          }`}
        >
          <Map className="h-3.5 w-3.5" /> Mapa
        </button>
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto px-4 py-3 pb-20">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-orange-400" />
          </div>
        ) : !data?.por_asesor?.length ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Package className="h-12 w-12 text-gray-600 mb-3" />
            <p className="text-gray-400 font-medium">Sin pedidos hoy</p>
            <p className="text-xs text-gray-600 mt-1">Los pedidos aparecen cuando los asesores los registran</p>
          </div>
        ) : vista === 'pedidos' ? (
          <ListaPedidos
            porAsesor={data.por_asesor}
            expandido={expandido}
            setExpandido={setExpandido}
          />
        ) : vista === 'clientes' ? (
          <ListaClientes
            porAsesor={dataClientes?.por_asesor ?? []}
            isLoading={loadingClientes}
          />
        ) : (
          <MapaEntregador
            porAsesor={dataClientes?.por_asesor ?? []}
            pedidoSel={pedidoSel}
            setPedidoSel={setPedidoSel}
          />
        )}
      </div>
    </div>
  )
}

// ── Lista de pedidos por asesor ──────────────────────────────────────────────
function ListaPedidos({ porAsesor, expandido, setExpandido }: any) {
  return (
    <div className="space-y-3">
      {porAsesor.map((grupo: any) => (
        <div key={grupo.asesor} className="rounded-xl bg-dark-surface border border-white/10 overflow-hidden">

          {/* Cabecera asesor */}
          <button
            onClick={() => setExpandido(expandido === grupo.asesor ? null : grupo.asesor)}
            className="flex w-full items-center gap-3 p-4 text-left"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-accent/20 text-xs font-bold text-navy-accent">
              {getInitials(grupo.asesor)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">{grupo.asesor}</p>
              <p className="text-xs text-gray-500">{grupo.pedidos.length} pedidos</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-bold text-success">
                ${grupo.pedidos.reduce((s: number, p: any) => s + p.valor_pedido, 0).toLocaleString('es-CO')}
              </p>
            </div>
            {expandido === grupo.asesor
              ? <ChevronUp className="h-4 w-4 text-gray-500 shrink-0" />
              : <ChevronDown className="h-4 w-4 text-gray-500 shrink-0" />
            }
          </button>

          {/* Lista de clientes */}
          {expandido === grupo.asesor && (
            <div className="border-t border-white/10 divide-y divide-white/5">
              {grupo.pedidos.map((p: any) => (
                <div key={p.visita_id} className="p-4 space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{p.cliente_nombre}</p>
                      <p className="text-xs text-gray-500 truncate">{p.direccion || 'Sin dirección'}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold text-success">{p.valor_formato}</p>
                      <p className="text-[10px] text-gray-600">{p.hora}</p>
                    </div>
                  </div>
                  {p.notas && (
                    <p className="text-xs text-gray-400 italic">"{p.notas}"</p>
                  )}
                  {/* Botones navegación */}
                  {p.lat && p.lng ? (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => abrirGoogleMaps(p.lat, p.lng, p.cliente_nombre)}
                        className="flex items-center justify-center gap-1.5 rounded-lg bg-[#4285F4]/15 border border-[#4285F4]/30 py-2 text-xs font-semibold text-[#4285F4] transition-all active:scale-95"
                      >
                        <Navigation className="h-3.5 w-3.5" /> Maps
                      </button>
                      <button
                        onClick={() => abrirWaze(p.lat, p.lng)}
                        className="flex items-center justify-center gap-1.5 rounded-lg bg-[#33CCFF]/10 border border-[#33CCFF]/30 py-2 text-xs font-semibold text-[#33CCFF] transition-all active:scale-95"
                      >
                        <Navigation className="h-3.5 w-3.5" /> Waze
                      </button>
                    </div>
                  ) : (
                    <p className="text-[10px] text-warning text-center">⚠️ Sin coordenadas GPS</p>
                  )}
                  {p.telefono && (
                    <a
                      href={`tel:${p.telefono}`}
                      className="flex items-center justify-center gap-1.5 rounded-lg bg-success/10 border border-success/20 py-2 text-xs font-semibold text-success w-full"
                    >
                      <Phone className="h-3.5 w-3.5" /> {p.telefono}
                    </a>
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


// ── Lista de todos los clientes por asesor y ruta ───────────────────────────
function ListaClientes({ porAsesor, isLoading }: any) {
  const [expandidoAsesor, setExpandidoAsesor] = useState<string | null>(null)
  const [expandidoRuta, setExpandidoRuta]     = useState<string | null>(null)
  const [buscar, setBuscar]                   = useState("")

  if (isLoading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-8 w-8 animate-spin text-orange-400" />
    </div>
  )

  if (!porAsesor?.length) return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Users className="h-12 w-12 text-gray-600 mb-3" />
      <p className="text-gray-400">Sin clientes disponibles</p>
    </div>
  )

  // Filtro de búsqueda
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
    <div className="space-y-3">
      {/* Buscador */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
        <input
          type="text"
          value={buscar}
          onChange={e => setBuscar(e.target.value)}
          placeholder="Buscar cliente o dirección..."
          className="w-full rounded-xl border border-white/10 bg-dark-surface pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-orange-500 focus:outline-none"
        />
        {buscar && (
          <button onClick={() => setBuscar("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {filtrados.map((grupo: any) => (
        <div key={grupo.asesor} className="rounded-xl bg-dark-surface border border-white/10 overflow-hidden">
          {/* Cabecera asesor */}
          <button
            onClick={() => setExpandidoAsesor(expandidoAsesor === grupo.asesor ? null : grupo.asesor)}
            className="flex w-full items-center gap-3 p-4 text-left"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-accent/20 text-xs font-bold text-navy-accent">
              {getInitials(grupo.asesor)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">{grupo.asesor}</p>
              <p className="text-xs text-gray-500">
                {grupo.total} clientes · {grupo.rutas.length} rutas
                {grupo.visitados > 0 && ` · ${grupo.visitados} visitados hoy`}
              </p>
            </div>
            {expandidoAsesor === grupo.asesor
              ? <ChevronUp className="h-4 w-4 text-gray-500 shrink-0" />
              : <ChevronDown className="h-4 w-4 text-gray-500 shrink-0" />
            }
          </button>

          {/* Rutas del asesor */}
          {expandidoAsesor === grupo.asesor && (
            <div className="border-t border-white/10">
              {grupo.rutas.map((r: any) => (
                <div key={r.ruta} className="border-b border-white/5 last:border-0">
                  {/* Cabecera ruta */}
                  <button
                    onClick={() => setExpandidoRuta(expandidoRuta === `${grupo.asesor}-${r.ruta}` ? null : `${grupo.asesor}-${r.ruta}`)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left bg-dark-bg/50"
                  >
                    <span className="shrink-0 rounded bg-orange-500/20 px-2 py-0.5 text-[10px] font-bold font-mono text-orange-400">
                      Ruta {r.ruta}
                    </span>
                    <span className="flex-1 text-xs text-gray-400">{r.total} clientes</span>
                    {expandidoRuta === `${grupo.asesor}-${r.ruta}`
                      ? <ChevronUp className="h-3.5 w-3.5 text-gray-600" />
                      : <ChevronDown className="h-3.5 w-3.5 text-gray-600" />
                    }
                  </button>

                  {/* Clientes de la ruta */}
                  {expandidoRuta === `${grupo.asesor}-${r.ruta}` && (
                    <div className="divide-y divide-white/5">
                      {r.clientes.map((c: any) => (
                        <div key={c.id} className="px-4 py-3 space-y-2">
                          <div className="flex items-start gap-2">
                            <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                              c.hubo_pedido ? 'bg-success' :
                              c.visitado ? 'bg-navy-accent' : 'bg-gray-600'
                            }`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white truncate">{c.nombre}</p>
                              <p className="text-xs text-gray-500 truncate">{c.direccion || 'Sin dirección'}</p>
                              {c.hubo_pedido && (
                                <p className="text-xs text-success font-semibold">{c.valor_formato}</p>
                              )}
                            </div>
                          </div>
                          {c.lat && c.lng && (
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}&travelmode=driving`, '_blank')}
                                className="flex items-center justify-center gap-1.5 rounded-lg bg-[#4285F4]/15 border border-[#4285F4]/30 py-1.5 text-xs font-semibold text-[#4285F4]"
                              >
                                <Navigation className="h-3 w-3" /> Maps
                              </button>
                              <button
                                onClick={() => window.open(`https://waze.com/ul?ll=${c.lat},${c.lng}&navigate=yes`, '_blank')}
                                className="flex items-center justify-center gap-1.5 rounded-lg bg-[#33CCFF]/10 border border-[#33CCFF]/30 py-1.5 text-xs font-semibold text-[#33CCFF]"
                              >
                                <Navigation className="h-3 w-3" /> Waze
                              </button>
                            </div>
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

// ── Mapa entregador ──────────────────────────────────────────────────────────
function MapaEntregador({ porAsesor, pedidoSel, setPedidoSel }: any) {
  const mapRef     = useRef<HTMLDivElement>(null)
  const leafletRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const userMarkerRef = useRef<any>(null)
  const [mapReady, setMapReady] = useState(false)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)

  // Cargar Leaflet
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
    script.onload = () => { leafletRef.current = (window as any).L; setMapReady(true) }
    document.head.appendChild(script)
  }, [])

  // GPS del entregador
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

  // Inicializar mapa
  useEffect(() => {
    if (!mapReady || !mapRef.current || !leafletRef.current) return
    if ((mapRef.current as any)._leaflet_id) return
    const L = leafletRef.current
    const map = L.map(mapRef.current, { center: [7.119, -73.1227], zoom: 13 })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19
    }).addTo(map)
    ;(mapRef.current as any)._mapInstance = map
  }, [mapReady])

  // Pin del entregador
  useEffect(() => {
    if (!mapReady || !userLocation) return
    const map = (mapRef.current as any)?._mapInstance
    const L = leafletRef.current
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

  // Pins de pedidos
  useEffect(() => {
    if (!mapReady || !porAsesor?.length) return
    const map = (mapRef.current as any)?._mapInstance
    const L = leafletRef.current
    if (!map || !L) return

    markersRef.current.forEach(m => map.removeLayer(m))
    markersRef.current = []

    const colores = ['#f97316', '#3b82f6', '#8b5cf6', '#10b981', '#ef4444', '#f59e0b']

    porAsesor.forEach((grupo: any, gi: number) => {
      const color = colores[gi % colores.length]
      const todosClientes = grupo.rutas?.flatMap((r: any) => r.clientes) ?? grupo.pedidos ?? []
      todosClientes.forEach((p: any) => {
        if (!p.lat || !p.lng) return
        const nombre = p.cliente_nombre || p.nombre || ''
        const initials = getInitials(nombre)
        const icon = L.divIcon({
          className: '',
          html: `<div style="background:${color};border:2px solid white;border-radius:50% 50% 50% 0;width:32px;height:32px;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;">
            <span style="transform:rotate(45deg);font-size:9px;font-weight:700;color:white;font-family:sans-serif;">${initials}</span>
          </div>`,
          iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32],
        })
        const marker = L.marker([p.lat, p.lng], { icon }).addTo(map)
        marker.on('click', () => setPedidoSel({ ...p, cliente_nombre: p.cliente_nombre || p.nombre, asesor: grupo.asesor, color }))
        markersRef.current.push(marker)
      })
    })

    if (markersRef.current.length > 0 && !userLocation) {
      const group = L.featureGroup(markersRef.current)
      map.fitBounds(group.getBounds().pad(0.15))
    }
  }, [mapReady, porAsesor])

  return (
    <div className="relative" style={{ height: 'calc(100vh - 280px)' }}>
      {!mapReady && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-dark-bg rounded-xl">
          <Loader2 className="h-8 w-8 animate-spin text-orange-400" />
        </div>
      )}
      <div ref={mapRef} className="h-full w-full rounded-xl overflow-hidden" />

      {/* Tarjeta pedido seleccionado */}
      {pedidoSel && (
        <div className="absolute bottom-3 left-3 right-3 z-[1000] rounded-2xl border border-white/10 bg-dark-surface/97 backdrop-blur-md shadow-2xl overflow-hidden">
          <div className="flex items-start gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white text-xs font-bold"
              style={{ background: pedidoSel.color + '30', border: `1px solid ${pedidoSel.color}50` }}>
              <Package className="h-5 w-5" style={{ color: pedidoSel.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{pedidoSel.cliente_nombre}</p>
              <p className="text-xs text-gray-400 truncate">{pedidoSel.direccion}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-bold text-success">{pedidoSel.valor_formato}</span>
                <span className="text-[10px] text-gray-500">· {pedidoSel.asesor}</span>
              </div>
            </div>
            <button onClick={() => setPedidoSel(null)} className="text-gray-500 p-1">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-0 border-t border-white/10">
            <button
              onClick={() => abrirGoogleMaps(pedidoSel.lat, pedidoSel.lng, pedidoSel.cliente_nombre)}
              className="flex items-center justify-center gap-2 py-3 text-sm font-semibold text-white bg-[#4285F4]/20 hover:bg-[#4285F4]/30 border-r border-white/10"
            >
              <Navigation className="h-4 w-4" /> Google Maps
            </button>
            <button
              onClick={() => abrirWaze(pedidoSel.lat, pedidoSel.lng)}
              className="flex items-center justify-center gap-2 py-3 text-sm font-semibold text-[#33CCFF] bg-[#33CCFF]/10 hover:bg-[#33CCFF]/20"
            >
              <Navigation className="h-4 w-4" /> Waze
            </button>
          </div>
          {pedidoSel.telefono && (
            <a href={`tel:${pedidoSel.telefono}`}
              className="flex items-center justify-center gap-2 py-3 text-sm font-semibold text-success bg-success/10 border-t border-white/10">
              <Phone className="h-4 w-4" /> {pedidoSel.telefono}
            </a>
          )}
        </div>
      )}
    </div>
  )
}
