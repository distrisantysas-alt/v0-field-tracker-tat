"use client"

// ============================================================================
// components/gerencia/gerencia-layout.tsx — COMPLETO CON ADMIN INTEGRADO
// Pestañas: Dashboard · Equipo · Zonas · Asesores (admin) · Importar · Compartir
// ============================================================================

import { useState, useEffect } from "react"
import useSWR from "swr"
import {
  BarChart2, Users, Map, Settings, Upload,
  ChevronLeft, ChevronRight, Loader2, AlertTriangle,
  Check, TrendingUp, DollarSign, Search, X,
  UserPlus, RefreshCw, Edit2, UserX, ArrowRight,
  MapPin, CheckCircle, AlertCircle, FileUp, Share2
} from "lucide-react"

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

type Tab = "dashboard" | "equipo" | "zonas" | "asesores" | "importar" | "compartir"

interface GerenciaLayoutProps { onBack: () => void }

// ============================================================================
export function GerenciaLayout({ onBack }: GerenciaLayoutProps) {
  const [tab, setTab] = useState<Tab>("dashboard")
  const fecha = fechaColombia()

  const tabs = [
    { id: "dashboard" as Tab, label: "Dashboard",  icon: BarChart2  },
    { id: "equipo"    as Tab, label: "Equipo",      icon: Users      },
    { id: "zonas"     as Tab, label: "Zonas",       icon: Map        },
    { id: "asesores"  as Tab, label: "Asesores",    icon: Settings   },
    { id: "importar"  as Tab, label: "Importar",    icon: Upload     },
    { id: "compartir" as Tab, label: "Compartir",   icon: Share2     },
  ]

  return (
    <div className="flex min-h-screen flex-col bg-dark-bg">

      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <button onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-xl bg-dark-surface text-gray-400 hover:text-white">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <p className="text-xs text-gray-500">Panel de</p>
          <h1 className="text-base font-bold text-white">Dirección General</h1>
        </div>
        <div className="ml-auto text-xs font-mono text-gray-500">{fecha}</div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto border-b border-white/10 bg-dark-surface">
        {tabs.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex shrink-0 items-center gap-1.5 px-4 py-3 text-xs font-medium transition-colors border-b-2 ${
                tab === t.id
                  ? "border-navy-accent text-navy-accent"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto">
        {tab === "dashboard" && <TabDashboard fecha={fecha} />}
        {tab === "equipo"    && <TabEquipo    fecha={fecha} />}
        {tab === "zonas"     && <TabZonas     fecha={fecha} />}
        {tab === "asesores"  && <TabAsesores  />}
        {tab === "importar"  && <TabImportar  />}
        {tab === "compartir" && <TabCompartir />}
      </div>
    </div>
  )
}

// ============================================================================
// TAB: DASHBOARD
// ============================================================================
function TabDashboard({ fecha }: { fecha: string }) {
  const { data, isLoading } = useSWR(`/api/dashboard?fecha=${fecha}`, fetcher, { refreshInterval: 60000 })

  if (isLoading) return <LoadingSpinner />
  if (!data?.totales) return <ErrorMsg />

  const { totales, equipo, alertas, por_zona } = data
  const top3 = [...(equipo || [])].sort((a: any, b: any) => b.visitas_hoy - a.visitas_hoy).slice(0, 3)
  const bottom3 = [...(por_zona || [])].sort((a: any, b: any) => a.cumplimiento - b.cumplimiento).slice(0, 3)

  return (
    <div className="p-4 space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard label="Visitas Hoy"       value={totales.visitas}          sub={`${totales.validadas} validadas`}      color="text-navy-accent" />
        <KpiCard label="Cumplimiento"      value={`${totales.cumplimiento}%`} sub={`${totales.clientes_asignados} asignados`} color={totales.cumplimiento >= 80 ? "text-success" : totales.cumplimiento >= 60 ? "text-warning" : "text-danger"} />
        <KpiCard label="Asesores Activos"  value={totales.asesores_activos} sub={`de ${totales.asesores} en total`}    color="text-white" />
        <KpiCard label="Alertas GPS"       value={totales.sospechosas}      sub="visitas sospechosas"                   color={totales.sospechosas > 0 ? "text-warning" : "text-success"} />
      </div>

      {/* Ventas */}
      <div className="rounded-xl bg-dark-surface border border-white/10 p-4">
        <div className="flex items-center gap-2 mb-3">
          <DollarSign className="h-4 w-4 text-success" />
          <span className="text-sm font-semibold text-white">Ventas del día</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center">
            <p className="text-xs text-gray-500">Total vendido</p>
            <p className="text-xl font-bold text-success">{totales.vendido_formato}</p>
          </div>
          <div className="text-center border-l border-white/10">
            <p className="text-xs text-gray-500">Pedidos</p>
            <p className="text-xl font-bold text-white">{totales.pedidos}</p>
          </div>
        </div>
      </div>

      {/* Top 3 */}
      <div className="rounded-xl bg-dark-surface border border-white/10 p-4">
        <p className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-navy-accent" /> Top asesores hoy
        </p>
        <div className="space-y-2">
          {top3.map((a: any, i: number) => (
            <div key={a.id} className="flex items-center gap-3">
              <span className={`w-5 text-xs font-bold ${i === 0 ? 'text-yellow-400' : 'text-gray-500'}`}>{i + 1}°</span>
              <span className="flex-1 text-sm text-white truncate">{a.nombre}</span>
              <span className="text-xs font-mono text-gray-400">{a.visitas_hoy}/{a.clientes_asignados}</span>
              <span className={`text-xs font-bold ${a.cumplimiento >= 80 ? 'text-success' : a.cumplimiento >= 60 ? 'text-warning' : 'text-danger'}`}>
                {a.cumplimiento}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Zonas con menor cumplimiento */}
      {bottom3.length > 0 && (
        <div className="rounded-xl bg-dark-surface border border-white/10 p-4">
          <p className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" /> Zonas con menor cumplimiento
          </p>
          <div className="space-y-2">
            {bottom3.map((z: any) => (
              <div key={z.zona} className="flex items-center gap-3">
                <span className="flex-1 text-sm text-white truncate">{z.zona}</span>
                <div className="w-20 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className={`h-full rounded-full ${z.cumplimiento >= 80 ? 'bg-success' : z.cumplimiento >= 60 ? 'bg-warning' : 'bg-danger'}`}
                    style={{ width: `${z.cumplimiento}%` }} />
                </div>
                <span className="text-xs font-bold text-warning w-8 text-right">{z.cumplimiento}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alertas recientes */}
      {alertas?.length > 0 && (
        <div className="rounded-xl bg-dark-surface border border-warning/20 p-4">
          <p className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" /> Alertas recientes
          </p>
          <div className="space-y-2">
            {alertas.slice(0, 5).map((al: any) => (
              <div key={al.id} className="rounded-lg bg-warning/5 border border-warning/10 p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-white">{al.asesor}</span>
                  <span className="text-xs text-gray-500">{al.hora}</span>
                </div>
                <p className="text-xs text-gray-400">{al.cliente} · {al.distancia_metros}m del punto</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// TAB: EQUIPO
// ============================================================================
function TabEquipo({ fecha }: { fecha: string }) {
  const { data, isLoading } = useSWR(`/api/dashboard?fecha=${fecha}`, fetcher, { refreshInterval: 60000 })
  const [asesorPerfil, setAsesorPerfil] = useState<any>(null)

  if (isLoading) return <LoadingSpinner />
  if (!data?.equipo) return <ErrorMsg />

  if (asesorPerfil) {
    return <PerfilAsesor asesor={asesorPerfil} fecha={fecha} onVolver={() => setAsesorPerfil(null)} />
  }

  return (
    <div className="p-4 space-y-2">
      {data.equipo.map((a: any) => (
        <button
          key={a.id}
          onClick={() => setAsesorPerfil(a)}
          className="flex w-full items-center gap-3 rounded-xl bg-dark-surface border border-white/10 p-4 text-left hover:border-navy-accent/50 transition-all"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy-accent/20 text-sm font-bold text-navy-accent">
            {a.nombre?.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{a.nombre}</p>
            <p className="text-xs text-gray-500">{a.zona || 'Sin zona'}</p>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
              <div className={`h-full rounded-full transition-all ${a.cumplimiento >= 80 ? 'bg-success' : a.cumplimiento >= 60 ? 'bg-warning' : 'bg-danger'}`}
                style={{ width: `${Math.min(a.cumplimiento, 100)}%` }} />
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-bold text-white">{a.visitas_hoy}/{a.clientes_asignados}</p>
            <p className={`text-xs font-bold ${a.cumplimiento >= 80 ? 'text-success' : a.cumplimiento >= 60 ? 'text-warning' : 'text-danger'}`}>
              {a.cumplimiento}%
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-gray-600 shrink-0" />
        </button>
      ))}
    </div>
  )
}

// ── Perfil asesor ────────────────────────────────────────────────────────────
function PerfilAsesor({ asesor, fecha, onVolver }: { asesor: any; fecha: string; onVolver: () => void }) {
  const { data } = useSWR(`/api/resumen-dia?asesor_id=${asesor.id}&fecha=${fecha}`, fetcher)
  const m = data?.metricas

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onVolver} className="flex h-9 w-9 items-center justify-center rounded-xl bg-dark-surface text-gray-400">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-base font-bold text-white">{asesor.nombre}</h2>
          <p className="text-xs text-gray-500">{asesor.zona || 'Sin zona'}</p>
        </div>
      </div>

      {!m ? <LoadingSpinner /> : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <KpiCard label="Visitas"     value={`${m.visitas?.realizadas ?? 0}/${m.visitas?.total ?? 0}`} sub="hoy" color="text-white" />
            <KpiCard label="Cumplimiento" value={`${m.visitas?.cumplimiento ?? 0}%`} sub="" color={m.visitas?.cumplimiento >= 80 ? 'text-success' : 'text-warning'} />
            <KpiCard label="Validadas"   value={m.visitas?.validadas ?? 0}    sub="" color="text-success" />
            <KpiCard label="Sospechosas" value={m.visitas?.sospechosas ?? 0}  sub="" color="text-warning" />
          </div>
          {m.pedidos?.efectivos > 0 && (
            <div className="rounded-xl bg-dark-surface border border-white/10 p-4">
              <p className="text-xs text-gray-500 mb-2">Ventas</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><p className="text-xs text-gray-500">Pedidos</p><p className="font-bold text-success">{m.pedidos.efectivos}</p></div>
                <div className="border-x border-white/10"><p className="text-xs text-gray-500">Total</p><p className="font-bold text-white">{m.pedidos.total_vendido_formato}</p></div>
                <div><p className="text-xs text-gray-500">Promedio</p><p className="font-bold text-white">{m.pedidos.promedio_pedido_formato}</p></div>
              </div>
            </div>
          )}
          {m.historial?.length > 0 && (
            <div className="rounded-xl bg-dark-surface border border-white/10 p-4">
              <p className="text-sm font-semibold text-white mb-3">Visitas del día</p>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {m.historial.map((v: any, i: number) => (
                  <div key={i} className="flex items-center gap-3">
                    {v.validada
                      ? <Check className="h-4 w-4 text-success shrink-0" />
                      : <AlertTriangle className="h-4 w-4 text-warning shrink-0" />}
                    <span className="flex-1 text-xs text-white truncate">{v.cliente_nombre}</span>
                    <span className="text-xs text-gray-500">{v.hora}</span>
                    {v.valor_pedido > 0 && <span className="text-xs text-success">${v.valor_pedido.toLocaleString('es-CO')}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ============================================================================
// TAB: ZONAS
// ============================================================================
function TabZonas({ fecha }: { fecha: string }) {
  const { data, isLoading } = useSWR(`/api/dashboard?fecha=${fecha}`, fetcher, { refreshInterval: 60000 })

  if (isLoading) return <LoadingSpinner />
  if (!data?.por_zona) return <ErrorMsg />

  return (
    <div className="p-4 grid grid-cols-1 gap-3">
      {data.por_zona.sort((a: any, b: any) => b.cumplimiento - a.cumplimiento).map((z: any) => (
        <div key={z.zona} className="rounded-xl bg-dark-surface border border-white/10 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-white">{z.zona}</span>
            <span className={`text-sm font-bold ${z.cumplimiento >= 80 ? 'text-success' : z.cumplimiento >= 60 ? 'text-warning' : 'text-danger'}`}>
              {z.cumplimiento}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden mb-3">
            <div className={`h-full rounded-full ${z.cumplimiento >= 80 ? 'bg-success' : z.cumplimiento >= 60 ? 'bg-warning' : 'bg-danger'}`}
              style={{ width: `${z.cumplimiento}%` }} />
          </div>
          <div className="flex gap-4 text-xs text-gray-400">
            <span>{z.asesores} asesores</span>
            <span>{z.visitas} visitas</span>
            <span>{z.clientes} asignados</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================================================
// TAB: ASESORES (ADMIN)
// ============================================================================
function TabAsesores() {
  const { data, isLoading, mutate } = useSWR('/api/admin/asesores', fetcher)
  const [asesorSel, setAsesorSel]         = useState<any>(null)
  const [vista, setVista]                 = useState<"lista" | "clientes" | "editar" | "reasignar">("lista")
  const [buscar, setBuscar]               = useState("")

  const asesores = (data?.asesores || []).filter((a: any) =>
    a.nombre && !a.nombre.match(/^(lunes|martes|mi|sábado|jueves|viernes|domingo)/i)
  )

  const filtrados = asesores.filter((a: any) =>
    a.nombre.toLowerCase().includes(buscar.toLowerCase()) ||
    (a.email || '').toLowerCase().includes(buscar.toLowerCase())
  )

  if (vista === "clientes" && asesorSel) {
    return <VistaClientesAsesor asesor={asesorSel} onVolver={() => { setVista("lista"); setAsesorSel(null) }} />
  }

  if (vista === "editar" && asesorSel) {
    return <VistaEditarAsesor asesor={asesorSel} onVolver={() => { setVista("lista"); setAsesorSel(null); mutate() }} />
  }

  if (vista === "reasignar" && asesorSel) {
    return <VistaReasignar asesor={asesorSel} asesores={asesores} onVolver={() => { setVista("lista"); setAsesorSel(null); mutate() }} />
  }

  return (
    <div className="p-4 space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
        <input
          value={buscar}
          onChange={e => setBuscar(e.target.value)}
          placeholder="Buscar asesor..."
          className="w-full rounded-xl border border-white/10 bg-dark-surface pl-10 pr-10 py-2.5 text-sm text-white placeholder-gray-500 focus:border-navy-accent focus:outline-none"
        />
        {buscar && <button onClick={() => setBuscar("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"><X className="h-4 w-4" /></button>}
      </div>

      {isLoading ? <LoadingSpinner /> : filtrados.map((a: any) => (
        <div key={a.id} className="rounded-xl bg-dark-surface border border-white/10 p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-white truncate">{a.nombre}</p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${a.activo ? 'bg-success/20 text-success' : 'bg-gray-600/20 text-gray-400'}`}>
                  {a.activo ? 'ACTIVO' : 'INACTIVO'}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{a.email}</p>
              {a.zona && <p className="text-xs text-gray-600">{a.zona}</p>}
            </div>
            <div className="shrink-0 ml-2 text-right">
              <p className="text-lg font-bold text-white">{a.total_clientes}</p>
              <p className="text-[10px] text-gray-500">clientes</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setAsesorSel(a); setVista("clientes") }}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-white/5 border border-white/10 py-2 text-xs text-gray-300 hover:bg-white/10 transition-colors"
            >
              <Users className="h-3.5 w-3.5" />Ver clientes
            </button>
            <button
              onClick={() => { setAsesorSel(a); setVista("editar") }}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-navy-accent/10 border border-navy-accent/20 py-2 text-xs text-navy-accent hover:bg-navy-accent/20 transition-colors"
            >
              <Edit2 className="h-3.5 w-3.5" />Editar
            </button>
            <button
              onClick={() => { setAsesorSel(a); setVista("reasignar") }}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-warning/10 border border-warning/20 py-2 text-xs text-warning hover:bg-warning/20 transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />Reasignar
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Vista clientes de asesor ─────────────────────────────────────────────────
function VistaClientesAsesor({ asesor, onVolver }: { asesor: any; onVolver: () => void }) {
  const [buscar, setBuscar]         = useState("")
  const [filtroRuta, setFiltroRuta] = useState("")
  const { data, isLoading } = useSWR(
    `/api/admin/clientes?asesor_id=${asesor.id}&limit=10000`, fetcher
  )

  const todos = data?.clientes || []
  const rutasUnicas = Array.from(new Set(todos.map((c: any) => getRuta(c.nombre))))
    .filter((r: any) => r !== '—')
    .sort((a: any, b: any) => a.localeCompare(b, undefined, { numeric: true }))

  const filtrados = todos.filter((c: any) => {
    const matchRuta   = filtroRuta ? getRuta(c.nombre) === filtroRuta : true
    const matchBuscar = buscar ? c.nombre.toLowerCase().includes(buscar.toLowerCase()) : true
    return matchRuta && matchBuscar
  })

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-3">
        <button onClick={onVolver} className="flex h-9 w-9 items-center justify-center rounded-xl bg-dark-surface text-gray-400">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-sm font-bold text-white">{asesor.nombre}</h2>
          <p className="text-xs text-gray-500">{isLoading ? 'Cargando...' : `${filtrados.length} de ${todos.length} clientes`}</p>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar..." className="w-full rounded-xl border border-white/10 bg-dark-surface pl-10 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none" />
        </div>
        <select value={filtroRuta} onChange={e => setFiltroRuta(e.target.value)} className="rounded-xl border border-white/10 bg-dark-surface px-3 py-2.5 text-sm text-white focus:outline-none">
          <option value="">Todas</option>
          {(rutasUnicas as string[]).map(r => <option key={r} value={r}>Ruta {r}</option>)}
        </select>
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <div className="space-y-1.5">
          {filtrados.map((c: any) => (
            <div key={c.id} className="flex items-center gap-3 rounded-lg bg-dark-surface border border-white/5 px-3 py-2.5">
              <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold font-mono text-gray-300">{getRuta(c.nombre)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white truncate">{getNombreSinRuta(c.nombre)}</p>
                <p className="text-[10px] text-gray-500 truncate">{c.direccion || '—'}</p>
              </div>
              <MapPin className={`h-3.5 w-3.5 shrink-0 ${c.coordenadas ? 'text-success' : 'text-gray-600'}`} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Editar asesor ────────────────────────────────────────────────────────────
function VistaEditarAsesor({ asesor, onVolver }: { asesor: any; onVolver: () => void }) {
  const [nombre, setNombre]   = useState(asesor.nombre)
  const [zona, setZona]       = useState(asesor.zona || "")
  const [activo, setActivo]   = useState(asesor.activo)
  const [loading, setLoading] = useState(false)
  const [exito, setExito]     = useState(false)
  const [error, setError]     = useState("")

  const handleGuardar = async () => {
    if (!nombre.trim()) { setError("El nombre es obligatorio"); return }
    setLoading(true)
    setError("")
    try {
      const res = await fetch('/api/admin/asesores', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asesor_id: asesor.id, nombre, zona, activo }),
      })
      if (!res.ok) throw new Error()
      setExito(true)
      setTimeout(onVolver, 1200)
    } catch {
      setError("Error guardando cambios")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onVolver} className="flex h-9 w-9 items-center justify-center rounded-xl bg-dark-surface text-gray-400">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h2 className="text-base font-bold text-white">Editar asesor</h2>
      </div>

      <div className="rounded-xl bg-dark-surface border border-white/10 p-4 space-y-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Nombre *</label>
          <input value={nombre} onChange={e => setNombre(e.target.value)} className="w-full rounded-xl border border-white/10 bg-dark-bg px-4 py-2.5 text-sm text-white focus:border-navy-accent focus:outline-none" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Zona</label>
          <input value={zona} onChange={e => setZona(e.target.value)} placeholder="Ej: Norte, Sur, Centro..." className="w-full rounded-xl border border-white/10 bg-dark-bg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-navy-accent focus:outline-none" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Email</label>
          <input value={asesor.email} disabled className="w-full rounded-xl border border-white/5 bg-dark-bg/50 px-4 py-2.5 text-sm text-gray-500 cursor-not-allowed" />
          <p className="text-[10px] text-gray-600 mt-1">El email no se puede cambiar</p>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-dark-bg border border-white/10 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-white">Estado de la cuenta</p>
            <p className="text-xs text-gray-500">{activo ? "El asesor puede iniciar sesión" : "El asesor no puede ingresar"}</p>
          </div>
          <button
            onClick={() => setActivo(!activo)}
            className={`relative h-6 w-11 rounded-full transition-colors ${activo ? 'bg-success' : 'bg-gray-600'}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${activo ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
      </div>

      {error && <div className="flex items-center gap-2 rounded-xl bg-danger/10 border border-danger/20 px-4 py-3"><AlertCircle className="h-4 w-4 text-danger" /><p className="text-sm text-danger">{error}</p></div>}
      {exito && <div className="flex items-center gap-2 rounded-xl bg-success/10 border border-success/20 px-4 py-3"><CheckCircle className="h-4 w-4 text-success" /><p className="text-sm text-success">Cambios guardados correctamente</p></div>}

      <button onClick={handleGuardar} disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-navy-accent py-3 font-semibold text-white disabled:opacity-50 transition-all active:scale-[0.97]">
        {loading ? <><Loader2 className="h-4 w-4 animate-spin" /><span>Guardando...</span></> : <><Check className="h-4 w-4" /><span>Guardar cambios</span></>}
      </button>
    </div>
  )
}

// ── Reasignar clientes ───────────────────────────────────────────────────────
function VistaReasignar({ asesor, asesores, onVolver }: { asesor: any; asesores: any[]; onVolver: () => void }) {
  const [todos, setTodos] = useState<any[]>([])
  useEffect(() => {
    async function cargarTodos() {
      const BATCH = 1000
      let offset = 0
      let acumulados: any[] = []
      while (true) {
        const res = await fetch(`/api/admin/clientes?asesor_id=${asesor.id}&limit=${BATCH}&offset=${offset}`)
        const data = await res.json()
        acumulados = [...acumulados, ...(data?.clientes || [])]
        if (!data?.pagination?.has_more) break
        offset += BATCH
      }
      setTodos(acumulados)
    }
    cargarTodos()
  }, [asesor.id])

  const rutasUnicas: string[] = Array.from(new Set(todos.map((c: any) => getRuta(c.nombre))))
    .filter((r: any) => r !== '—')
    .sort((a: any, b: any) => (a as string).localeCompare(b as string, undefined, { numeric: true })) as string[]

  const [rutasSel, setRutasSel]       = useState<string[]>([])
  const [todasRutas, setTodasRutas]   = useState(false)
  const [asesorDest, setAsesorDest]   = useState("")
  const [desactivar, setDesactivar]   = useState(false)
  const [loading, setLoading]         = useState(false)
  const [resultado, setResultado]     = useState<any>(null)
  const [error, setError]             = useState("")

  const toggleRuta = (r: string) => {
    setRutasSel(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])
  }

  const clientesAfectados = todasRutas
    ? todos.length
    : todos.filter((c: any) => rutasSel.includes(getRuta(c.nombre))).length

  const handleReasignar = async () => {
    if (!asesorDest) { setError("Selecciona el asesor destino"); return }
    if (!todasRutas && rutasSel.length === 0) { setError("Selecciona al menos una ruta"); return }
    setLoading(true)
    setError("")
    try {
      const res = await fetch('/api/admin/reasignar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asesor_origen_id:  asesor.id,
          asesor_destino_id: asesorDest,
          rutas:             todasRutas ? [] : rutasSel,
          desactivar_origen: todasRutas && desactivar,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setResultado(d.detalle)
    } catch (e: any) {
      setError(e.message || "Error reasignando clientes")
    } finally {
      setLoading(false)
    }
  }

  if (resultado) {
    return (
      <div className="p-4 space-y-4">
        <div className="rounded-xl bg-success/10 border border-success/30 p-6 text-center space-y-2">
          <CheckCircle className="h-12 w-12 text-success mx-auto" />
          <p className="text-lg font-bold text-white">{resultado.clientes_movidos} clientes reasignados</p>
          <p className="text-sm text-gray-400">De <span className="text-white">{resultado.de}</span> a <span className="text-white">{resultado.a}</span></p>
          {resultado.asesor_desactivado && <p className="text-xs text-warning">Asesor origen marcado como inactivo</p>}
        </div>
        <button onClick={onVolver} className="w-full rounded-xl bg-navy-accent py-3 font-semibold text-white">Volver a asesores</button>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4 pb-32">
      <div className="flex items-center gap-3">
        <button onClick={onVolver} className="flex h-9 w-9 items-center justify-center rounded-xl bg-dark-surface text-gray-400">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-base font-bold text-white">Reasignar clientes</h2>
          <p className="text-xs text-gray-500">{asesor.nombre}</p>
        </div>
      </div>

      {/* Selección de rutas */}
      <div className="rounded-xl bg-dark-surface border border-white/10 p-4 space-y-3">
        <p className="text-sm font-semibold text-white">¿Qué reasignar?</p>
        <button
          onClick={() => { setTodasRutas(!todasRutas); setRutasSel([]) }}
          className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all ${todasRutas ? 'border-warning bg-warning/10' : 'border-white/10 bg-dark-bg'}`}
        >
          <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${todasRutas ? 'border-warning bg-warning' : 'border-gray-500'}`}>
            {todasRutas && <div className="h-2 w-2 rounded-full bg-white" />}
          </div>
          <div>
            <p className="text-sm font-medium text-white">Todas las rutas ({todos.length} clientes)</p>
            <p className="text-xs text-gray-400">Reasigna el 100% de los clientes</p>
          </div>
        </button>

        {!todasRutas && (
          <div className="space-y-2">
            <p className="text-xs text-gray-500">O selecciona rutas específicas:</p>
            <div className="flex flex-wrap gap-2">
              {rutasUnicas.map(r => {
                const count = todos.filter((c: any) => getRuta(c.nombre) === r).length
                const sel = rutasSel.includes(r)
                return (
                  <button key={r} onClick={() => toggleRuta(r)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${sel ? 'bg-navy-accent text-white' : 'bg-dark-bg border border-white/10 text-gray-400'}`}>
                    Ruta {r} · {count}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Asesor destino */}
      <div className="rounded-xl bg-dark-surface border border-white/10 p-4 space-y-2">
        <p className="text-sm font-semibold text-white">Asignar a</p>
        <select
          value={asesorDest}
          onChange={e => setAsesorDest(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-dark-bg px-4 py-2.5 text-sm text-white focus:border-navy-accent focus:outline-none"
        >
          <option value="">Selecciona el asesor destino...</option>
          {asesores.filter((a: any) => a.id !== asesor.id && a.activo).map((a: any) => (
            <option key={a.id} value={a.id}>{a.nombre} ({a.total_clientes} clientes)</option>
          ))}
        </select>
      </div>

      {/* Desactivar origen (solo si todas las rutas) */}
      {todasRutas && (
        <button
          onClick={() => setDesactivar(!desactivar)}
          className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all ${desactivar ? 'border-danger/40 bg-danger/10' : 'border-white/10 bg-dark-surface'}`}
        >
          <div className={`h-4 w-4 rounded border-2 flex items-center justify-center ${desactivar ? 'border-danger bg-danger' : 'border-gray-500'}`}>
            {desactivar && <Check className="h-3 w-3 text-white" />}
          </div>
          <div>
            <p className="text-sm font-medium text-white flex items-center gap-2"><UserX className="h-4 w-4 text-danger" />Marcar a {asesor.nombre} como inactivo</p>
            <p className="text-xs text-gray-400">Ya no podrá iniciar sesión</p>
          </div>
        </button>
      )}

      {/* Resumen */}
      {(todasRutas || rutasSel.length > 0) && asesorDest && (
        <div className="rounded-xl bg-navy-accent/10 border border-navy-accent/30 p-3">
          <p className="text-xs text-gray-400 text-center">
            Se moverán <span className="text-white font-bold">{clientesAfectados} clientes</span> al asesor seleccionado
          </p>
        </div>
      )}

      {error && <div className="flex items-center gap-2 rounded-xl bg-danger/10 border border-danger/20 px-4 py-3"><AlertCircle className="h-4 w-4 text-danger" /><p className="text-sm text-danger">{error}</p></div>}

      <button onClick={handleReasignar} disabled={loading || !asesorDest || (!todasRutas && rutasSel.length === 0)}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-warning py-3 font-bold text-dark-bg transition-all active:scale-[0.97] disabled:opacity-40">
        {loading ? <><Loader2 className="h-4 w-4 animate-spin" /><span>Reasignando...</span></> : <><ArrowRight className="h-4 w-4" /><span>CONFIRMAR REASIGNACIÓN</span></>}
      </button>
    </div>
  )
}

// ============================================================================
// TAB: IMPORTAR CSV
// ============================================================================
function TabImportar() {
  const [file, setFile]       = useState<File | null>(null)
  const [csvText, setCsvText] = useState("")
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus]   = useState("")
  const [stats, setStats]     = useState<any>(null)
  const [error, setError]     = useState("")

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) { setFile(f); setError(""); setStats(null); setCsvText(await f.text()) }
  }

  const handleImport = async () => {
    if (!csvText) { setError("Selecciona un archivo primero"); return }
    setLoading(true); setError(""); setProgress(0); setStatus("Iniciando...")

    try {
      const parseRes = await fetch('/api/admin/import-csv', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'parse', csvText }),
      })
      const parseData = await parseRes.json()
      if (!parseRes.ok) throw new Error(parseData.error)

      let offset = 0, totalImp = 0, totalOm = 0
      setStatus(`${parseData.total} filas encontradas. Importando...`)

      while (true) {
        const batchRes = await fetch('/api/admin/import-csv', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'import-batch', csvText, offset }),
        })
        const batchData = await batchRes.json()
        if (!batchRes.ok) throw new Error(batchData.error)

        totalImp += batchData.imported; totalOm += batchData.omitted
        setProgress(batchData.progress)
        setStatus(`${batchData.progress}% — Importados: ${totalImp} | Omitidos: ${totalOm}`)

        if (!batchData.hasMore) {
          setStats({ importados: totalImp, omitidos: totalOm, total: parseData.total })
          setStatus("✅ Completado")
          break
        }
        offset = batchData.offset
      }
      setFile(null); setCsvText("")
    } catch (e: any) {
      setError(e.message || "Error desconocido")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 space-y-4">
      <div>
        <h2 className="text-base font-bold text-white">Importar clientes CSV</h2>
        <p className="text-xs text-gray-500 mt-0.5">Importación por lotes sin timeout</p>
      </div>

      <div className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${file ? 'border-success/40 bg-success/5' : 'border-white/20 hover:border-navy-accent'}`}>
        <input id="csv-input" type="file" accept=".csv" onChange={handleFile} className="hidden" disabled={loading} />
        {!file ? (
          <label htmlFor="csv-input" className="cursor-pointer block">
            <FileUp className="h-10 w-10 text-gray-500 mx-auto mb-3" />
            <p className="text-sm text-white mb-1">Toca para seleccionar archivo CSV</p>
            <p className="text-xs text-gray-500">Cualquier tamaño</p>
          </label>
        ) : (
          <div className="flex items-center justify-center gap-3">
            <CheckCircle className="h-6 w-6 text-success" />
            <div className="text-left">
              <p className="text-sm font-medium text-white">{file.name}</p>
              <p className="text-xs text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
            <button onClick={() => { setFile(null); setCsvText("") }} className="text-gray-500 hover:text-white ml-2"><X className="h-4 w-4" /></button>
          </div>
        )}
      </div>

      {loading && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">{status}</span>
            <span className="font-mono text-white">{progress}%</span>
          </div>
          <div className="h-3 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-success rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {error && <div className="flex items-center gap-2 rounded-xl bg-danger/10 border border-danger/20 px-4 py-3"><AlertCircle className="h-4 w-4 text-danger" /><p className="text-sm text-danger">{error}</p></div>}

      {stats && (
        <div className="rounded-xl bg-success/10 border border-success/30 p-4">
          <p className="text-sm font-bold text-success mb-3 flex items-center gap-2"><CheckCircle className="h-4 w-4" />Importación completada</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div><p className="text-xs text-gray-500">Importados</p><p className="text-xl font-bold text-success">{stats.importados}</p></div>
            <div className="border-x border-white/10"><p className="text-xs text-gray-500">Omitidos</p><p className="text-xl font-bold text-warning">{stats.omitidos}</p></div>
            <div><p className="text-xs text-gray-500">Total</p><p className="text-xl font-bold text-white">{stats.total}</p></div>
          </div>
        </div>
      )}

      <button onClick={handleImport} disabled={!file || loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-success py-3 font-bold text-dark-bg transition-all active:scale-[0.97] disabled:opacity-40">
        {loading ? <><Loader2 className="h-4 w-4 animate-spin" /><span>Importando...</span></> : <><Upload className="h-4 w-4" /><span>INICIAR IMPORTACIÓN</span></>}
      </button>
    </div>
  )
}

// ============================================================================
// TAB: COMPARTIR RUTA
// ============================================================================
function TabCompartir() {
  const { data, isLoading } = useSWR('/api/admin/asesores', fetcher)

  const asesores = (data?.asesores || []).filter((a: any) =>
    a.nombre && !a.nombre.match(/^(lunes|martes|mi|sábado|jueves|viernes|domingo)/i) && a.activo
  )

  const [asesorOrigen, setAsesorOrigen]   = useState("")
  const [asesorDest, setAsesorDest]       = useState("")
  const [clientes, setClientes]           = useState<any[]>([])
  const [cargandoClientes, setCargandoClientes] = useState(false)
  const [rutasSel, setRutasSel]           = useState<string[]>([])
  const [loading, setLoading]             = useState(false)
  const [resultado, setResultado]         = useState<any>(null)
  const [error, setError]                 = useState("")

  // Cargar clientes del asesor origen
  useEffect(() => {
    if (!asesorOrigen) { setClientes([]); setRutasSel([]); return }
    setCargandoClientes(true)
    const cargar = async () => {
      const BATCH = 1000
      let offset = 0
      let acumulados: any[] = []
      while (true) {
        const res = await fetch(`/api/admin/clientes?asesor_id=${asesorOrigen}&limit=${BATCH}&offset=${offset}`)
        const d = await res.json()
        acumulados = [...acumulados, ...(d?.clientes || [])]
        if (!d?.pagination?.has_more) break
        offset += BATCH
      }
      setClientes(acumulados)
      setRutasSel([])
      setCargandoClientes(false)
    }
    cargar()
  }, [asesorOrigen])

  const rutasUnicas: string[] = Array.from(new Set(clientes.map((c: any) => getRuta(c.nombre))))
    .filter((r: any) => r !== '—')
    .sort((a: any, b: any) => (a as string).localeCompare(b as string, undefined, { numeric: true })) as string[]

  const toggleRuta = (r: string) => {
    setRutasSel(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])
  }

  const clientesAfectados = clientes.filter((c: any) => rutasSel.includes(getRuta(c.nombre))).length

  const handleCompartir = async () => {
    if (!asesorOrigen) { setError("Selecciona el asesor origen"); return }
    if (!asesorDest)   { setError("Selecciona el asesor destino"); return }
    if (asesorOrigen === asesorDest) { setError("El asesor origen y destino no pueden ser el mismo"); return }
    if (rutasSel.length === 0) { setError("Selecciona al menos una ruta"); return }
    setLoading(true)
    setError("")
    try {
      const res = await fetch('/api/admin/compartir-ruta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asesor_origen_id:  asesorOrigen,
          asesor_destino_id: asesorDest,
          rutas:             rutasSel,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setResultado(d)
    } catch (e: any) {
      setError(e.message || "Error compartiendo ruta")
    } finally {
      setLoading(false)
    }
  }

  const resetear = () => {
    setAsesorOrigen(""); setAsesorDest(""); setClientes([])
    setRutasSel([]); setResultado(null); setError("")
  }

  if (resultado) {
    return (
      <div className="p-4 space-y-4">
        <div className="rounded-xl bg-success/10 border border-success/30 p-6 text-center space-y-2">
          <CheckCircle className="h-12 w-12 text-success mx-auto" />
          <p className="text-lg font-bold text-white">{resultado.compartidos} clientes compartidos</p>
          <p className="text-sm text-gray-400">
            <span className="text-white">{resultado.asesor_origen}</span> → <span className="text-white">{resultado.asesor_destino}</span>
          </p>
          <p className="text-xs text-gray-500">Los clientes originales no fueron movidos ni modificados</p>
        </div>
        <button onClick={resetear} className="w-full rounded-xl bg-navy-accent py-3 font-semibold text-white">
          Compartir otra ruta
        </button>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4 pb-32">
      <div>
        <h2 className="text-base font-bold text-white">Compartir ruta</h2>
        <p className="text-xs text-gray-500 mt-0.5">Los clientes se comparten sin mover ni duplicar</p>
      </div>

      {/* Info */}
      <div className="rounded-xl bg-navy-accent/10 border border-navy-accent/20 p-3">
        <p className="text-xs text-gray-300">
          Usa esto cuando dos asesores deben cubrir la misma zona el mismo día. El asesor destino verá los clientes en su lista, pero el asesor origen los conserva también.
        </p>
      </div>

      {/* Asesor origen */}
      <div className="rounded-xl bg-dark-surface border border-white/10 p-4 space-y-2">
        <p className="text-sm font-semibold text-white">Asesor que tiene la ruta</p>
        {isLoading ? <LoadingSpinner /> : (
          <select
            value={asesorOrigen}
            onChange={e => { setAsesorOrigen(e.target.value); setResultado(null); setError("") }}
            className="w-full rounded-xl border border-white/10 bg-dark-bg px-4 py-2.5 text-sm text-white focus:border-navy-accent focus:outline-none"
          >
            <option value="">Selecciona el asesor origen...</option>
            {asesores.map((a: any) => (
              <option key={a.id} value={a.id}>{a.nombre} ({a.total_clientes} clientes)</option>
            ))}
          </select>
        )}
      </div>

      {/* Selección de rutas */}
      {asesorOrigen && (
        <div className="rounded-xl bg-dark-surface border border-white/10 p-4 space-y-3">
          <p className="text-sm font-semibold text-white">Rutas a compartir</p>
          {cargandoClientes ? (
            <div className="flex items-center gap-2 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-navy-accent" />
              <span className="text-xs text-gray-400">Cargando rutas...</span>
            </div>
          ) : rutasUnicas.length === 0 ? (
            <p className="text-xs text-gray-500">Este asesor no tiene clientes con ruta asignada</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {rutasUnicas.map(r => {
                const count = clientes.filter((c: any) => getRuta(c.nombre) === r).length
                const sel = rutasSel.includes(r)
                return (
                  <button key={r} onClick={() => toggleRuta(r)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${sel ? 'bg-navy-accent text-white' : 'bg-dark-bg border border-white/10 text-gray-400'}`}>
                    Ruta {r} · {count}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Asesor destino */}
      {asesorOrigen && rutasSel.length > 0 && (
        <div className="rounded-xl bg-dark-surface border border-white/10 p-4 space-y-2">
          <p className="text-sm font-semibold text-white">Compartir con</p>
          <select
            value={asesorDest}
            onChange={e => setAsesorDest(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-dark-bg px-4 py-2.5 text-sm text-white focus:border-navy-accent focus:outline-none"
          >
            <option value="">Selecciona el asesor destino...</option>
            {asesores.filter((a: any) => a.id !== asesorOrigen).map((a: any) => (
              <option key={a.id} value={a.id}>{a.nombre}</option>
            ))}
          </select>
        </div>
      )}

      {/* Resumen */}
      {rutasSel.length > 0 && asesorDest && (
        <div className="rounded-xl bg-navy-accent/10 border border-navy-accent/30 p-3">
          <p className="text-xs text-gray-400 text-center">
            <span className="text-white font-bold">{clientesAfectados} clientes</span> de las rutas {rutasSel.join(', ')} serán visibles para el asesor destino
          </p>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-danger/10 border border-danger/20 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-danger" />
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      <button
        onClick={handleCompartir}
        disabled={loading || !asesorOrigen || !asesorDest || rutasSel.length === 0}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-navy-accent py-3 font-bold text-white transition-all active:scale-[0.97] disabled:opacity-40"
      >
        {loading
          ? <><Loader2 className="h-4 w-4 animate-spin" /><span>Compartiendo...</span></>
          : <><Share2 className="h-4 w-4" /><span>COMPARTIR RUTA</span></>
        }
      </button>
    </div>
  )
}

// ============================================================================
// HELPERS UI
// ============================================================================
function KpiCard({ label, value, sub, color }: { label: string; value: any; sub: string; color: string }) {
  return (
    <div className="rounded-xl bg-dark-surface border border-white/10 p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
    </div>
  )
}
function LoadingSpinner() {
  return <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-navy-accent" /></div>
}
function ErrorMsg() {
  return <div className="flex flex-col items-center justify-center py-16 text-center"><AlertTriangle className="h-10 w-10 text-danger mb-3" /><p className="text-gray-400">Error cargando datos</p></div>
}
