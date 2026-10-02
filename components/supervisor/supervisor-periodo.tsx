"use client"

// ============================================================================
// components/supervisor/supervisor-periodo.tsx
// Resumen por periodo (semana / mes / rango libre) para el bono:
//   visitas y pedidos (de esta app) + devoluciones (del POS, cargadas por CSV)
//   efectividad neta = (pedidos - devoluciones) / visitas
// ============================================================================

import { useState, useMemo, useRef } from "react"
import useSWR from "swr"
import { Loader2, Download, Upload, AlertTriangle, CheckCircle2 } from "lucide-react"
import { fetcher } from "@/lib/fetcher"
import { leerDevolucionesPOS } from "@/lib/pos-devoluciones"

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

// (pedidos - devoluciones) / visitas. Si las devoluciones superan los pedidos no baja de 0%.
function efectividadNeta(pedidos: number, devoluciones: number, visitas: number): number {
  return visitas > 0 ? (Math.max(0, pedidos - devoluciones) / visitas) * 100 : 0
}
function colorEfectividad(pct: number): string {
  return pct >= 50 ? "text-success" : pct >= 25 ? "text-warning" : "text-danger"
}
function formatoFecha(s: string): string {
  return aFecha(s.slice(0, 10)).toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: "UTC" })
}

const CHIPS: { id: Filtro; label: string }[] = [
  { id: "semana", label: "Esta semana" },
  { id: "semana_pasada", label: "Semana pasada" },
  { id: "mes", label: "Este mes" },
  { id: "mes_pasado", label: "Mes pasado" },
  { id: "rango", label: "Rango" },
]

type ResultadoCarga = {
  validas: number
  nuevas: number
  actualizadas: number
  rango: { desde: string; hasta: string }
  sinAsesor: { asesor: string; cantidad: number }[]
}

