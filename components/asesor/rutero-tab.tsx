"use client"

// ============================================================================
// components/asesor/rutero-tab.tsx — OPTIMIZADOR DE RUTAS
// ============================================================================

import { useState, useEffect } from "react"
import useSWR from "swr"
import { Loader2, MapPin, Check, ChevronRight, Navigation, X, Plus, Minus, Route } from "lucide-react"
import { type AsesorSession } from "./login-asesor"

const fetcher = (url: string) => fetch(url).then(r => r.json())

function fechaColombia() {
  return new Date().toLocaleString('en-CA', { timeZone: 'America/Bogota' }).split(',')[0]
}
function getRuta(nombre: string) {
  if (!nombre) return '—'
  const match = nombre.match(/^([A-Z0-9]+)\s/)
  return match ? match[1] : '—'
}
function getNombreSinRuta(nombre: string) {
  if (!nombre) return ''
  const partes = nombre.split(' ')
  return partes.length > 1 ? partes.slice(1).join(' ') : nombre
}
function distanciaKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}
function optimizarRuta(origen: {lat: number; lng: number}, clientes: Cliente[]): Cliente[] {
  const pendientes = [...clientes]
  const ruta: Cliente[] = []
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

interface Cliente {
  id: string; nombre: string; direccion: string
  lat: number | null; lng: number | null
  visitado_en: string | null; validada: boolean | null
}
interface RuteroTabProps { asesor: AsesorSession }
type Vista = "armar" | "navegar"

export function RuteroTab({ asesor }: RuteroTabProps) {
  const fecha = fechaColombia()
  const { data, isLoading } = useSWR(
    `/api/clientes-del-dia?asesor_id=${asesor.id}&fecha=${fecha}`,
    fetcher, { revalidateOnFocus: false }
  )

  const clientes: Cliente[] = (data?.clientes ?? []).filter((c: Cliente) => c.lat && c.lng)
  const rutasUnicas = Array.from(new Set(clientes.map(c => getRuta(c.nombre))))
    .filter(r => r !== '—')
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

  const [seleccionados, setSeleccionados] = useState<Cliente[]>([])
  const [ruteroFinal, setRuteroFinal]     = useState<Cliente[]>([])
  const [parada, setParada]               = useState(0)
  const [vista, setVista]                 = useState<Vista>("armar")
  const [userLocation, setUserLocation]   = useState<{lat: number; lng: number} | null>(null)
  const [tabActivo, setTabActivo]         = useState<"rutas" | "clientes">("rutas")

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      p => setUserLocation({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {}, { enableHighAccuracy: true }
    )
  }, [])

  const toggleCliente = (c: Cliente) => {
    setSeleccionados(prev =>
      prev.some(s => s.id === c.id) ? prev.filter(s => s.id !== c.id) : [...prev, c]
    )
  }
  const agregarRuta = (ruta: string) => {
    const clientesRuta = clientes.filter(c => getRuta(c.nombre) === ruta && !seleccionados.some(s => s.id === c.id))
    setSeleccionados(prev => [...prev, ...clientesRuta])
  }
  const quitarRuta = (ruta: string) => {
    setSeleccionados(prev => prev.filter(c => getRuta(c.nombre) !== ruta))
  }
  const rutaSeleccionada = (ruta: string) => clientes.filter(c => getRuta(c.nombre) === ruta).every(c => seleccionados.some(s => s.id === c.id))
  const countRuta = (ruta: string) => seleccionados.filter(c => getRuta(c.nombre) === ruta).length
  const totalRuta = (ruta: string) => clientes.filter(c => getRuta(c.nombre) === ruta).length

  const iniciarRutero = () => {
    const origen = userLocation ?? { lat: 7.119, lng: -73.1227 }
    const optimizado = optimizarRuta(origen, seleccionados)
    setRuteroFinal(optimizado)
    setParada(0)
    setVista("navegar")
  }

  // ── VISTA NAVEGACIÓN ──────────────────────────────────────────────────────
  if (vista === "navegar") {
    const actual = ruteroFinal[parada]
    const totalDist = ruteroFinal.reduce((acc, c, i) => {
      if (!c.lat || !c.lng) return acc
      if (i === 0) {
        const o = userLocation ?? { lat: 7.119, lng: -73.1227 }
        return acc + distanciaKm(o.lat, o.lng, c.lat, c.lng)
      }
      const prev = ruteroFinal[i-1]
      return acc + (prev.lat && prev.lng ? distanciaKm(prev.lat, prev.lng, c.lat, c.lng) : 0)
    }, 0)

    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-dark-surface">
          <button onClick={() => setVista("armar")} className="flex h-9 w-9 items-center justify-center rounded-xl bg-dark-bg text-gray-400">
            <X className="h-4 w-4" />
          </button>
          <div className="flex-1">
            <p className="text-sm font-bold text-white">Rutero activo</p>
            <p className="text-xs text-gray-500">{ruteroFinal.length} paradas · {totalDist.toFixed(1)} km estimado</p>
          </div>
          <span className="rounded-full bg-navy-accent/20 px-3 py-1 text-xs font-bold text-navy-accent">
            {parada + 1} / {ruteroFinal.length}
          </span>
        </div>

        {/* Parada actual */}
        {actual && (
          <div className="p-4 border-b border-white/10 bg-dark-bg space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-navy-accent text-xs font-bold text-white shrink-0">{parada + 1}</div>
              <span className="text-xs font-semibold text-navy-accent uppercase tracking-wide">Próxima parada</span>
            </div>
            <div>
              <p className="text-base font-bold text-white">{getNombreSinRuta(actual.nombre)}</p>
              <p className="text-sm text-gray-400 mt-0.5">{actual.direccion || '—'}</p>
              <span className="inline-block mt-1 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold font-mono text-gray-300">{getRuta(actual.nombre)}</span>
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
                <button onClick={() => setParada(p => p - 1)}
                  className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm text-gray-300">← Anterior</button>
              )}
              {parada < ruteroFinal.length - 1 ? (
                <button onClick={() => setParada(p => p + 1)}
                  className="flex-1 rounded-xl bg-navy-accent py-2.5 text-sm font-bold text-white">Siguiente →</button>
              ) : (
                <button onClick={() => { setSeleccionados([]); setVista("armar") }}
                  className="flex-1 rounded-xl bg-success py-2.5 text-sm font-bold text-dark-bg">✓ Finalizar rutero</button>
              )}
            </div>
          </div>
        )}

        {/* Lista todas las paradas */}
        <div className="flex-1 overflow-y-auto">
          <p className="px-4 py-2 text-[10px] text-gray-500 uppercase tracking-widest">Todas las paradas</p>
          {ruteroFinal.map((c, i) => (
            <button key={c.id} onClick={() => setParada(i)}
              className={`flex w-full items-center gap-3 px-4 py-3 border-b border-white/5 text-left transition-colors ${i === parada ? 'bg-navy-accent/10' : 'hover:bg-white/5'}`}>
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                i < parada ? 'bg-success/20 text-success' :
                i === parada ? 'bg-navy-accent text-white' : 'bg-white/10 text-gray-400'
              }`}>
                {i < parada ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${i === parada ? 'text-white' : 'text-gray-300'}`}>{getNombreSinRuta(c.nombre)}</p>
                <p className="text-xs text-gray-500 truncate">{c.direccion || '—'}</p>
              </div>
              <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-mono text-gray-400">{getRuta(c.nombre)}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── VISTA ARMAR RUTERO ────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 bg-dark-surface">
        <p className="text-sm font-bold text-white">Armar rutero</p>
        <p className="text-xs text-gray-500 mt-0.5">{seleccionados.length} clientes seleccionados</p>
      </div>

      {/* Tabs rutas / clientes */}
      <div className="flex border-b border-white/10 bg-dark-surface">
        {(['rutas', 'clientes'] as const).map(t => (
          <button key={t} onClick={() => setTabActivo(t)}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors border-b-2 ${tabActivo === t ? 'border-navy-accent text-navy-accent' : 'border-transparent text-gray-500'}`}>
            {t === 'rutas' ? 'Por ruta' : 'Por cliente'}
          </button>
        ))}
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-navy-accent" /></div>
        ) : tabActivo === 'rutas' ? (
          <div className="p-3 space-y-2">
            {rutasUnicas.map(ruta => {
              const sel = rutaSeleccionada(ruta)
              const count = countRuta(ruta)
              const total = totalRuta(ruta)
              return (
                <div key={ruta} className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-all ${sel ? 'border-navy-accent/40 bg-navy-accent/10' : 'border-white/10 bg-dark-surface'}`}>
                  <span className="shrink-0 rounded bg-white/10 px-2 py-1 text-xs font-bold font-mono text-gray-300 w-14 text-center">{ruta}</span>
                  <div className="flex-1">
                    <p className="text-sm text-white">Ruta {ruta}</p>
                    <p className="text-xs text-gray-500">{total} clientes con GPS {count > 0 && <span className="text-navy-accent">· {count} seleccionados</span>}</p>
                  </div>
                  <button onClick={() => sel ? quitarRuta(ruta) : agregarRuta(ruta)}
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${sel ? 'bg-navy-accent text-white' : 'bg-white/10 text-gray-400 hover:bg-white/20'}`}>
                    {sel ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  </button>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {clientes.map(c => {
              const sel = seleccionados.some(s => s.id === c.id)
              return (
                <button key={c.id} onClick={() => toggleCliente(c)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${sel ? 'bg-navy-accent/10' : 'hover:bg-white/5'}`}>
                  <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${sel ? 'border-navy-accent bg-navy-accent' : 'border-gray-600'}`}>
                    {sel && <Check className="h-3.5 w-3.5 text-white" />}
                  </div>
                  <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold font-mono text-gray-300">{getRuta(c.nombre)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{getNombreSinRuta(c.nombre)}</p>
                    <p className="text-xs text-gray-500 truncate">{c.direccion || '—'}</p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Botón iniciar */}
      {seleccionados.length >= 2 && (
        <div className="p-4 border-t border-white/10 bg-dark-surface">
          <button onClick={iniciarRutero}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-navy-accent py-3.5 text-sm font-bold text-white active:scale-[0.97] transition-all">
            <Route className="h-4 w-4" />
            Optimizar y comenzar ({seleccionados.length} paradas)
          </button>
        </div>
      )}
    </div>
  )
}
