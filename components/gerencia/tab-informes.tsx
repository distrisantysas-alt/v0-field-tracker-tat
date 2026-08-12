"use client"

// ============================================================================
// components/gerencia/tab-informes.tsx
// Tab de Informes para GerenciaLayout
// Agregar en gerencia-layout.tsx:
//   1. import { TabInformes } from "./tab-informes"
//   2. En el type Tab: agregar "informes"
//   3. En el array tabs: { id: "informes" as Tab, label: "Informes", icon: BarChart2 }
//   4. En el bloque de contenido: {tab === "informes" && <TabInformes />}
// ============================================================================

import { useState, useCallback } from "react"
import useSWR from "swr"
import {
  TrendingUp, Users, AlertTriangle, ChevronUp, ChevronDown,
  Download, RefreshCw, BarChart2
} from "lucide-react"
import { fetcher } from "@/lib/fetcher"

// ── Helpers ──────────────────────────────────────────────────────────────────
function hoy(): string {
  return new Date().toLocaleString("en-CA", { timeZone: "America/Bogota" }).split(",")[0]
}
function inicioMes(): string {
  return hoy().slice(0, 7) + "-01"
}
function cop(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-CO")
}

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface ResumenAsesor {
  asesor_id: number
  asesor_nombre: string
  zona: string
  total_visitas: number
  clientes_unicos: number
  visitas_validadas: number
  pedidos: number
  total_vendido: number
  promedio_pedido: number
  tasa_conversion: number
}
interface ClienteVisitado {
  cliente_id: number
  codigo: string
  cliente_nombre: string
  direccion: string
  asesor_nombre: string
  zona: string
  veces_visitado: number
  veces_con_pedido: number
  valor_total: number
  ultima_visita: string
  estado: "comprador" | "visitado_sin_compra"
}
interface ClienteNoVisitado {
  cliente_id: number
  codigo: string
  cliente_nombre: string
  direccion: string
  asesor_nombre: string
  zona: string
  ultima_visita_historica: string | null
  dias_sin_visita: number | null
}