export function SupervisorPeriodo() {
  const [filtro, setFiltro] = useState<Filtro>("mes")
  const [desde, setDesde] = useState(() => rangoDe("mes").inicio)
  const [hasta, setHasta] = useState(() => rangoDe("mes").fin)
  const [cargando, setCargando] = useState(false)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [resultado, setResultado] = useState<ResultadoCarga | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { inicio, fin } = filtro === "rango" ? { inicio: desde, fin: hasta } : rangoDe(filtro)
  const rangoValido = !!inicio && !!fin && inicio <= fin

  const { data, isLoading, error, mutate } = useSWR(
    rangoValido ? `/api/admin/bono?fecha_inicio=${inicio}&fecha_fin=${fin}` : null,
    fetcher
  )

  const { filas, totales } = useMemo(() => {
    const todos = (data?.asesores ?? []) as any[]
    const activos = todos
      .filter(r => r.visitas > 0)
      .map(r => ({
        id: r.asesor_id as string,
        nombre: r.asesor_nombre as string,
        visitas: Number(r.visitas),
        pedidos: Number(r.pedidos),
        devoluciones: Number(r.devoluciones),
      }))
      .sort((a, b) => b.visitas - a.visitas)
    return {
      filas: activos,
      totales: {
        visitas: activos.reduce((s, r) => s + r.visitas, 0),
        pedidos: activos.reduce((s, r) => s + r.pedidos, 0),
        devoluciones: activos.reduce((s, r) => s + r.devoluciones, 0),
      },
    }
  }, [data])

  async function cargarArchivo(file: File) {
    setCargando(true)
    setErrorCarga(null)
    setResultado(null)
    try {
      const { devoluciones } = leerDevolucionesPOS(await file.arrayBuffer())
      if (devoluciones.length === 0) throw new Error("No encontré devoluciones (notas crédito) en ese archivo.")
      const res = await fetch("/api/admin/devoluciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ devoluciones }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "No se pudo cargar el archivo")
      setResultado(json)
      mutate()
    } catch (e: any) {
      setErrorCarga(e.message || "No se pudo leer el archivo")
    } finally {
      setCargando(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  function descargarCSV() {
    const filasCsv = [
      ["Asesor", "Visitas", "Pedidos efectivos", "Devoluciones", "Pedidos netos", "Efectividad neta %"],
      ...filas.map(r => [
        r.nombre, r.visitas, r.pedidos, r.devoluciones, r.pedidos - r.devoluciones,
        efectividadNeta(r.pedidos, r.devoluciones, r.visitas).toFixed(1),
      ]),
      [
        "TOTAL EQUIPO", totales.visitas, totales.pedidos, totales.devoluciones,
        totales.pedidos - totales.devoluciones,
        efectividadNeta(totales.pedidos, totales.devoluciones, totales.visitas).toFixed(1),
      ],
    ]
    const contenido = filasCsv.map(f => f.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")
    const blob = new Blob(["﻿" + contenido], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `bono-asesores_${inicio}_${fin}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const sinDevoluciones = data && data.devolucionesCargadas === 0
  const cargadasHasta: string | null = data?.devolucionesHasta ? String(data.devolucionesHasta).slice(0, 10) : null
  const cobertura_incompleta = !!cargadasHasta && cargadasHasta < fin
  const sinAsesor = (data?.devolucionesSinAsesor ?? []) as { asesor: string; cantidad: number }[]
  const efectividadEquipo = efectividadNeta(totales.pedidos, totales.devoluciones, totales.visitas)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">Bono: efectividad neta</p>
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

      {rangoValido && sinDevoluciones && (
        <div className="flex gap-2 rounded-xl border border-warning/30 bg-warning/10 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning mt-0.5" />
          <p className="text-xs text-gray-300">
            No hay devoluciones del POS cargadas para este periodo, así que los porcentajes de abajo
            <b className="text-white"> no descuentan devoluciones</b>. Carga el archivo del POS para obtener la efectividad neta.
          </p>
        </div>
      )}
      {rangoValido && !sinDevoluciones && cobertura_incompleta && (
        <p className="text-[11px] text-warning">
          Las devoluciones cargadas llegan solo hasta el {formatoFecha(cargadasHasta!)}; las posteriores aún no están descontadas.
        </p>
      )}

      {rangoValido && (
        <div className="rounded-xl bg-dark-surface border border-white/10 overflow-x-auto">
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
                  {["Asesor", "Visitas", "Pedidos", "Devol.", "Netos", "Efectividad"].map((t, i) => (
                    <th
                      key={t}
                      className={`px-3 py-2.5 text-[10px] font-medium uppercase tracking-wide text-gray-500 ${i === 0 ? "text-left" : "text-right"}`}
                    >
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {filas.map(r => {
                  const pct = efectividadNeta(r.pedidos, r.devoluciones, r.visitas)
                  const excede = r.devoluciones > r.pedidos
                  return (
                    <tr key={r.id}>
                      <td className="px-3 py-2.5 font-medium text-white whitespace-nowrap">
                        {r.nombre}
                        {excede && (
                          <span title="Las devoluciones del POS superan los pedidos registrados en la app">
                            <AlertTriangle className="inline h-3 w-3 ml-1 text-warning" />
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right text-white">{r.visitas.toLocaleString("es-CO")}</td>
                      <td className="px-3 py-2.5 text-right text-white">{r.pedidos.toLocaleString("es-CO")}</td>
                      <td className="px-3 py-2.5 text-right text-gray-400">−{r.devoluciones.toLocaleString("es-CO")}</td>
                      <td className="px-3 py-2.5 text-right text-white">{(r.pedidos - r.devoluciones).toLocaleString("es-CO")}</td>
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
                  <td className="px-3 py-2.5 text-right font-bold text-gray-300">−{totales.devoluciones.toLocaleString("es-CO")}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-white">{(totales.pedidos - totales.devoluciones).toLocaleString("es-CO")}</td>
                  <td className={`px-3 py-2.5 text-right font-bold ${colorEfectividad(efectividadEquipo)}`}>{efectividadEquipo.toFixed(1)}%</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      <p className="text-[10px] text-gray-600">
        Efectividad = (pedidos − devoluciones) ÷ visitas. Las visitas y los pedidos vienen de esta app; las devoluciones, del POS.
        {sinAsesor.length > 0 && (
          <> Devoluciones del periodo sin asesor de la app (no se descuentan a nadie): {sinAsesor.map(s => `${s.asesor} (${s.cantidad})`).join(", ")}.</>
        )}
      </p>

      <div className="rounded-xl border border-white/10 bg-dark-surface p-3 space-y-2">
        <p className="text-xs font-semibold text-white">Cargar devoluciones del POS</p>
        <p className="text-[11px] text-gray-500">
          Sube el CSV de ventas del POS (el mismo que exportas cada mes). Solo se leen las notas crédito; cargar el mismo mes dos veces no duplica nada.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          disabled={cargando}
          onChange={e => { const f = e.target.files?.[0]; if (f) cargarArchivo(f) }}
          className="hidden"
          id="archivo-pos"
        />
        <label
          htmlFor="archivo-pos"
          className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-navy-accent/40 bg-navy-accent/10 py-2.5 text-xs font-semibold text-navy-accent ${cargando ? "opacity-50 pointer-events-none" : ""}`}
        >
          {cargando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {cargando ? "Procesando..." : "Elegir archivo CSV"}
        </label>

        {errorCarga && <p className="text-[11px] text-danger">{errorCarga}</p>}
        {resultado && (
          <div className="flex gap-2 rounded-lg bg-success/10 border border-success/20 p-2.5">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success mt-0.5" />
            <div className="text-[11px] text-gray-300 space-y-0.5">
              <p>
                <b className="text-white">{resultado.validas}</b> devoluciones del {formatoFecha(resultado.rango.desde)} al {formatoFecha(resultado.rango.hasta)}
                {" "}({resultado.nuevas} nuevas, {resultado.actualizadas} ya estaban).
              </p>
              {resultado.sinAsesor.length > 0 && (
                <p className="text-warning">
                  Sin asesor en la app: {resultado.sinAsesor.map(s => `${s.asesor} (${s.cantidad})`).join(", ")}.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
