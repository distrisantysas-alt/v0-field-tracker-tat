"use client"

// ============================================================================
// components/supervisor/supervisor-layout.tsx (CONECTADO A NEON)
// ============================================================================

import { useState } from "react"
import useSWR from "swr"
import {
  Users, Map, AlertTriangle, FileText, ChevronLeft,
  Loader2, Check, TrendingUp, Clock
} from "lucide-react"

const fetcher = (url: string) => fetch(url).then(r => r.json())

function fechaColombia() {
  return new Date().toLocaleString('en-CA', { timeZone: 'America/Bogota' }).split(',')[0]
}

function getInitials(nombre: string) {
  return nombre.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
}

const sidebarItems = [
  { id: "equipo",   label: "Mi Equipo",      icon: Users },
  { id: "alertas",  label: "Alertas",         icon: AlertTriangle },
  { id: "reportes", label: "Reportes",        icon: FileText },
] as const

type TabId = (typeof sidebarItems)[number]["id"]

interface SupervisorLayoutProps {
  onBack: () => void
}

export function SupervisorLayout({ onBack }: SupervisorLayoutProps) {
  const [activeTab, setActiveTab] = useState<TabId>("equipo")
  const fecha = fechaColombia()

  const { data, isLoading, mutate } = useSWR(
    `/api/dashboard?fecha=${fecha}`,
    fetcher,
    { refreshInterval: 30000 }
  )

  const alertaCount = data?.alertas?.length ?? 0

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r border-gray-200 bg-navy">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
          <button
            onClick={onBack}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <h2 className="text-sm font-bold text-white">Field Tracker TAT</h2>
            <p className="text-xs text-white/50">Panel Supervisor</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3">
          {sidebarItems.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.id
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                  isActive ? "bg-white/15 text-white" : "text-white/60 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={1.8} />
                <span>{item.label}</span>
                {item.id === "alertas" && alertaCount > 0 && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">
                    {alertaCount}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Stats rápidas en sidebar */}
        {data && (
          <div className="border-t border-white/10 p-4 space-y-2">
            <p className="text-[10px] text-white/40 uppercase font-bold tracking-wider">Hoy</p>
            <div className="flex justify-between text-xs text-white/70">
              <span>Asesores activos</span>
              <span className="font-bold text-white">{data.totales.asesores_activos}/{data.totales.asesores}</span>
            </div>
            <div className="flex justify-between text-xs text-white/70">
              <span>Visitas</span>
              <span className="font-bold text-white">{data.totales.visitas}</span>
            </div>
            <div className="flex justify-between text-xs text-white/70">
              <span>Cumplimiento</span>
              <span className={`font-bold ${data.totales.cumplimiento >= 80 ? 'text-green-400' : data.totales.cumplimiento >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                {data.totales.cumplimiento}%
              </span>
            </div>
          </div>
        )}
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto p-8">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-navy" />
          </div>
        ) : (
          <>
            {activeTab === "equipo"   && <EquipoView data={data} onRefresh={mutate} />}
            {activeTab === "alertas"  && <AlertasView data={data} />}
            {activeTab === "reportes" && <ReportesView />}
          </>
        )}
      </main>
    </div>
  )
}

// ── Mi Equipo ──────────────────────────────────────────────────────────────

function EquipoView({ data, onRefresh }: { data: any; onRefresh: () => void }) {
  const [asesorSeleccionado, setAsesorSeleccionado] = useState<any>(null)

  if (asesorSeleccionado) {
    return <PerfilAsesor asesor={asesorSeleccionado} onBack={() => setAsesorSeleccionado(null)} />
  }

  const equipo = data?.equipo ?? []

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mi Equipo</h1>
          <p className="text-sm text-gray-500 mt-1">
            {data?.totales.asesores_activos} activos de {data?.totales.asesores} asesores · {data?.fecha}
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="text-xs text-navy hover:underline flex items-center gap-1"
        >
          <TrendingUp className="h-3 w-3" /> Actualizar
        </button>
      </div>

      <div className="grid gap-3">
        {equipo.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-400">
            No hay asesores registrados
          </div>
        ) : (
          equipo.map((a: any) => (
            <button
              key={a.id}
              onClick={() => setAsesorSeleccionado(a)}
              className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-left hover:border-navy hover:shadow-md transition-all group"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-navy text-sm font-bold text-white shrink-0">
                {getInitials(a.nombre)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900 group-hover:text-navy">{a.nombre}</span>
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700">
                    activo
                  </span>
                </div>
                <p className="text-xs text-gray-500">{a.zona || 'Sin zona'}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-lg font-bold text-gray-900">
                  {a.visitas_hoy}/{a.clientes_asignados}
                </p>
                <div className="mt-1 h-1.5 w-20 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full rounded-full ${
                      a.cumplimiento >= 80 ? "bg-green-500" :
                      a.cumplimiento >= 60 ? "bg-yellow-500" : "bg-red-500"
                    }`}
                    style={{ width: `${Math.min(a.cumplimiento, 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5">{a.cumplimiento}%</p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

// ── Perfil del Asesor (click desde Mi Equipo) ─────────────────────────────

function PerfilAsesor({ asesor, onBack }: { asesor: any; onBack: () => void }) {
  const fecha = fechaColombia()
  const { data, isLoading } = useSWR(
    `/api/resumen-dia?asesor_id=${asesor.id}&fecha=${fecha}`,
    fetcher,
    { refreshInterval: 30000 }
  )

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          <ChevronLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{asesor.nombre}</h1>
          <p className="text-sm text-gray-500">{asesor.zona || 'Sin zona'} · {fecha}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-navy" />
        </div>
      ) : data ? (
        <div className="space-y-5">
          {/* KPIs del día */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Visitas hoy", value: data.metricas.visitas.total, color: "text-gray-900" },
              { label: "Validadas", value: data.metricas.visitas.validadas, color: "text-green-600" },
              { label: "Sospechosas", value: data.metricas.visitas.fuera_rango, color: "text-yellow-600" },
              { label: "Cumplimiento", value: data.metricas.rutas.cumplimiento, color: "text-navy" },
            ].map(k => (
              <div key={k.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-center">
                <p className="text-xs text-gray-500 mb-1">{k.label}</p>
                <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>

          {/* Ventas */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-3">Pedidos del día</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-xs text-gray-500">Pedidos</p>
                <p className="text-3xl font-bold text-green-600">{data.metricas.pedidos.efectivos}</p>
                <p className="text-xs text-gray-400">{data.metricas.pedidos.tasa_conversion} conv.</p>
              </div>
              <div className="text-center border-x border-gray-100">
                <p className="text-xs text-gray-500">Total vendido</p>
                <p className="text-2xl font-bold text-gray-900">{data.metricas.pedidos.total_vendido_formato}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500">Promedio</p>
                <p className="text-2xl font-bold text-gray-900">{data.metricas.pedidos.promedio_pedido_formato}</p>
              </div>
            </div>
          </div>

          {/* Historial de visitas */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Historial de visitas hoy</h3>
            </div>
            {data.visitas.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-sm">Sin visitas registradas hoy</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {data.visitas.map((v: any) => (
                  <div key={v.id} className="flex items-center gap-4 px-5 py-3">
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                      v.ubicacion.validada ? 'bg-green-100' : 'bg-yellow-100'
                    }`}>
                      {v.ubicacion.validada
                        ? <Check className="h-3.5 w-3.5 text-green-600" />
                        : <AlertTriangle className="h-3.5 w-3.5 text-yellow-600" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{v.cliente.nombre}</p>
                      <p className="text-xs text-gray-400 truncate">{v.cliente.direccion}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-mono text-gray-600">{v.hora}</p>
                      {v.pedido.hubo_pedido && (
                        <p className="text-xs text-green-600 font-medium">{v.pedido.valor_formato}</p>
                      )}
                      <p className="text-[10px] text-gray-400">{v.ubicacion.distancia_metros}m</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center text-gray-400 py-8">Error cargando datos</div>
      )}
    </div>
  )
}

// ── Alertas ────────────────────────────────────────────────────────────────

function AlertasView({ data }: { data: any }) {
  const alertas = data?.alertas ?? []

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-gray-900">Alertas</h1>
      <p className="mb-6 text-sm text-gray-500">
        {alertas.length > 0 ? `${alertas.length} alertas requieren tu atención` : 'Sin alertas por ahora'}
      </p>

      {alertas.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
          <Check className="mx-auto h-10 w-10 text-green-400 mb-2" />
          <p className="text-gray-500 text-sm">Todo en orden — sin visitas sospechosas hoy</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {alertas.map((a: any) => (
            <div key={a.id} className="flex items-start gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">{a.asesor}</p>
                <p className="text-sm text-gray-600">{a.cliente} — {a.distancia_metros}m fuera del punto</p>
                <p className="text-xs text-gray-400">{a.direccion}</p>
              </div>
              <span className="shrink-0 text-xs text-gray-400 font-mono">{a.hora}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Reportes ───────────────────────────────────────────────────────────────

function ReportesView() {
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-gray-900">Reportes</h1>
      <p className="mb-6 text-sm text-gray-500">Genera y descarga reportes de tu equipo</p>

      <div className="grid grid-cols-2 gap-4">
        {[
          { title: "Reporte Diario",    desc: "Resumen de visitas del día" },
          { title: "Reporte Semanal",   desc: "Rendimiento acumulado semanal" },
          { title: "Cumplimiento TAT",  desc: "% de clientes visitados vs plan" },
          { title: "Incidencias",       desc: "Visitas sospechosas y omisiones" },
        ].map((r) => (
          <div key={r.title} className="flex flex-col items-start rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <FileText className="mb-3 h-8 w-8 text-navy" />
            <h3 className="font-semibold text-gray-900">{r.title}</h3>
            <p className="mb-4 text-xs text-gray-500">{r.desc}</p>
            <button className="mt-auto rounded-lg bg-navy px-4 py-2 text-xs font-medium text-white hover:bg-navy-accent transition-colors">
              Generar
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
