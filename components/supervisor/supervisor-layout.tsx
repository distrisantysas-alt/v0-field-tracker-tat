"use client"

// ============================================================================
// components/supervisor/supervisor-layout.tsx — MÓVIL FIRST
// ============================================================================

import { useState } from "react"
import useSWR from "swr"
import {
  Users, AlertTriangle, FileText, ChevronLeft, ChevronRight,
  Loader2, Check, TrendingUp
} from "lucide-react"

const fetcher = (url: string) => fetch(url).then(r => r.json())

function fechaColombia() {
  return new Date().toLocaleString('en-CA', { timeZone: 'America/Bogota' }).split(',')[0]
}
function getInitials(nombre: string) {
  return nombre.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
}

type TabId = "equipo" | "alertas" | "reportes"

interface SupervisorLayoutProps { onBack: () => void }

// ============================================================================
export function SupervisorLayout({ onBack }: SupervisorLayoutProps) {
  const [tab, setTab]   = useState<TabId>("equipo")
  const fecha = fechaColombia()

  const { data, isLoading, mutate } = useSWR(
    `/api/dashboard?fecha=${fecha}`,
    fetcher,
    { refreshInterval: 30000 }
  )

  const alertaCount = data?.alertas?.length ?? 0

  const tabs = [
    { id: "equipo"   as TabId, label: "Mi Equipo", icon: Users        },
    { id: "alertas"  as TabId, label: "Alertas",   icon: AlertTriangle },
    { id: "reportes" as TabId, label: "Reportes",  icon: FileText     },
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
          <h1 className="text-base font-bold text-white">Supervisor</h1>
        </div>
        <div className="ml-auto text-xs font-mono text-gray-500">{fecha}</div>
      </div>

      {/* Stats rápidas */}
      {data && (
        <div className="flex gap-4 border-b border-white/10 bg-dark-surface px-4 py-2">
          <div className="text-center">
            <p className="text-[10px] text-gray-500">Activos</p>
            <p className="text-sm font-bold text-white">{data.totales.asesores_activos}/{data.totales.asesores}</p>
          </div>
          <div className="border-l border-white/10" />
          <div className="text-center">
            <p className="text-[10px] text-gray-500">Visitas</p>
            <p className="text-sm font-bold text-white">{data.totales.visitas}</p>
          </div>
          <div className="border-l border-white/10" />
          <div className="text-center">
            <p className="text-[10px] text-gray-500">Cumplimiento</p>
            <p className={`text-sm font-bold ${data.totales.cumplimiento >= 80 ? 'text-success' : data.totales.cumplimiento >= 60 ? 'text-warning' : 'text-danger'}`}>
              {data.totales.cumplimiento}%
            </p>
          </div>
          <button onClick={() => mutate()} className="ml-auto flex items-center gap-1 text-[10px] text-gray-500 hover:text-white">
            <TrendingUp className="h-3 w-3" /> Actualizar
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-white/10 bg-dark-surface">
        {tabs.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative flex flex-1 items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors border-b-2 ${
                tab === t.id
                  ? "border-navy-accent text-navy-accent"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
              {t.id === "alertas" && alertaCount > 0 && (
                <span className="absolute right-2 top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
                  {alertaCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-navy-accent" />
          </div>
        ) : (
          <>
            {tab === "equipo"   && <EquipoView   data={data} />}
            {tab === "alertas"  && <AlertasView  data={data} />}
            {tab === "reportes" && <ReportesView />}
          </>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// MI EQUIPO
// ============================================================================
function EquipoView({ data }: { data: any }) {
  const [asesorSel, setAsesorSel] = useState<any>(null)
  const equipo = data?.equipo ?? []

  if (asesorSel) {
    return <PerfilAsesor asesor={asesorSel} onBack={() => setAsesorSel(null)} />
  }

  return (
    <div className="p-4 space-y-2">
      {equipo.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users className="h-10 w-10 text-gray-600 mb-3" />
          <p className="text-gray-400 text-sm">No hay asesores registrados</p>
        </div>
      ) : (
        equipo.map((a: any) => (
          <button
            key={a.id}
            onClick={() => setAsesorSel(a)}
            className="flex w-full items-center gap-3 rounded-xl bg-dark-surface border border-white/10 p-4 text-left hover:border-navy-accent/50 transition-all active:scale-[0.98]"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy-accent/20 text-sm font-bold text-navy-accent">
              {getInitials(a.nombre)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{a.nombre}</p>
              <p className="text-xs text-gray-500">{a.zona || 'Sin zona'}</p>
              <div className="mt-1.5 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    a.cumplimiento >= 80 ? 'bg-success' :
                    a.cumplimiento >= 60 ? 'bg-warning' : 'bg-danger'
                  }`}
                  style={{ width: `${Math.min(a.cumplimiento, 100)}%` }}
                />
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-bold text-white">{a.visitas_hoy}/{a.clientes_asignados}</p>
              <p className={`text-xs font-bold ${
                a.cumplimiento >= 80 ? 'text-success' :
                a.cumplimiento >= 60 ? 'text-warning' : 'text-danger'
              }`}>{a.cumplimiento}%</p>
            </div>
            <ChevronRight className="h-4 w-4 text-gray-600 shrink-0" />
          </button>
        ))
      )}
    </div>
  )
}

// ============================================================================
// PERFIL ASESOR
// ============================================================================
function PerfilAsesor({ asesor, onBack }: { asesor: any; onBack: () => void }) {
  const fecha = fechaColombia()
  const { data, isLoading } = useSWR(
    `/api/resumen-dia?asesor_id=${asesor.id}&fecha=${fecha}`,
    fetcher,
    { refreshInterval: 30000 }
  )

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-xl bg-dark-surface text-gray-400">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-base font-bold text-white">{asesor.nombre}</h2>
          <p className="text-xs text-gray-500">{asesor.zona || 'Sin zona'}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-navy-accent" />
        </div>
      ) : data ? (
        <div className="space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-dark-surface border border-white/10 p-4 text-center">
              <p className="text-xs text-gray-500">Visitas hoy</p>
              <p className="text-2xl font-bold text-white">{data.metricas?.visitas?.realizadas ?? 0}/{data.metricas?.visitas?.total ?? 0}</p>
            </div>
            <div className="rounded-xl bg-dark-surface border border-white/10 p-4 text-center">
              <p className="text-xs text-gray-500">Cumplimiento</p>
              <p className={`text-2xl font-bold ${(data.metricas?.visitas?.cumplimiento ?? 0) >= 80 ? 'text-success' : 'text-warning'}`}>
                {data.metricas?.visitas?.cumplimiento ?? 0}%
              </p>
            </div>
            <div className="rounded-xl bg-dark-surface border border-white/10 p-4 text-center">
              <p className="text-xs text-gray-500">Validadas</p>
              <p className="text-2xl font-bold text-success">{data.metricas?.visitas?.validadas ?? 0}</p>
            </div>
            <div className="rounded-xl bg-dark-surface border border-white/10 p-4 text-center">
              <p className="text-xs text-gray-500">Sospechosas</p>
              <p className="text-2xl font-bold text-warning">{data.metricas?.visitas?.sospechosas ?? 0}</p>
            </div>
          </div>

          {/* Ventas */}
          {(data.metricas?.pedidos?.efectivos ?? 0) > 0 && (
            <div className="rounded-xl bg-dark-surface border border-white/10 p-4">
              <p className="text-sm font-semibold text-white mb-3">Pedidos del día</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xs text-gray-500">Pedidos</p>
                  <p className="text-xl font-bold text-success">{data.metricas.pedidos.efectivos}</p>
                </div>
                <div className="border-x border-white/10">
                  <p className="text-xs text-gray-500">Total</p>
                  <p className="text-base font-bold text-white">{data.metricas.pedidos.total_vendido_formato}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Promedio</p>
                  <p className="text-base font-bold text-white">{data.metricas.pedidos.promedio_pedido_formato}</p>
                </div>
              </div>
            </div>
          )}

          {/* Historial */}
          {(data.visitas?.length ?? 0) > 0 && (
            <div className="rounded-xl bg-dark-surface border border-white/10 overflow-hidden">
              <p className="px-4 py-3 text-sm font-semibold text-white border-b border-white/10">
                Visitas del día
              </p>
              <div className="divide-y divide-white/5">
                {data.visitas.map((v: any) => (
                  <div key={v.id} className="flex items-center gap-3 px-4 py-3">
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${v.ubicacion?.validada ? 'bg-success/20' : 'bg-warning/20'}`}>
                      {v.ubicacion?.validada
                        ? <Check className="h-3.5 w-3.5 text-success" />
                        : <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white truncate">{v.cliente?.nombre}</p>
                      <p className="text-[10px] text-gray-500 truncate">{v.cliente?.direccion}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-mono text-gray-400">{v.hora}</p>
                      {v.pedido?.hubo_pedido && (
                        <p className="text-xs text-success font-medium">{v.pedido?.valor_formato}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center text-gray-400 py-8">Error cargando datos</div>
      )}
    </div>
  )
}

// ============================================================================
// ALERTAS
// ============================================================================
function AlertasView({ data }: { data: any }) {
  const alertas = data?.alertas ?? []

  return (
    <div className="p-4 space-y-3">
      <p className="text-xs text-gray-500">
        {alertas.length > 0 ? `${alertas.length} alertas requieren atención` : 'Sin alertas por ahora'}
      </p>

      {alertas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl bg-dark-surface border border-white/10">
          <Check className="h-10 w-10 text-success mb-3" />
          <p className="text-gray-400 text-sm">Todo en orden — sin visitas sospechosas hoy</p>
        </div>
      ) : (
        alertas.map((a: any) => (
          <div key={a.id} className="flex items-start gap-3 rounded-xl border border-warning/20 bg-warning/5 p-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning/20">
              <AlertTriangle className="h-4 w-4 text-warning" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">{a.asesor}</p>
              <p className="text-xs text-gray-400">{a.cliente} · {a.distancia_metros}m fuera del punto</p>
              <p className="text-[10px] text-gray-600">{a.direccion}</p>
            </div>
            <span className="shrink-0 text-xs font-mono text-gray-500">{a.hora}</span>
          </div>
        ))
      )}
    </div>
  )
}

// ============================================================================
// REPORTES
// ============================================================================
function ReportesView() {
  return (
    <div className="p-4 space-y-3">
      <p className="text-xs text-gray-500">Genera y descarga reportes de tu equipo</p>
      <div className="grid grid-cols-2 gap-3">
        {[
          { title: "Reporte Diario",   desc: "Visitas del día" },
          { title: "Reporte Semanal",  desc: "Rendimiento semanal" },
          { title: "Cumplimiento TAT", desc: "% visitados vs plan" },
          { title: "Incidencias",      desc: "Visitas sospechosas" },
        ].map(r => (
          <div key={r.title} className="flex flex-col rounded-xl bg-dark-surface border border-white/10 p-4">
            <FileText className="mb-2 h-6 w-6 text-navy-accent" />
            <p className="text-sm font-semibold text-white">{r.title}</p>
            <p className="text-xs text-gray-500 mb-3">{r.desc}</p>
            <button className="mt-auto rounded-lg bg-navy-accent px-3 py-2 text-xs font-semibold text-white hover:bg-navy-accent/80 transition-colors">
              Generar
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
