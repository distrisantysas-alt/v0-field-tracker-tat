"use client"

// ============================================================================
// components/supervisor/supervisor-layout.tsx — MÓVIL FIRST
// ✅ Todo lo anterior +
// ✅ Foto de visita visible en perfil de asesor
// ✅ Reporte por días
// ✅ Tab "Mapa" con ubicación en tiempo real de asesores
// ✅ Tab "Alertas" con gestión de clientes duplicados reportados
// ============================================================================

import { useState } from "react"
import dynamic from "next/dynamic"
import useSWR from "swr"
import {
  Users, AlertTriangle, FileText, ChevronLeft, ChevronRight,
  Loader2, Check, TrendingUp, Eye, ShoppingBag, DollarSign,
  ImageIcon, Camera, Map, Copy, X, Flag, Activity, Navigation, Gauge, MapPinOff
} from "lucide-react"

const MapaAsesores = dynamic(() => import('./supervisor-mapa-asesores'), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-7 w-7 animate-spin text-navy-accent" />
    </div>
  )
})

const fetcher = (url: string) => fetch(url).then(r => r.json())

function fechaColombia() {
  return new Date().toLocaleString('en-CA', { timeZone: 'America/Bogota' }).split(',')[0]
}
function getInitials(nombre: string) {
  return nombre.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
}
function formatFecha(fechaStr: string): string {
  const fecha = new Date(fechaStr + 'T00:00:00')
  return fecha.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })
}

type TabId = "equipo" | "mapa" | "alertas" | "seguimiento" | "reportes"

interface SupervisorLayoutProps { onBack: () => void }

