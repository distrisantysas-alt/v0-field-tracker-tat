"use client"

// ============================================================================
// components/supervisor/supervisor-periodo.tsx
// Resumen por periodo (semana / mes / rango libre) para el bono:
//   visitas y pedidos (de esta app) + devoluciones (del POS, cargadas por CSV)
//   efectividad neta = (pedidos - devoluciones) / visitas
// ============================================================================

import { useState, useMemo, useRef } from "react"
import useSWR from "swr"
import { Loader2, Download, Upload, AlertTriangle, CheckCircle2, Lock } from "lucide-react"
import { fetcher } from "@/lib/fetcher"
import { leerDevolucionesPOS } from "@/lib/pos-devoluciones"
import { evaluarRegla, describirRegla, type Metricas, type Regla, type Resultado } from "@/lib/incentivos"

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
// Los incentivos NO se calculan aquí: las reglas las define el admin maestro en
// Gerencia → Incentivos y el motor (lib/incentivos.ts) las evalúa.
//   · Mes completo: se muestra lo que calcula el servidor (o lo congelado si el mes está cerrado),
//     con los días laborables de cada asesor (o el calendario si no se fijaron).
//   · Semana / mes en curso / rango: es una REFERENCIA calculada aquí con los datos del periodo,
//     promediando las visitas sobre los días en que el asesor registró visitas.
type BonoFila = { total: number; items: { regla: Regla; res: Resultado }[] }

function textoFalta(res: Resultado): string | null {
  return res.falta ?? (res.incompleto ? "Falta un dato para calcularlo" : null)
}
// Detalle completo (al pasar el cursor): una línea por regla
function detalleBono(b: BonoFila): string {
  return b.items
    .map(i => `${i.regla.nombre}: ${i.res.monto > 0 ? `${i.res.nivel ?? ""} → $${i.res.monto.toLocaleString("es-CO")}` : "sin incentivo"}${textoFalta(i.res) ? ` · ${textoFalta(i.res)}` : ""}`)
    .join("\n")
}
// Lineas visibles bajo el monto: lo ganado por regla (si hay varias) y que falta para el siguiente nivel
function lineasBono(b: BonoFila, variasReglas: boolean): { texto: string; ganado: boolean }[] {
  const out: { texto: string; ganado: boolean }[] = []
  if (variasReglas) for (const i of b.items) if (i.res.monto > 0) out.push({ texto: `${i.regla.nombre}: $${i.res.monto.toLocaleString("es-CO")}`, ganado: true })
  for (const i of b.items) {
    const t = textoFalta(i.res)
    if (t) { out.push({ texto: variasReglas ? `${i.regla.nombre}: ${t}` : t, ganado: false }); break }
  }
  return out
}

