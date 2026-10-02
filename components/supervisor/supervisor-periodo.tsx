"use client"

// ============================================================================
// components/supervisor/supervisor-periodo.tsx
// Resumen por periodo (semana / mes / rango libre): por cada asesor, el total
// de visitas, el total de pedidos y la efectividad = pedidos ÷ visitas.
// La fila de totales da la efectividad promedio del equipo en el periodo.
// ============================================================================

import { useState, useMemo } from "react"
import useSWR from "swr"
import { Loader2, Download } from "lucide-react"
import { fetcher } from "@/lib/fetcher"

type Filtro = "semana" | "semana_pasada" | "mes" | "mes_pasado" | "rango"

function hoyColombia(): string {
  return new Date().toLocaleString("en-CA", { timeZone: "America/Bogota" }).split(",")[0]
}
function aFecha(s: string): Date {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
function aTexto(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function sumarDias(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000)
}

function rangoDe(filtro: Exclude<Filtro, "rango">): { inicio: string; fin: string } {
  const hoy = aFecha(hoyColombia())
  if (filtro === "semana" || filtro === "semana_pasada") {
    const lunes = sumarDias(hoy, -((hoy.getUTCDay() + 6) % 7))
    if (filtro === "semana") return { inicio: aTexto(lunes), fin: aTexto(hoy) }
    return { inicio: aTexto(sumarDias(lunes, -7)), fin: aTexto(sumarDias(lunes, -1)) }
  }
  const y = hoy.getUTCFullYear()
  const m = hoy.getUTCMonth()
  if (filtro === "mes") return { inicio: aTexto(new Date(Date.UTC(y, m, 1))), fin: aTexto(hoy) }
  return { inicio: aTexto(new Date(Date.UTC(y, m - 1, 1))), fin: aTexto(new Date(Date.UTC(y, m, 0))) }
}

function efectividad(pedidos: number, visitas: number): number {
  return visitas > 0 ? (pedidos / visitas) * 100 : 0
}
function colorEfectividad(pct: number): string {
  return pct >= 50 ? "text-success" : pct >= 25 ? "text-warning" : "text-danger"
}
function formatoFecha(s: string): string {
  return aFecha(s).toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: "UTC" })
}

const CHIPS: { id: Filtro; label: string }[] = [
  { id: "semana", label: "Esta semana" },
  { id: "semana_pasada", label: "Semana pasada" },
  { id: "mes", label: "Este mes" },
  { id: "mes_pasado", label: "Mes pasado" },
  { id: "rango", label: "Rango" },
]