// ============================================================================
export function SupervisorLayout({ onBack }: SupervisorLayoutProps) {
  const [tab, setTab] = useState<TabId>("equipo")
  const fecha = fechaColombia()

  const { data, isLoading, mutate } = useSWR(
    `/api/dashboard?fecha=${fecha}`,
    fetcher,
    { refreshInterval: 30000 }
  )

  const { data: duplicadosData } = useSWR(
    '/api/clientes/reportar-duplicado?estado=pendiente',
    fetcher,
    { refreshInterval: 60000 }
  )

  const alertaCount    = data?.alertas?.length ?? 0
  const duplicadoCount = duplicadosData?.reportes?.length ?? 0
  const totalAlertas   = alertaCount + duplicadoCount

  const tabs = [
    { id: "equipo"      as TabId, label: "Mi Equipo",   icon: Users         },
    { id: "mapa"        as TabId, label: "Mapa",        icon: Map           },
    { id: "alertas"     as TabId, label: "Alertas",     icon: AlertTriangle },
    { id: "seguimiento" as TabId, label: "Seguimiento", icon: Activity      },
    { id: "reportes"    as TabId, label: "Reportes",    icon: FileText      },
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
              {t.id === "alertas" && totalAlertas > 0 && (
                <span className="absolute right-2 top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
                  {totalAlertas}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && tab !== "mapa" && tab !== "alertas" && tab !== "seguimiento" ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-navy-accent" />
          </div>
        ) : (
          <>
            {tab === "equipo"      && <EquipoView      data={data} />}
            {tab === "mapa"        && <MapaAsesores />}
            {tab === "alertas"     && <AlertasView     data={data} duplicados={duplicadosData?.reportes ?? []} />}
            {tab === "seguimiento" && <SeguimientoView />}
            {tab === "reportes"    && <ReportesView    data={data} />}
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
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null)

  const hace7Dias = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)
    .toLocaleString('en-CA', { timeZone: 'America/Bogota' })
    .split(',')[0]

  const { data, isLoading } = useSWR(
    `/api/resumen-dia?asesor_id=${asesor.id}&fecha=${fecha}`,
    fetcher,
    { refreshInterval: 30000 }
  )

  const { data: semanaData } = useSWR(
    `/api/resumen-dia?asesor_id=${asesor.id}&fecha_inicio=${hace7Dias}&fecha_fin=${fecha}&rango=true`,
    fetcher,
    { refreshInterval: 60000 }
  )

  const reporteDias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
    const fechaStr = d.toLocaleString('en-CA', { timeZone: 'America/Bogota' }).split(',')[0]
    const diaData = semanaData?.por_dia?.find((x: any) => x.fecha?.toString().startsWith(fechaStr))
    return {
      fecha:           fechaStr,
      visitas:         diaData?.visitas  ?? 0,
      pedidos:         diaData?.pedidos  ?? 0,
      vendido:         diaData?.vendido  ?? 0,
      vendido_formato: diaData?.vendido_formato ?? '$0',
      esHoy:           fechaStr === fecha,
    }
  })

  return (
    <div className="p-4 space-y-4">
      {fotoAmpliada && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90" onClick={() => setFotoAmpliada(null)}>
          <div className="relative w-full max-w-lg px-4">
            <img src={fotoAmpliada} alt="Foto visita" className="w-full rounded-2xl object-contain max-h-[80vh]" />
            <button className="absolute top-2 right-6 flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white" onClick={() => setFotoAmpliada(null)}>✕</button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-xl bg-dark-surface text-gray-400">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-navy-accent/20 text-sm font-bold text-navy-accent shrink-0">
          {getInitials(asesor.nombre)}
        </div>
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
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-dark-surface border border-white/10 p-4 text-center">
              <p className="text-xs text-gray-500">Visitas hoy</p>
              <p className="text-2xl font-bold text-white">{data.metricas?.visitas?.total ?? 0}</p>
            </div>
            <div className="rounded-xl bg-dark-surface border border-white/10 p-4 text-center">
              <p className="text-xs text-gray-500">Validadas</p>
              <p className="text-2xl font-bold text-success">{data.metricas?.visitas?.validadas ?? 0}</p>
            </div>
            <div className="rounded-xl bg-dark-surface border border-white/10 p-4 text-center">
              <p className="text-xs text-gray-500">Pedidos</p>
              <p className="text-2xl font-bold text-success">{data.metricas?.pedidos?.efectivos ?? 0}</p>
            </div>
            <div className="rounded-xl bg-dark-surface border border-white/10 p-4 text-center">
              <p className="text-xs text-gray-500">Vendido hoy</p>
              <p className="text-base font-bold text-white">{data.metricas?.pedidos?.total_vendido_formato ?? '$0'}</p>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white mb-3">Últimos 7 días</h3>
            <div className="rounded-xl bg-dark-surface border border-white/10 overflow-hidden">
              <div className="grid grid-cols-4 gap-1 px-3 py-2 border-b border-white/10 bg-white/5">
                <p className="text-[10px] text-gray-500 font-medium">Día</p>
                <p className="text-[10px] text-gray-500 font-medium text-center"><Eye className="h-3 w-3 inline" /> Vis.</p>
                <p className="text-[10px] text-gray-500 font-medium text-center"><ShoppingBag className="h-3 w-3 inline" /> Ped.</p>
                <p className="text-[10px] text-gray-500 font-medium text-right"><DollarSign className="h-3 w-3 inline" /> Venta</p>
              </div>
              {reporteDias.map((dia, i) => (
                <div key={i} className={`grid grid-cols-4 gap-1 px-3 py-2.5 border-b border-white/5 last:border-0 ${dia.esHoy ? 'bg-navy-accent/10' : ''}`}>
                  <p className={`text-xs font-medium ${dia.esHoy ? 'text-navy-accent' : 'text-white'}`}>
                    {dia.esHoy ? 'Hoy' : formatFecha(dia.fecha)}
                  </p>
                  <p className={`text-sm font-bold text-center ${dia.visitas > 0 ? 'text-white' : 'text-gray-600'}`}>{dia.visitas}</p>
                  <p className={`text-sm font-bold text-center ${dia.pedidos > 0 ? 'text-success' : 'text-gray-600'}`}>{dia.pedidos}</p>
                  <p className={`text-xs font-bold text-right ${dia.vendido > 0 ? 'text-white' : 'text-gray-600'}`}>
                    {dia.vendido > 0 ? dia.vendido_formato : '—'}
                  </p>
                </div>
              ))}
              <div className="grid grid-cols-4 gap-1 px-3 py-2.5 bg-white/5 border-t border-white/10">
                <p className="text-xs font-bold text-white">Total</p>
                <p className="text-sm font-bold text-center text-white">{semanaData?.totales?.visitas ?? 0}</p>
                <p className="text-sm font-bold text-center text-success">{semanaData?.totales?.pedidos ?? 0}</p>
                <p className="text-xs font-bold text-right text-white">{semanaData?.totales?.vendido_formato ?? '$0'}</p>
              </div>
            </div>
          </div>

          {(data.visitas?.length ?? 0) > 0 && (
            <div className="rounded-xl bg-dark-surface border border-white/10 overflow-hidden">
              <p className="px-4 py-3 text-sm font-semibold text-white border-b border-white/10">Visitas de hoy</p>
              <div className="divide-y divide-white/5">
                {data.visitas.map((v: any) => (
                  <div key={v.id} className="px-4 py-3 space-y-2">
                    <div className="flex items-center gap-3">
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
                        {v.sin_gps && (
                          <span className="mt-1 inline-block rounded-full bg-danger/20 text-danger text-[9px] font-bold px-1.5 py-0.5">
                            SIN GPS
                          </span>
                        )}
                      </div>
                    </div>
                    {v.foto_url ? (
                      <button onClick={() => setFotoAmpliada(v.foto_url)} className="w-full rounded-xl overflow-hidden border border-white/10 relative group">
                        <img src={v.foto_url} alt="Foto visita" className="w-full object-cover h-32" />
                        <div className="absolute bottom-2 right-2 bg-black/50 rounded-lg px-2 py-0.5">
                          <p className="text-[10px] text-white">Toca para ampliar</p>
                        </div>
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/5 px-3 py-2">
                        <Camera className="h-3.5 w-3.5 text-gray-600 shrink-0" />
                        <p className="text-[10px] text-gray-600">Sin foto en esta visita</p>
                      </div>
                    )}
                    {v.notas && <p className="text-[10px] text-gray-500 italic px-1">"{v.notas}"</p>}
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
// ALERTAS — visitas sospechosas + clientes duplicados
// ============================================================================
function AlertasView({ data, duplicados }: { data: any; duplicados: any[] }) {
  const alertas = data?.alertas ?? []
  const { mutate } = useSWR('/api/clientes/reportar-duplicado?estado=pendiente', fetcher)
  const [resolviendo, setResolviendo] = useState<string | null>(null)

  const handleResolver = async (reporteId: string, accion: string) => {
    setResolviendo(reporteId)
    try {
      await fetch('/api/clientes/reportar-duplicado', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reporte_id: reporteId, accion }),
      })
      mutate()
    } catch {}
    finally { setResolviendo(null) }
  }

  return (
    <div className="p-4 space-y-4">

      {/* Duplicados reportados */}
      {duplicados.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-white mb-2 flex items-center gap-1.5">
            <Copy className="h-3.5 w-3.5 text-warning" />
            Duplicados reportados
            <span className="rounded-full bg-warning/20 text-warning text-[10px] font-bold px-2 py-0.5">{duplicados.length}</span>
          </p>
          <div className="space-y-3">
            {duplicados.map((r: any) => (
              <div key={r.id} className="rounded-xl border border-warning/20 bg-warning/5 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <Flag className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{r.cliente_nombre}</p>
                    <p className="text-xs text-gray-400">{r.cliente_direccion}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">Reportado por: {r.asesor_nombre}</p>
                    {r.nota && <p className="text-xs text-gray-400 italic mt-1">"{r.nota}"</p>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleResolver(r.id, 'confirmar_duplicado')}
                    disabled={resolviendo === r.id}
                    className="flex-1 rounded-lg bg-danger/20 border border-danger/30 py-2 text-xs font-semibold text-danger disabled:opacity-50 active:scale-95"
                  >
                    {resolviendo === r.id ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> : '🗑 Eliminar cliente'}
                  </button>
                  <button
                    onClick={() => handleResolver(r.id, 'es_homonimo')}
                    disabled={resolviendo === r.id}
                    className="flex-1 rounded-lg bg-warning/20 border border-warning/30 py-2 text-xs font-semibold text-warning disabled:opacity-50 active:scale-95"
                  >
                    👥 Es homónimo
                  </button>
                  <button
                    onClick={() => handleResolver(r.id, 'descartar')}
                    disabled={resolviendo === r.id}
                    className="flex-1 rounded-lg bg-white/5 border border-white/10 py-2 text-xs font-semibold text-gray-400 disabled:opacity-50 active:scale-95"
                  >
                    <X className="h-3 w-3 mx-auto" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Visitas sospechosas */}
      <div>
        {alertas.length > 0 && (
          <p className="text-xs font-semibold text-white mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-warning" />
            Visitas sospechosas
          </p>
        )}
        {alertas.length === 0 && duplicados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl bg-dark-surface border border-white/10">
            <Check className="h-10 w-10 text-success mb-3" />
            <p className="text-gray-400 text-sm">Todo en orden — sin alertas hoy</p>
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
    </div>
  )
}

// ============================================================================
// SEGUIMIENTO — señales informativas, todo de solo lectura, nada bloquea nada
// ============================================================================
function SeguimientoView() {
  const [sub, setSub] = useState<"reubicaciones" | "distancia_cero" | "velocidad" | "fuera_rango">("reubicaciones")

  const { data: historial, isLoading: loadHist } = useSWR(
    '/api/admin/gps-historial?limit=50',
    fetcher
  )
  const { data: seguimiento, isLoading: loadSeg } = useSWR(
    '/api/admin/seguimiento',
    fetcher,
    { refreshInterval: 60000 }
  )

  const subTabs = [
    { id: "reubicaciones" as const, label: "Reubicaciones GPS", count: historial?.historial?.length },
    { id: "distancia_cero" as const, label: "Distancia 0.00",   count: seguimiento?.distancia_cero_por_asesor?.length },
    { id: "velocidad"      as const, label: "Velocidad",        count: seguimiento?.velocidad_sospechosa?.length },
    { id: "fuera_rango"    as const, label: "Pedidos fuera de rango", count: seguimiento?.pedidos_fuera_de_rango?.length },
  ]

  function formatHora(ts: string) {
    return new Date(ts).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  }
  function formatMonto(v: number) {
    return `$${Math.round(Number(v)).toLocaleString('es-CO')}`
  }

  const cargando = loadHist || loadSeg

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-start gap-2 rounded-xl bg-navy-accent/10 border border-navy-accent/20 p-3">
        <Activity className="h-4 w-4 text-navy-accent mt-0.5 shrink-0" />
        <p className="text-xs text-gray-300">
          Señales de contexto para conversar con el asesor si ves un patrón raro. Nada de esto bloquea ni aprueba/rechaza registros.
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {subTabs.map(t => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className={`shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              sub === t.id ? "bg-navy-accent text-white" : "bg-dark-surface text-gray-400 border border-white/10"
            }`}
          >
            {t.label}
            {typeof t.count === 'number' && t.count > 0 && (
              <span className="rounded-full bg-white/20 px-1.5 text-[10px] font-bold">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {cargando ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-navy-accent" />
        </div>
      ) : (
        <>
          {sub === "reubicaciones" && (
            <div className="space-y-2">
              {(historial?.historial ?? []).length === 0 ? (
                <EmptySeguimiento icon={Navigation} texto="Sin reubicaciones de GPS registradas" />
              ) : (
                historial.historial.map((h: any) => (
                  <div key={h.id} className="rounded-xl bg-dark-surface border border-white/10 p-3 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{h.cliente_nombre}</p>
                        <p className="text-[10px] text-gray-500">Movido por {h.asesor_nombre}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-navy-accent/20 text-navy-accent text-[10px] font-bold px-2 py-0.5">
                        {h.distancia_movida_metros != null ? `${Math.round(h.distancia_movida_metros).toLocaleString('es-CO')}m` : 'nuevo'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-gray-500">
                      <span>{h.motivo === 'no_especificado' ? 'Sin motivo especificado' : h.motivo.replaceAll('_', ' ')}</span>
                      <span className="font-mono">{formatHora(h.timestamp)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {sub === "distancia_cero" && (
            <div className="space-y-2">
              {(seguimiento?.distancia_cero_por_asesor ?? []).length === 0 ? (
                <EmptySeguimiento icon={MapPinOff} texto="Sin visitas en distancia 0.00 en los últimos 30 días" />
              ) : (
                seguimiento.distancia_cero_por_asesor.map((d: any) => (
                  <div key={d.asesor_id} className="flex items-center gap-3 rounded-xl bg-dark-surface border border-white/10 p-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-accent/20 text-xs font-bold text-navy-accent">
                      {getInitials(d.asesor_nombre)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{d.asesor_nombre}</p>
                      <p className="text-[10px] text-gray-500">últimos 30 días</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-warning">{d.total_distancia_cero}</p>
                      {d.con_pedido > 0 && <p className="text-[10px] text-gray-500">{d.con_pedido} con pedido</p>}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {sub === "velocidad" && (
            <div className="space-y-2">
              {(seguimiento?.velocidad_sospechosa ?? []).length === 0 ? (
                <EmptySeguimiento icon={Gauge} texto="Sin visitas con velocidad implícita sospechosa" />
              ) : (
                seguimiento.velocidad_sospechosa.map((v: any) => (
                  <div key={v.id} className="rounded-xl bg-dark-surface border border-white/10 p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{v.asesor_nombre}</p>
                      <p className="text-[10px] text-gray-500 truncate">{v.cliente_nombre}</p>
                    </div>
                    <span className="shrink-0 font-mono text-[10px] text-gray-500">{formatHora(v.timestamp)}</span>
                  </div>
                ))
              )}
            </div>
          )}

          {sub === "fuera_rango" && (
            <div className="space-y-2">
              {(seguimiento?.pedidos_fuera_de_rango ?? []).length === 0 ? (
                <EmptySeguimiento icon={AlertTriangle} texto="Sin pedidos registrados fuera de rango" />
              ) : (
                seguimiento.pedidos_fuera_de_rango.map((p: any) => (
                  <div key={p.id} className="rounded-xl border border-warning/20 bg-warning/5 p-3 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{p.asesor_nombre}</p>
                        <p className="text-[10px] text-gray-500 truncate">{p.cliente_nombre} · {Math.round(p.distancia_metros)}m fuera</p>
                      </div>
                      <span className="shrink-0 text-sm font-bold text-warning">{formatMonto(p.valor_pedido)}</span>
                    </div>
                    <p className="text-[10px] text-gray-600 font-mono">{formatHora(p.timestamp)}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function EmptySeguimiento({ icon: Icon, texto }: { icon: any; texto: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center rounded-xl bg-dark-surface border border-white/10">
      <Icon className="h-10 w-10 text-gray-600 mb-3" />
      <p className="text-gray-400 text-sm">{texto}</p>
    </div>
  )
}

// ============================================================================
// REPORTES
// ============================================================================
function ReportesView({ data }: { data: any }) {
  const fecha = fechaColombia()
  const equipo = data?.equipo ?? []

  const descargarReporteDiario = () => {
    if (!equipo.length) return
    const filas = [
      ['Asesor', 'Zona', 'Visitas hoy', 'Clientes asignados', 'Cumplimiento %'],
      ...equipo.map((a: any) => [
        a.nombre, a.zona || '—', a.visitas_hoy, a.clientes_asignados, `${a.cumplimiento}%`
      ])
    ]
    descargarCSV(filas, `reporte-diario-${fecha}.csv`)
  }

  return (
    <div className="p-4 space-y-3">
      <p className="text-xs text-gray-500">Genera y descarga reportes de tu equipo</p>
      <div className="grid grid-cols-2 gap-3">
        <button onClick={descargarReporteDiario} className="flex flex-col rounded-xl bg-dark-surface border border-white/10 p-4 text-left hover:border-navy-accent/50 transition-all active:scale-[0.98]">
          <FileText className="mb-2 h-6 w-6 text-navy-accent" />
          <p className="text-sm font-semibold text-white">Reporte Diario</p>
          <p className="text-xs text-gray-500 mb-3">Visitas del día</p>
          <span className="mt-auto rounded-lg bg-navy-accent px-3 py-2 text-xs font-semibold text-white text-center">Descargar CSV</span>
        </button>
        <div className="flex flex-col rounded-xl bg-dark-surface border border-white/10 p-4 opacity-50">
          <FileText className="mb-2 h-6 w-6 text-gray-500" />
          <p className="text-sm font-semibold text-white">Reporte Semanal</p>
          <p className="text-xs text-gray-500 mb-3">Próximamente</p>
          <span className="mt-auto rounded-lg bg-gray-700 px-3 py-2 text-xs font-semibold text-gray-400 text-center">Pronto</span>
        </div>
        <div className="flex flex-col rounded-xl bg-dark-surface border border-white/10 p-4 opacity-50">
          <FileText className="mb-2 h-6 w-6 text-gray-500" />
          <p className="text-sm font-semibold text-white">Cumplimiento TAT</p>
          <p className="text-xs text-gray-500 mb-3">Próximamente</p>
          <span className="mt-auto rounded-lg bg-gray-700 px-3 py-2 text-xs font-semibold text-gray-400 text-center">Pronto</span>
        </div>
        <div className="flex flex-col rounded-xl bg-dark-surface border border-white/10 p-4 opacity-50">
          <FileText className="mb-2 h-6 w-6 text-gray-500" />
          <p className="text-sm font-semibold text-white">Incidencias</p>
          <p className="text-xs text-gray-500 mb-3">Próximamente</p>
          <span className="mt-auto rounded-lg bg-gray-700 px-3 py-2 text-xs font-semibold text-gray-400 text-center">Pronto</span>
        </div>
      </div>
    </div>
  )
}

// ── Helper CSV ────────────────────────────────────────────────────────────────
function descargarCSV(filas: any[][], nombreArchivo: string) {
  const contenido = filas
    .map(fila => fila.map(celda => `"${String(celda).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob(['\uFEFF' + contenido], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = nombreArchivo; a.click()
  URL.revokeObjectURL(url)
}