// ── Componente principal ──────────────────────────────────────────────────────
export function TabInformes() {
  const [fechaInicio, setFechaInicio] = useState(inicioMes())
  const [fechaFin,    setFechaFin]    = useState(hoy())
  const [asesorId,    setAsesorId]    = useState("")
  const [innerTab,    setInnerTab]    = useState<"resumen" | "visitados" | "no_visitados">("resumen")
  const [sortCol,     setSortCol]     = useState("")
  const [sortDir,     setSortDir]     = useState<"asc" | "desc">("desc")

  const { data: asesoresData } = useSWR("/api/admin/asesores", fetcher)

  const buildURL = useCallback((tipo: string) => {
    const p = new URLSearchParams({ tipo, fecha_inicio: fechaInicio, fecha_fin: fechaFin })
    if (asesorId) p.append("asesor_id", asesorId)
    return `/api/admin/informes?${p.toString()}`
  }, [fechaInicio, fechaFin, asesorId])

  const { data: resumenData,   isLoading: loadR, mutate: refR } = useSWR(buildURL("resumen"),           fetcher)
  const { data: visitadosData, isLoading: loadV, mutate: refV } = useSWR(buildURL("clientes_visitados"), fetcher)
  const { data: noVisitData,   isLoading: loadN, mutate: refN } = useSWR(buildURL("no_visitados"),       fetcher)

  const resumen:     ResumenAsesor[]     = resumenData?.data   ?? []
  const visitados:   ClienteVisitado[]   = visitadosData?.data ?? []
  const noVisitados: ClienteNoVisitado[] = noVisitData?.data   ?? []

  // KPIs ejecutivos
  const totales = resumen.reduce(
    (acc, r) => ({
      visitas:  acc.visitas  + r.total_visitas,
      pedidos:  acc.pedidos  + r.pedidos,
      vendido:  acc.vendido  + r.total_vendido,
      clientes: acc.clientes + r.clientes_unicos,
    }),
    { visitas: 0, pedidos: 0, vendido: 0, clientes: 0 }
  )
  const convGlobal = totales.visitas > 0
    ? Math.round((totales.pedidos / totales.visitas) * 100)
    : 0

  // Ordenamiento
  function sorted<T extends Record<string, any>>(arr: T[]): T[] {
    if (!sortCol) return arr
    return [...arr].sort((a, b) => {
      const va = a[sortCol] ?? 0
      const vb = b[sortCol] ?? 0
      if (typeof va === "string") return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va)
      return sortDir === "asc" ? va - vb : vb - va
    })
  }
  function toggleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortCol(col); setSortDir("desc") }
  }

  function SortIcon({ col }: { col: string }) {
    if (sortCol !== col) return <ChevronDown className="h-2.5 w-2.5 inline ml-0.5 opacity-30" />
    return sortDir === "asc"
      ? <ChevronUp   className="h-2.5 w-2.5 inline ml-0.5 text-navy-accent" />
      : <ChevronDown className="h-2.5 w-2.5 inline ml-0.5 text-navy-accent" />
  }

  function setRango(r: "hoy" | "semana" | "mes") {
    const h = hoy()
    if (r === "hoy") { setFechaInicio(h); setFechaFin(h) }
    else if (r === "mes") { setFechaInicio(h.slice(0, 7) + "-01"); setFechaFin(h) }
    else {
      const d = new Date()
      d.setDate(d.getDate() - 6)
      setFechaInicio(d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" }))
      setFechaFin(h)
    }
  }

  // Exportar CSV
  function exportarCSV() {
    const filas: string[][] = []
    if (innerTab === "resumen") {
      filas.push(["Asesor","Zona","Visitas","Clientes únicos","Validadas","Pedidos","Vendido","Conversión"])
      sorted(resumen).forEach(r => filas.push([
        r.asesor_nombre, r.zona,
        String(r.total_visitas), String(r.clientes_unicos),
        String(r.visitas_validadas), String(r.pedidos),
        String(r.total_vendido), Math.round(r.tasa_conversion) + "%",
      ]))
    } else if (innerTab === "visitados") {
      filas.push(["Código","Cliente","Asesor","Zona","Visitas","Con pedido","Valor total","Última visita","Estado"])
      sorted(visitados).forEach(c => filas.push([
        c.codigo, c.cliente_nombre, c.asesor_nombre, c.zona,
        String(c.veces_visitado), String(c.veces_con_pedido),
        String(c.valor_total), c.ultima_visita, c.estado,
      ]))
    } else {
      filas.push(["Código","Cliente","Asesor","Zona","Última visita","Días sin visita"])
      sorted(noVisitados).forEach(c => filas.push([
        c.codigo, c.cliente_nombre, c.asesor_nombre, c.zona,
        c.ultima_visita_historica ?? "Nunca",
        c.dias_sin_visita !== null ? String(c.dias_sin_visita) : "N/A",
      ]))
    }
    const csv = filas.map(f => f.map(v => `"${v}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `informe_${innerTab}_${fechaInicio}_${fechaFin}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const isLoading = loadR || loadV || loadN

  return (
    <div className="p-4 space-y-3">

      {/* Filtros */}
      <div className="rounded-xl bg-dark-surface border border-white/10 p-4">
        <div className="grid grid-cols-2 gap-3">

          <div>
            <label className="block text-[10px] text-gray-500 mb-1">Desde</label>
            <input
              type="date"
              value={fechaInicio}
              onChange={e => setFechaInicio(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-dark-bg px-3 py-2 text-xs text-white focus:border-navy-accent focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[10px] text-gray-500 mb-1">Hasta</label>
            <input
              type="date"
              value={fechaFin}
              onChange={e => setFechaFin(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-dark-bg px-3 py-2 text-xs text-white focus:border-navy-accent focus:outline-none"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-[10px] text-gray-500 mb-1">Asesor</label>
            <select
              value={asesorId}
              onChange={e => { setAsesorId(e.target.value); setSortCol("") }}
              className="w-full rounded-xl border border-white/10 bg-dark-bg px-3 py-2 text-xs text-white focus:border-navy-accent focus:outline-none"
            >
              <option value="">Todos los asesores</option>
              {asesoresData?.asesores?.map((a: any) => (
                <option key={a.id} value={a.id}>{a.nombre}</option>
              ))}
            </select>
          </div>

          <div className="col-span-2">
            <label className="block text-[10px] text-gray-500 mb-1.5">Periodo rápido</label>
            <div className="flex gap-2">
              {(["hoy", "semana", "mes"] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setRango(r)}
                  className="flex-1 rounded-xl border border-white/10 bg-dark-bg py-2 text-xs text-gray-400 hover:text-white hover:border-navy-accent/40 transition-colors capitalize"
                >
                  {r === "hoy" ? "Hoy" : r === "semana" ? "Semana" : "Este mes"}
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2.5">
        <KpiCard label="Total visitas"   value={totales.visitas.toLocaleString("es-CO")}  color="text-white" />
        <KpiCard label="Clientes únicos" value={totales.clientes.toLocaleString("es-CO")} color="text-navy-accent" />
        <KpiCard label="Pedidos"         value={totales.pedidos.toLocaleString("es-CO")}  color="text-success" sub={`Conversión ${convGlobal}%`} />
        <KpiCard label="Ventas totales"  value={cop(totales.vendido)}                     color="text-success" />
      </div>

      {/* Panel inner tabs + tablas */}
      <div className="rounded-xl bg-dark-surface border border-white/10 overflow-hidden">

        {/* Header con tabs y acciones */}
        <div className="flex items-center justify-between border-b border-white/10">
          <div className="flex overflow-x-auto">
            {([
              { id: "resumen"      as const, icon: TrendingUp,    label: "Por asesor"   },
              { id: "visitados"    as const, icon: Users,         label: "Visitados"    },
              { id: "no_visitados" as const, icon: AlertTriangle, label: `Sin visitar (${noVisitados.length})` },
            ]).map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => { setInnerTab(id); setSortCol("") }}
                className={`flex shrink-0 items-center gap-1.5 px-3 py-3 text-xs font-medium border-b-2 transition-colors ${
                  innerTab === id
                    ? "border-navy-accent text-navy-accent"
                    : "border-transparent text-gray-500 hover:text-gray-300"
                }`}
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 pr-3 shrink-0">
            <button
              onClick={() => { refR(); refV(); refN() }}
              className="p-2 text-gray-500 hover:text-white transition-colors"
              title="Actualizar"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={exportarCSV}
              className="p-2 text-gray-500 hover:text-navy-accent transition-colors"
              title="Exportar CSV"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* ── Tabla: Por asesor ── */}
        {innerTab === "resumen" && (
          <div className="overflow-x-auto">
            {loadR ? <Spinner /> : (
              <table className="w-full text-xs">
                <thead className="bg-white/[0.02]">
                  <tr>
                    <Th label="Asesor"          col="asesor_nombre"    onSort={toggleSort}><SortIcon col="asesor_nombre" /></Th>
                    <Th label="Zona"            col="zona"             onSort={toggleSort}><SortIcon col="zona" /></Th>
                    <Th label="Visitas"         col="total_visitas"    onSort={toggleSort}><SortIcon col="total_visitas" /></Th>
                    <Th label="Clientes"        col="clientes_unicos"  onSort={toggleSort}><SortIcon col="clientes_unicos" /></Th>
                    <Th label="Pedidos"         col="pedidos"          onSort={toggleSort}><SortIcon col="pedidos" /></Th>
                    <Th label="Conversión"      col="tasa_conversion"  onSort={toggleSort}><SortIcon col="tasa_conversion" /></Th>
                    <Th label="Vendido"         col="total_vendido"    onSort={toggleSort}><SortIcon col="total_vendido" /></Th>
                    <Th label="Prom. pedido"    col="promedio_pedido"  onSort={toggleSort}><SortIcon col="promedio_pedido" /></Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {sorted(resumen).map(r => (
                    <tr key={r.asesor_id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-3 py-2.5 text-white font-medium">{r.asesor_nombre}</td>
                      <td className="px-3 py-2.5 text-gray-500">{r.zona || "—"}</td>
                      <td className="px-3 py-2.5 text-white">{r.total_visitas}</td>
                      <td className="px-3 py-2.5 text-navy-accent">{r.clientes_unicos}</td>
                      <td className="px-3 py-2.5 text-white">{r.pedidos}</td>
                      <td className="px-3 py-2.5">
                        <span className={`font-medium ${
                          r.tasa_conversion >= 50 ? "text-success"
                          : r.tasa_conversion >= 25 ? "text-warning"
                          : "text-danger"
                        }`}>
                          {Math.round(r.tasa_conversion)}%
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-success font-medium">{cop(r.total_vendido)}</td>
                      <td className="px-3 py-2.5 text-gray-400">{cop(r.promedio_pedido)}</td>
                    </tr>
                  ))}
                  {resumen.length === 0 && <EmptyRow cols={8} />}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Tabla: Clientes visitados ── */}
        {innerTab === "visitados" && (
          <>
            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06] text-xs">
              <span className="text-gray-500">
                <span className="text-white font-medium">{visitados.length}</span> visitados
              </span>
              <span className="text-gray-700">·</span>
              <span className="text-gray-500">
                <span className="text-success font-medium">{visitados.filter(c => c.estado === "comprador").length}</span> compraron
              </span>
              <span className="text-gray-700">·</span>
              <span className="text-gray-500">
                <span className="text-warning font-medium">{visitados.filter(c => c.estado !== "comprador").length}</span> sin compra
              </span>
            </div>
            <div className="overflow-x-auto">
              {loadV ? <Spinner /> : (
                <table className="w-full text-xs">
                  <thead className="bg-white/[0.02]">
                    <tr>
                      <Th label="Código"       col="codigo"           onSort={toggleSort}><SortIcon col="codigo" /></Th>
                      <Th label="Cliente"      col="cliente_nombre"   onSort={toggleSort}><SortIcon col="cliente_nombre" /></Th>
                      <Th label="Asesor"       col="asesor_nombre"    onSort={toggleSort}><SortIcon col="asesor_nombre" /></Th>
                      <Th label="Visitas"      col="veces_visitado"   onSort={toggleSort}><SortIcon col="veces_visitado" /></Th>
                      <Th label="Con pedido"   col="veces_con_pedido" onSort={toggleSort}><SortIcon col="veces_con_pedido" /></Th>
                      <Th label="Valor total"  col="valor_total"      onSort={toggleSort}><SortIcon col="valor_total" /></Th>
                      <Th label="Última visita" col="ultima_visita"   onSort={toggleSort}><SortIcon col="ultima_visita" /></Th>
                      <Th label="Estado"       col="estado"           onSort={toggleSort}><SortIcon col="estado" /></Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {sorted(visitados).map(c => (
                      <tr key={c.cliente_id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-3 py-2.5 font-mono text-[10px] text-gray-500">{c.codigo}</td>
                        <td className="px-3 py-2.5">
                          <p className="text-white font-medium">{c.cliente_nombre}</p>
                          {c.direccion && <p className="text-[10px] text-gray-600 mt-0.5">{c.direccion}</p>}
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="text-gray-300">{c.asesor_nombre}</p>
                          <p className="text-[10px] text-gray-600">{c.zona}</p>
                        </td>
                        <td className="px-3 py-2.5 text-white text-center">{c.veces_visitado}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={c.veces_con_pedido > 0 ? "text-success font-medium" : "text-gray-600"}>
                            {c.veces_con_pedido}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-success font-medium">{cop(c.valor_total)}</td>
                        <td className="px-3 py-2.5 text-gray-500 text-[10px]">{c.ultima_visita}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            c.estado === "comprador"
                              ? "bg-success/15 text-success"
                              : "bg-warning/15 text-warning"
                          }`}>
                            {c.estado === "comprador" ? "Comprador" : "Sin compra"}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {visitados.length === 0 && <EmptyRow cols={8} />}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* ── Tabla: Sin visitar ── */}
        {innerTab === "no_visitados" && (
          <>
            {noVisitados.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-danger/5 border-b border-danger/10">
                <AlertTriangle className="h-3.5 w-3.5 text-danger shrink-0" />
                <p className="text-xs text-danger/80">
                  <span className="text-white font-medium">{noVisitados.length}</span> clientes activos sin visita en el periodo. Considera reasignar.
                </p>
              </div>
            )}
            <div className="overflow-x-auto">
              {loadN ? <Spinner /> : (
                <table className="w-full text-xs">
                  <thead className="bg-white/[0.02]">
                    <tr>
                      <Th label="Código"        col="codigo"                   onSort={toggleSort}><SortIcon col="codigo" /></Th>
                      <Th label="Cliente"       col="cliente_nombre"           onSort={toggleSort}><SortIcon col="cliente_nombre" /></Th>
                      <Th label="Asesor"        col="asesor_nombre"            onSort={toggleSort}><SortIcon col="asesor_nombre" /></Th>
                      <Th label="Zona"          col="zona"                     onSort={toggleSort}><SortIcon col="zona" /></Th>
                      <Th label="Última visita" col="ultima_visita_historica"  onSort={toggleSort}><SortIcon col="ultima_visita_historica" /></Th>
                      <Th label="Días sin visita" col="dias_sin_visita"        onSort={toggleSort}><SortIcon col="dias_sin_visita" /></Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {sorted(noVisitados).map(c => {
                      const dias = c.dias_sin_visita
                      const colorDias = dias === null ? "text-gray-600"
                        : dias > 30 ? "text-danger"
                        : dias > 14 ? "text-warning"
                        : "text-gray-400"
                      return (
                        <tr key={c.cliente_id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-3 py-2.5 font-mono text-[10px] text-gray-500">{c.codigo}</td>
                          <td className="px-3 py-2.5">
                            <p className="text-white font-medium">{c.cliente_nombre}</p>
                            {c.direccion && <p className="text-[10px] text-gray-600 mt-0.5">{c.direccion}</p>}
                          </td>
                          <td className="px-3 py-2.5 text-gray-300">{c.asesor_nombre || "—"}</td>
                          <td className="px-3 py-2.5 text-gray-500">{c.zona || "—"}</td>
                          <td className="px-3 py-2.5 text-[10px] text-gray-500">
                            {c.ultima_visita_historica ?? (
                              <span className="text-danger">Nunca visitado</span>
                            )}
                          </td>
                          <td className={`px-3 py-2.5 font-medium ${colorDias}`}>
                            {dias !== null ? `${dias}d` : "—"}
                          </td>
                        </tr>
                      )
                    })}
                    {noVisitados.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-8 text-center text-success text-xs">
                          Todos los clientes fueron visitados en el periodo
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

      </div>
    </div>
  )
}

// ── Subcomponentes ────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color: string
}) {
  return (
    <div className="rounded-xl bg-dark-surface border border-white/10 p-3">
      <p className="text-[10px] text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-600 mt-0.5">{sub}</p>}
    </div>
  )
}

function Th({ label, col, onSort, children }: {
  label: string; col: string; onSort: (col: string) => void; children?: React.ReactNode
}) {
  return (
    <th
      onClick={() => onSort(col)}
      className="px-3 py-2.5 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-300 whitespace-nowrap select-none"
    >
      {label}{children}
    </th>
  )
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-10">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-navy-accent border-t-transparent" />
    </div>
  )
}

function EmptyRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className="px-3 py-8 text-center text-gray-600 text-xs">
        Sin datos para el periodo seleccionado
      </td>
    </tr>
  )
}