export function SupervisorPeriodo() {
  const [filtro, setFiltro] = useState<Filtro>("mes")
  const [desde, setDesde] = useState(() => rangoDe("mes").inicio)
  const [hasta, setHasta] = useState(() => rangoDe("mes").fin)

  const { inicio, fin } = filtro === "rango" ? { inicio: desde, fin: hasta } : rangoDe(filtro)
  const rangoValido = !!inicio && !!fin && inicio <= fin

  const { data, isLoading, error } = useSWR(
    rangoValido ? `/api/admin/informes?tipo=resumen&fecha_inicio=${inicio}&fecha_fin=${fin}` : null,
    fetcher
  )

  const { filas, sinActividad, totales } = useMemo(() => {
    const todos = (data?.data ?? []) as any[]
    const activos = todos
      .filter(r => r.total_visitas > 0)
      .map(r => ({
        id: r.asesor_id as string,
        nombre: r.asesor_nombre as string,
        visitas: Number(r.total_visitas),
        pedidos: Number(r.pedidos),
      }))
      .sort((a, b) => b.visitas - a.visitas)
    const visitas = activos.reduce((s, r) => s + r.visitas, 0)
    const pedidos = activos.reduce((s, r) => s + r.pedidos, 0)
    return {
      filas: activos,
      sinActividad: todos.length - activos.length,
      totales: { visitas, pedidos },
    }
  }, [data])

  function descargarCSV() {
    const filasCsv = [
      ["Asesor", "Visitas", "Pedidos", "Efectividad %"],
      ...filas.map(r => [r.nombre, r.visitas, r.pedidos, efectividad(r.pedidos, r.visitas).toFixed(1)]),
      ["TOTAL EQUIPO", totales.visitas, totales.pedidos, efectividad(totales.pedidos, totales.visitas).toFixed(1)],
    ]
    const contenido = filasCsv.map(f => f.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")
    const blob = new Blob(["﻿" + contenido], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `resumen-asesores_${inicio}_${fin}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const efectividadEquipo = efectividad(totales.pedidos, totales.visitas)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">Resumen por periodo</p>
        <button
          onClick={descargarCSV}
          disabled={filas.length === 0}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-navy-accent disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" /> CSV
        </button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {CHIPS.map(c => (
          <button
            key={c.id}
            onClick={() => setFiltro(c.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              filtro === c.id ? "bg-navy-accent text-white" : "bg-dark-surface text-gray-400 border border-white/10"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {filtro === "rango" && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] text-gray-500 mb-1">Desde</label>
            <input
              type="date"
              value={desde}
              onChange={e => setDesde(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-dark-bg px-3 py-2 text-xs text-white focus:border-navy-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-1">Hasta</label>
            <input
              type="date"
              value={hasta}
              onChange={e => setHasta(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-dark-bg px-3 py-2 text-xs text-white focus:border-navy-accent focus:outline-none"
            />
          </div>
        </div>
      )}

      {rangoValido ? (
        <p className="text-[11px] text-gray-500">
          {formatoFecha(inicio)} → {formatoFecha(fin)}
        </p>
      ) : (
        <p className="text-[11px] text-warning">Revisa las fechas: "Desde" debe ser anterior o igual a "Hasta".</p>
      )}

      {rangoValido && (
        <div className="rounded-xl bg-dark-surface border border-white/10 overflow-hidden">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-navy-accent" />
            </div>
          ) : error || data?.error ? (
            <p className="px-4 py-8 text-center text-xs text-danger">No se pudo cargar el resumen. Intenta de nuevo.</p>
          ) : filas.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-gray-500">Sin visitas registradas en este periodo.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-white/[0.03]">
                <tr>
                  <th className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-gray-500">Asesor</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-medium uppercase tracking-wide text-gray-500">Visitas</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-medium uppercase tracking-wide text-gray-500">Pedidos</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-medium uppercase tracking-wide text-gray-500">Efectividad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {filas.map(r => {
                  const pct = efectividad(r.pedidos, r.visitas)
                  return (
                    <tr key={r.id}>
                      <td className="px-3 py-2.5 font-medium text-white">{r.nombre}</td>
                      <td className="px-3 py-2.5 text-right text-white">{r.visitas.toLocaleString("es-CO")}</td>
                      <td className="px-3 py-2.5 text-right text-white">{r.pedidos.toLocaleString("es-CO")}</td>
                      <td className={`px-3 py-2.5 text-right font-semibold ${colorEfectividad(pct)}`}>{pct.toFixed(1)}%</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="border-t border-white/10 bg-white/[0.03]">
                <tr>
                  <td className="px-3 py-2.5 font-bold text-white">Total equipo</td>
                  <td className="px-3 py-2.5 text-right font-bold text-white">{totales.visitas.toLocaleString("es-CO")}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-white">{totales.pedidos.toLocaleString("es-CO")}</td>
                  <td className={`px-3 py-2.5 text-right font-bold ${colorEfectividad(efectividadEquipo)}`}>{efectividadEquipo.toFixed(1)}%</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      <p className="text-[10px] text-gray-600">
        Efectividad = pedidos ÷ visitas. Un pedido cuenta cuando la visita terminó con pedido registrado.
        {sinActividad > 0 && ` ${sinActividad} usuarios sin visitas en el periodo no se muestran.`}
      </p>
    </div>
  )
}