const pesos = (n: number) => "$" + n.toLocaleString("es-CO")
function promedioDia(visitas: number, dias: number): number {
  return dias > 0 ? visitas / dias : 0
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

  // El bono se liquida con el mes completo; en semanas o meses en curso es solo una referencia.
  const finDeMes = (() => { const d = aFecha(inicio); return aTexto(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))) })()
  const mesCompleto = inicio.endsWith("-01") && fin >= finDeMes
  const mes = inicio.slice(0, 7)

  // Reglas y resultados del motor de incentivos (Gerencia → Incentivos)
  const mesRef = mesCompleto ? mes : fin.slice(0, 7)
  const { data: inc, mutate: mutarInc } = useSWR(rangoValido ? `/api/admin/incentivos?mes=${mesRef}` : null, fetcher)
  const incOk = !!inc && !inc.error
  const reglas: Regla[] = incOk ? (inc.reglas ?? []) : []
  const cerrado = mesCompleto && incOk && !!inc.cierre
  const calendario: number | null = incOk && inc.datos ? Number(inc.datos.dias_calendario) : null

  // Días sobre los que se promedian las visitas del asesor: en mes completo, los fijados
  // (o el calendario si no hay); en otros periodos, los días en que registró visitas.
  type FilaBase = { id: string; visitas: number; diasConVisitas: number; diasLaborables: number | null; pedidos: number; devoluciones: number }
  const diasDe = (r: Pick<FilaBase, "diasConVisitas" | "diasLaborables">) =>
    mesCompleto ? (r.diasLaborables ?? calendario ?? r.diasConVisitas) : r.diasConVisitas

  const bonoDe = (r: FilaBase): BonoFila => {
    if (!incOk) return { total: 0, items: [] }
    if (mesCompleto) {
      const f = ((inc.filas ?? []) as any[]).find(x => x.asesor_id === r.id)
      if (!f) return { total: 0, items: [] }
      const items = (f.resultados as any[])
        .map(x => ({ regla: reglas.find(g => g.id === x.regla_id) as Regla, res: x as Resultado }))
        .filter(i => i.regla)
      return { total: Number(f.total) || 0, items }
    }
    // Referencia: solo lo que se puede saber con los datos de este periodo
    const m: Metricas = {
      visitas: r.visitas,
      pedidos: r.pedidos,
      visitas_dia: promedioDia(r.visitas, r.diasConVisitas),
      efectividad_bruta: r.visitas > 0 ? (r.pedidos / r.visitas) * 100 : 0,
    }
    if (data && data.devolucionesCargadas > 0) m.efectividad_neta = efectividadNeta(r.pedidos, r.devoluciones, r.visitas)
    const items = reglas.map(regla => ({ regla, res: evaluarRegla(regla, m) }))
    return { total: items.reduce((s, i) => s + i.res.monto, 0), items }
  }

  const [errorDias, setErrorDias] = useState<string | null>(null)
  async function guardarDias(asesorId: string, valor: string) {
    setErrorDias(null)
    const dias = valor.trim() === "" ? null : Number(valor)
    try {
      const res = await fetch("/api/admin/dias-laborables", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asesor_id: asesorId, mes, dias }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || "No se pudo guardar los días laborables")
      mutate()
      mutarInc()
    } catch (e: any) {
      setErrorDias(e.message || "No se pudo guardar los días laborables")
    }
  }

  const { filas, totales } = useMemo(() => {
    const todos = (data?.asesores ?? []) as any[]
    const activos = todos
      .filter(r => r.visitas > 0)
      .map(r => ({
        id: r.asesor_id as string,
        nombre: r.asesor_nombre as string,
        visitas: Number(r.visitas),
        diasConVisitas: Number(r.diasConVisitas) || 0,
        diasLaborables: r.diasLaborables == null ? null : Number(r.diasLaborables),
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
    const bonos = filas.map(r => bonoDe(r))
    const montoRegla = (b: BonoFila, id: string) => b.items.find(i => i.regla.id === id)?.res.monto ?? 0
    const filasCsv = [
      ["Asesor", "Visitas", "Dias laborables", "Promedio visitas/dia", "Pedidos efectivos", "Devoluciones", "Pedidos netos", "Efectividad neta %", "Incentivo total", ...reglas.map(g => `Incentivo: ${g.nombre}`)],
      ...filas.map((r, i) => [
        r.nombre, r.visitas, diasDe(r), promedioDia(r.visitas, diasDe(r)).toFixed(1), r.pedidos, r.devoluciones, r.pedidos - r.devoluciones,
        efectividadNeta(r.pedidos, r.devoluciones, r.visitas).toFixed(1),
        bonos[i].total, ...reglas.map(g => montoRegla(bonos[i], g.id)),
      ]),
      [
        "TOTAL EQUIPO", totales.visitas, "", "", totales.pedidos, totales.devoluciones,
        totales.pedidos - totales.devoluciones,
        efectividadNeta(totales.pedidos, totales.devoluciones, totales.visitas).toFixed(1),
        bonos.reduce((s, b) => s + b.total, 0), ...reglas.map(g => bonos.reduce((s, b) => s + montoRegla(b, g.id), 0)),
      ],
    ]
    const contenido = filasCsv.map(f => f.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")
    const blob = new Blob(["﻿" + contenido], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `incentivos-asesores_${inicio}_${fin}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalBonos = filas.reduce((s, r) => s + bonoDe(r).total, 0)

  const sinDevoluciones = data && data.devolucionesCargadas === 0
  const cargadasHasta: string | null = data?.devolucionesHasta ? String(data.devolucionesHasta).slice(0, 10) : null
  const cobertura_incompleta = !!cargadasHasta && cargadasHasta < fin
  const sinAsesor = (data?.devolucionesSinAsesor ?? []) as { asesor: string; cantidad: number }[]
  const efectividadEquipo = efectividadNeta(totales.pedidos, totales.devoluciones, totales.visitas)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">Incentivos del equipo</p>
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
                  {["Asesor", "Visitas", "Días lab.", "Prom/día", "Pedidos", "Devol.", "Netos", "Efectividad", "Incentivo"].map((t, i) => (
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
                  const prom = promedioDia(r.visitas, diasDe(r))
                  const bono = bonoDe(r)
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
                      <td className="px-3 py-2.5 text-right">
                        {mesCompleto ? (
                          <input
                            key={`${r.id}-${mes}-${r.diasLaborables ?? "x"}`}
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={31}
                            defaultValue={r.diasLaborables ?? ""}
                            placeholder={String(calendario ?? r.diasConVisitas)}
                            onBlur={e => {
                              const v = e.target.value
                              if (v !== String(r.diasLaborables ?? "")) guardarDias(r.id, v)
                            }}
                            disabled={cerrado}
                            title={cerrado ? "Mes cerrado: reábrelo en Incentivos para cambiar los días" : r.diasLaborables ? "Días laborables del mes" : `Sin definir: se usa el calendario (${calendario ?? r.diasConVisitas} días, lunes a sábado sin festivos)`}
                            className={`w-12 rounded-md border bg-dark-bg px-1.5 py-1 text-right text-xs text-white focus:border-navy-accent focus:outline-none ${r.diasLaborables ? "border-white/20" : "border-warning/50"}`}
                          />
                        ) : (
                          <span className="text-gray-400" title="Días con visitas (el periodo no es un mes completo)">{r.diasConVisitas}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right text-white">{prom.toFixed(1)}</td>
                      <td className="px-3 py-2.5 text-right text-white">{r.pedidos.toLocaleString("es-CO")}</td>
                      <td className="px-3 py-2.5 text-right text-gray-400">−{r.devoluciones.toLocaleString("es-CO")}</td>
                      <td className="px-3 py-2.5 text-right text-white">{(r.pedidos - r.devoluciones).toLocaleString("es-CO")}</td>
                      <td className={`px-3 py-2.5 text-right font-semibold ${colorEfectividad(pct)}`}>{pct.toFixed(1)}%</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap" title={detalleBono(bono)}>
                        {bono.total > 0 ? (
                          <span className="font-bold text-success">{pesos(bono.total)}</span>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                        {lineasBono(bono, reglas.length > 1).map((l, i) => (
                          <span key={i} className={`block max-w-[200px] truncate text-[9px] font-normal ${l.ganado ? "text-success/80" : "text-gray-500"}`}>{l.texto}</span>
                        ))}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="border-t border-white/10 bg-white/[0.03]">
                <tr>
                  <td className="px-3 py-2.5 font-bold text-white">Total equipo</td>
                  <td className="px-3 py-2.5 text-right font-bold text-white">{totales.visitas.toLocaleString("es-CO")}</td>
                  <td className="px-3 py-2.5"></td>
                  <td className="px-3 py-2.5"></td>
                  <td className="px-3 py-2.5 text-right font-bold text-white">{totales.pedidos.toLocaleString("es-CO")}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-gray-300">−{totales.devoluciones.toLocaleString("es-CO")}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-white">{(totales.pedidos - totales.devoluciones).toLocaleString("es-CO")}</td>
                  <td className={`px-3 py-2.5 text-right font-bold ${colorEfectividad(efectividadEquipo)}`}>{efectividadEquipo.toFixed(1)}%</td>
                  <td className="px-3 py-2.5 text-right font-bold text-success whitespace-nowrap">{pesos(totalBonos)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-dark-surface p-3 space-y-1">
        <p className="text-xs font-semibold text-white">Reglas de incentivo{rangoValido ? ` (${mesRef})` : ""}</p>
        {!inc ? (
          <p className="text-[11px] text-gray-500">Cargando reglas…</p>
        ) : !incOk ? (
          <p className="text-[11px] text-danger">No se pudieron cargar las reglas de incentivo. Intenta de nuevo.</p>
        ) : reglas.length === 0 ? (
          <p className="text-[11px] text-warning">
            No hay reglas de incentivo vigentes en este mes, por eso no se calcula ningún incentivo. El admin maestro las crea en Gerencia → Incentivos
            (cada regla aplica desde su fecha de inicio).
          </p>
        ) : (
          reglas.map(g => (
            <div key={g.id} className="space-y-0.5">
              <p className="text-[11px] font-medium text-gray-200">{g.nombre}</p>
              {describirRegla(g).map((l, i) => <p key={i} className="text-[11px] text-gray-400">{l}</p>)}
            </div>
          ))
        )}
        <p className="text-[10px] text-gray-600">
          Promedio = visitas del mes ÷ días laborables de cada asesor. Escribe los días de cada uno en la columna "Días lab." (vacaciones, incapacidades, ingreso a mitad de mes).
          Mientras esté vacío (borde naranja) se usa el calendario{calendario ? ` (${calendario} días: lunes a sábado sin festivos)` : ""}.
        </p>
        {errorDias && <p className="text-[11px] text-danger">{errorDias}</p>}
        {rangoValido && incOk && mesCompleto && cerrado && (
          <p className="flex items-start gap-1.5 text-[11px] text-gray-300">
            <Lock className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
            Mes cerrado{inc.cierre?.cerrado_por ? ` por ${inc.cierre.cerrado_por}` : ""}: los incentivos están congelados tal como se liquidaron. Para corregirlos hay que reabrir el mes en Incentivos.
          </p>
        )}
        {rangoValido && incOk && mesCompleto && !cerrado && reglas.length > 0 && (
          <p className="text-[11px] text-gray-500">Mes aún sin cerrar: los valores pueden cambiar hasta que el admin maestro lo cierre en Incentivos.</p>
        )}
        {rangoValido && !mesCompleto && (
          <p className="text-[11px] text-warning">
            Este periodo no es un mes completo: el incentivo es solo una referencia (el promedio usa los días con visitas). Lo que depende de activaciones, cobertura,
            presupuesto o ventas se calcula únicamente con el mes completo, y los días laborables solo se editan al verlo.
          </p>
        )}
      </div>

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
