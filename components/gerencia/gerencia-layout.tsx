"use client"

// ============================================================================
// components/gerencia/gerencia-layout.tsx (CONECTADO A NEON)
// ============================================================================

import { useState } from "react"
import useSWR from "swr"
import {
  LayoutDashboard, Users, Globe, Download, ChevronLeft,
  TrendingUp, TrendingDown, Loader2, AlertTriangle, Check
} from "lucide-react"

const fetcher = (url: string) => fetch(url).then(r => r.json())

function fechaColombia() {
  return new Date().toLocaleString('en-CA', { timeZone: 'America/Bogota' }).split(',')[0]
}

function getInitials(nombre: string) {
  return nombre.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
}

const sidebarItems = [
  { id: "dashboard", label: "Dashboard",  icon: LayoutDashboard },
  { id: "asesores",  label: "Asesores",   icon: Users },
  { id: "zonas",     label: "Zonas",      icon: Globe },
  { id: "exportar",  label: "Exportar",   icon: Download },
] as const

type TabId = (typeof sidebarItems)[number]["id"]

interface GerenciaLayoutProps {
  onBack: () => void
}

export function GerenciaLayout({ onBack }: GerenciaLayoutProps) {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard")
  const fecha = fechaColombia()

  const { data, isLoading, mutate } = useSWR(
    `/api/dashboard?fecha=${fecha}`,
    fetcher,
    { refreshInterval: 60000 }
  )

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
            <p className="text-xs text-white/50">Dirección / RRHH</p>
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
              </button>
            )
          })}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-success text-xs font-bold text-white">
              AD
            </div>
            <div>
              <p className="text-sm font-medium text-white">Administrador</p>
              <p className="text-xs text-white/50">Dirección Comercial</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto p-8">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-navy" />
          </div>
        ) : (
          <>
            {activeTab === "dashboard" && <DashboardView data={data} onRefresh={mutate} />}
            {activeTab === "asesores"  && <AsesoresView  data={data} />}
            {activeTab === "zonas"     && <ZonasView     data={data} />}
            {activeTab === "exportar"  && <ExportarView />}
          </>
        )}
      </main>
    </div>
  )
}

// ── Dashboard ──────────────────────────────────────────────────────────────

function DashboardView({ data, onRefresh }: { data: any; onRefresh: () => void }) {
  if (!data) return null
  const t = data.totales

  const kpis = [
    { label: "Visitas Hoy",       value: String(t.visitas),                    up: true },
    { label: "Cumplimiento",      value: `${t.cumplimiento}%`,                 up: t.cumplimiento >= 70 },
    { label: "Asesores Activos",  value: `${t.asesores_activos}/${t.asesores}`, up: true },
    { label: "Alertas GPS",       value: String(data.alertas.length),          up: data.alertas.length === 0 },
  ]

  const top3 = [...(data.equipo ?? [])]
    .sort((a: any, b: any) => b.visitas_hoy - a.visitas_hoy)
    .slice(0, 3)

  const zonasBottom = [...(data.por_zona ?? [])]
    .sort((a: any, b: any) => a.cumplimiento - b.cumplimiento)
    .slice(0, 3)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard General</h1>
          <p className="text-sm text-gray-500">Resumen operativo del día — {data.fecha}</p>
        </div>
        <button onClick={onRefresh} className="text-xs text-navy hover:underline flex items-center gap-1">
          <TrendingUp className="h-3 w-3" /> Actualizar
        </button>
      </div>

      {/* KPIs */}
      <div className="mb-8 grid grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{k.label}</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">{k.value}</p>
            <div className={`mt-2 flex items-center gap-1 text-xs font-medium ${k.up ? "text-green-600" : "text-red-500"}`}>
              {k.up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              <span>{k.up ? "En rango" : "Requiere atención"}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Top 3 asesores */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 font-semibold text-gray-900">Top Asesores Hoy</h3>
          {top3.length === 0 ? (
            <p className="text-sm text-gray-400">Sin actividad registrada hoy</p>
          ) : (
            <div className="space-y-3">
              {top3.map((a: any, i: number) => (
                <div key={a.id} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-navy text-[10px] font-bold text-white">
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{a.nombre}</p>
                    <p className="text-xs text-gray-400">{a.zona || 'Sin zona'}</p>
                  </div>
                  <span className="text-sm font-bold text-gray-900">{a.visitas_hoy}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Zonas con menor cumplimiento */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 font-semibold text-gray-900">Zonas con Menor Cumplimiento</h3>
          {zonasBottom.length === 0 ? (
            <p className="text-sm text-gray-400">Sin datos de zonas</p>
          ) : (
            <div className="space-y-3">
              {zonasBottom.map((z: any) => (
                <div key={z.zona} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900">{z.zona}</p>
                      <span className={`text-sm font-bold ${
                        z.cumplimiento >= 80 ? "text-green-600" :
                        z.cumplimiento >= 60 ? "text-yellow-600" : "text-red-500"
                      }`}>{z.cumplimiento}%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={`h-full rounded-full ${
                          z.cumplimiento >= 80 ? "bg-green-500" :
                          z.cumplimiento >= 60 ? "bg-yellow-500" : "bg-red-500"
                        }`}
                        style={{ width: `${Math.min(z.cumplimiento, 100)}%` }}
                      />
                    </div>
                    <p className="mt-0.5 text-xs text-gray-400">{z.asesores} asesores</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Asesores ───────────────────────────────────────────────────────────────

function AsesoresView({ data }: { data: any }) {
  const [asesorSeleccionado, setAsesorSeleccionado] = useState<any>(null)

  if (asesorSeleccionado) {
    return <PerfilAsesorGerencia asesor={asesorSeleccionado} onBack={() => setAsesorSeleccionado(null)} />
  }

  const equipo = data?.equipo ?? []

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-gray-900">Asesores</h1>
      <p className="mb-6 text-sm text-gray-500">{equipo.length} asesores en la operación</p>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 text-left font-medium text-gray-500">Asesor</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Zona</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Visitas</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Cumplimiento</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Vendido</th>
            </tr>
          </thead>
          <tbody>
            {equipo.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No hay asesores registrados
                </td>
              </tr>
            ) : (
              equipo.map((a: any) => (
                <tr
                  key={a.id}
                  onClick={() => setAsesorSeleccionado(a)}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{a.nombre}</td>
                  <td className="px-4 py-3 text-gray-600">{a.zona || '—'}</td>
                  <td className="px-4 py-3 font-mono text-gray-900">
                    {a.visitas_hoy}/{a.clientes_asignados}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className={`h-full rounded-full ${
                            a.cumplimiento >= 80 ? "bg-green-500" :
                            a.cumplimiento >= 60 ? "bg-yellow-500" : "bg-red-500"
                          }`}
                          style={{ width: `${Math.min(a.cumplimiento, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-600">{a.cumplimiento}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-green-700 font-medium">{a.vendido_formato}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Perfil del Asesor (desde Gerencia) ────────────────────────────────────

function PerfilAsesorGerencia({ asesor, onBack }: { asesor: any; onBack: () => void }) {
  const fecha = fechaColombia()
  const { data, isLoading } = useSWR(
    `/api/resumen-dia?asesor_id=${asesor.id}&fecha=${fecha}`,
    fetcher,
    { refreshInterval: 60000 }
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
      ) : data?.metricas ? (
        <div className="space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Visitas hoy",    value: data.metricas.visitas.total,          color: "text-gray-900" },
              { label: "Validadas",      value: data.metricas.visitas.validadas,       color: "text-green-600" },
              { label: "Sospechosas",    value: data.metricas.visitas.fuera_rango,     color: "text-yellow-600" },
              { label: "Cumplimiento",   value: data.metricas.rutas.cumplimiento,      color: "text-navy" },
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

          {/* Historial */}
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
        <div className="text-center text-gray-400 py-8">Error cargando datos del asesor</div>
      )}
    </div>
  )
}

// ── Zonas ──────────────────────────────────────────────────────────────────

function ZonasView({ data }: { data: any }) {
  const zonas = data?.por_zona ?? []

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-gray-900">Zonas</h1>
      <p className="mb-6 text-sm text-gray-500">{zonas.length} zonas activas en la operación</p>

      {zonas.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-400">
          Sin datos de zonas hoy
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {zonas.map((z: any) => (
            <div key={z.zona} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">{z.zona}</h3>
                <Globe className="h-4 w-4 text-gray-400" />
              </div>
              <p className="mt-3 text-3xl font-bold text-gray-900">{z.cumplimiento}%</p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full ${
                    z.cumplimiento >= 80 ? "bg-green-500" :
                    z.cumplimiento >= 60 ? "bg-yellow-500" : "bg-red-500"
                  }`}
                  style={{ width: `${Math.min(z.cumplimiento, 100)}%` }}
                />
              </div>
              <div className="mt-3 flex justify-between text-xs text-gray-500">
                <span>{z.asesores} asesores</span>
                <span>{z.visitas} visitas hoy</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Exportar ───────────────────────────────────────────────────────────────

function ExportarView() {
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-gray-900">Exportar Datos</h1>
      <p className="mb-6 text-sm text-gray-500">Descarga reportes para nómina y cumplimiento</p>

      <div className="grid grid-cols-2 gap-4">
        {[
          { title: "Reporte de Nómina",   desc: "Asistencia y visitas validadas para cálculo de nómina",    format: "XLSX" },
          { title: "Cumplimiento TAT",     desc: "Porcentaje de cobertura por asesor y zona",                format: "PDF"  },
          { title: "Incidencias GPS",      desc: "Visitas sospechosas con detalle de coordenadas",           format: "CSV"  },
          { title: "Histórico Mensual",    desc: "Consolidado de visitas del mes corriente",                 format: "XLSX" },
        ].map((r) => (
          <div key={r.title} className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <Download className="h-6 w-6 text-navy" />
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600">{r.format}</span>
            </div>
            <h3 className="font-semibold text-gray-900">{r.title}</h3>
            <p className="mb-4 text-xs text-gray-500">{r.desc}</p>
            <button className="mt-auto rounded-lg bg-navy px-4 py-2 text-xs font-medium text-white hover:bg-navy-accent transition-colors">
              Descargar
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
