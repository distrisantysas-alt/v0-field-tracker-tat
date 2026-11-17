"use client"

// ============================================================================
// components/gerencia/tab-tiempo.tsx
// Tiempo trabajado por asesor (solo admin maestro): de la primera a la ultima
// gestion de cada dia, por dia, semana o mes. La pausa mas larga va aparte.
// ============================================================================

import { useState } from "react"
import useSWR from "swr"
import { Loader2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Clock, Coffee, Download } from "lucide-react"
import { fetcher } from "@/lib/fetcher"
import { moverPeriodo, formatoDuracion, formatoHora, type Periodo, type ResumenAsesor } from "@/lib/tiempo-trabajado"

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]

// pausas de una hora o mas se resaltan
const PAUSA_LARGA_MIN = 60

function hoy() {
  return new Date().toLocaleString("en-CA", { timeZone: "America/Bogota" }).split(",")[0]
}
function partes(f: string) {
  const [a, m, d] = f.split("-").map(Number)
  return { a, m, d, dow: new Date(Date.UTC(a, m - 1, d)).getUTCDay() }
}
function fechaCorta(f: string) {
  const { m, d, dow } = partes(f)
  return `${DIAS[dow].slice(0, 3)} ${d} ${MESES[m - 1].slice(0, 3)}`
}
function etiquetaPeriodo(periodo: Periodo, fecha: string, desde?: string, hasta?: string) {
  const { a, m, d, dow } = partes(fecha)
  if (periodo === "dia") return `${DIAS[dow]} ${d} de ${MESES[m - 1]} ${a}`
  if (periodo === "mes") return `${MESES[m - 1]} ${a}`
  if (!desde || !hasta) return "Semana"
  const i = partes(desde), f = partes(hasta)
  return i.m === f.m
    ? `${i.d} al ${f.d} de ${MESES[f.m - 1]} ${f.a}`
    : `${i.d} ${MESES[i.m - 1].slice(0, 3)} al ${f.d} ${MESES[f.m - 1].slice(0, 3)} ${f.a}`
}

export function TabTiempo() {
  const [periodo, setPeriodo] = useState<Periodo>("dia")
  const [fecha, setFecha] = useState(hoy())
  const [abierto, setAbierto] = useState<string | null>(null)
  const { data, error, isLoading } = useSWR(`/api/admin/tiempo-trabajado?periodo=${periodo}&fecha=${fecha}`, fetcher)

  if (error || data?.error) {
    return (
      <div className="p-4">
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-gray-300">
          <p className="mb-1 font-semibold text-white">Esta sección es solo para el administrador maestro.</p>
          <p className="text-xs text-gray-400">{data?.error || "No se pudo cargar el tiempo trabajado."}</p>
        </div>
      </div>
    )
  }

  const asesores: ResumenAsesor[] = data?.asesores ?? []
  const esDia = periodo === "dia"
  const futuro = moverPeriodo(periodo, fecha, 1) > hoy()

  function descargar() {
    const filas = [["Asesor", "Fecha", "Primera gestión", "Última gestión", "Jornada (min)", "Visitas", "Pausa más larga (min)", "Pausa desde"]]
    for (const a of asesores) {
      for (const d of a.detalle) {
        filas.push([
          a.nombre, d.fecha, formatoHora(d.inicio_min), formatoHora(d.fin_min),
          String(Math.round(d.fin_min - d.inicio_min)), String(d.visitas),
          String(Math.round(d.pausa_min)), d.pausa_desde_min !== null ? formatoHora(d.pausa_desde_min) : "",
        ])
      }
    }
    const csv = "﻿" + filas.map(f => f.map(c => `"${c.replace(/"/g, '""')}"`).join(";")).join("\n")
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
    a.download = `tiempo_trabajado_${data?.desde}_${data?.hasta}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="space-y-3 p-4">
      {/* Periodo */}
      <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-dark-surface p-1">
        {(["dia", "semana", "mes"] as Periodo[]).map(p => (
          <button key={p} onClick={() => { setPeriodo(p); setAbierto(null) }}
            className={`rounded-lg py-2 text-xs font-medium transition-colors ${periodo === p ? "bg-navy-accent text-white" : "text-gray-400 hover:text-white"}`}>
            {p === "dia" ? "Día" : p === "semana" ? "Semana" : "Mes"}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-xl border border-white/10 bg-dark-surface px-2 py-1.5">
        <button onClick={() => { setFecha(moverPeriodo(periodo, fecha, -1)); setAbierto(null) }} aria-label="Periodo anterior" className="rounded-lg p-2 text-gray-400 hover:text-white"><ChevronLeft className="h-4 w-4" /></button>
        <p className="text-sm font-semibold capitalize text-white">{etiquetaPeriodo(periodo, fecha, data?.desde, data?.hasta)}</p>
        <button onClick={() => { setFecha(moverPeriodo(periodo, fecha, 1)); setAbierto(null) }} disabled={futuro} aria-label="Periodo siguiente" className="rounded-lg p-2 text-gray-400 hover:text-white disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
      </div>

      {isLoading && <div className="flex h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-navy-accent" /></div>}

      {!isLoading && asesores.length === 0 && <p className="py-8 text-center text-xs text-gray-500">No hay gestiones registradas en este periodo.</p>}

      <div className="space-y-2">
        {asesores.map(a => {
          const d0 = a.detalle[0]
          const expandido = abierto === a.asesor_id
          return (
            <div key={a.asesor_id} className="rounded-xl border border-white/10 bg-dark-surface p-3">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-white">{a.nombre}</p>
                <p className="text-[11px] text-gray-500">{esDia ? `${a.visitas} visitas` : `${a.dias} ${a.dias === 1 ? "día" : "días"} · ${a.visitas} visitas`}</p>
              </div>

              {esDia ? (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Dato etiqueta="Inicio" valor={formatoHora(d0.inicio_min)} />
                  <Dato etiqueta="Fin" valor={formatoHora(d0.fin_min)} />
                  <Dato etiqueta="Jornada" valor={formatoDuracion(a.minutos_total)} fuerte />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                  <Dato etiqueta="Horas por día" valor={formatoDuracion(a.minutos_promedio)} fuerte />
                  <Dato etiqueta="Total" valor={formatoDuracion(a.minutos_total)} />
                  <Dato etiqueta="Inicio promedio" valor={formatoHora(a.inicio_promedio_min)} />
                  <Dato etiqueta="Fin promedio" valor={formatoHora(a.fin_promedio_min)} />
                </div>
              )}

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-400">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {a.visitas_por_hora !== null ? `${a.visitas_por_hora.toFixed(1).replace(".", ",")} visitas por hora` : "Sin dato de visitas por hora"}
                </span>
                <span className={`flex items-center gap-1 ${a.pausa_max_min >= PAUSA_LARGA_MIN ? "text-warning" : ""}`}>
                  <Coffee className="h-3 w-3" />
                  {a.pausa_max_min > 0
                    ? esDia
                      ? `Pausa más larga: ${formatoDuracion(a.pausa_max_min)}${d0.pausa_desde_min !== null ? ` desde las ${formatoHora(d0.pausa_desde_min)}` : ""}`
                      : `Pausa más larga: ${formatoDuracion(a.pausa_max_min)} (${fechaCorta(a.pausa_max_fecha!)})`
                    : "Una sola gestión"}
                </span>
              </div>

              {!esDia && (
                <>
                  <button onClick={() => setAbierto(expandido ? null : a.asesor_id)}
                    className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg bg-white/5 py-1.5 text-[11px] text-gray-300 hover:text-white">
                    {expandido ? <><ChevronUp className="h-3 w-3" />Ocultar días</> : <><ChevronDown className="h-3 w-3" />Ver día por día</>}
                  </button>
                  {expandido && (
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="text-gray-500">
                            <th className="py-1 text-left font-medium">Día</th>
                            <th className="py-1 text-right font-medium">Inicio</th>
                            <th className="py-1 text-right font-medium">Fin</th>
                            <th className="py-1 text-right font-medium">Jornada</th>
                            <th className="py-1 text-right font-medium">Visitas</th>
                            <th className="py-1 text-right font-medium">Pausa</th>
                          </tr>
                        </thead>
                        <tbody>
                          {a.detalle.map(d => (
                            <tr key={d.fecha} className="border-t border-white/5 text-gray-300">
                              <td className="py-1 capitalize">{fechaCorta(d.fecha)}</td>
                              <td className="py-1 text-right font-mono">{formatoHora(d.inicio_min)}</td>
                              <td className="py-1 text-right font-mono">{formatoHora(d.fin_min)}</td>
                              <td className="py-1 text-right font-mono text-white">{formatoDuracion(d.fin_min - d.inicio_min)}</td>
                              <td className="py-1 text-right font-mono">{d.visitas}</td>
                              <td className={`py-1 text-right font-mono ${d.pausa_min >= PAUSA_LARGA_MIN ? "text-warning" : ""}`}>{d.pausa_min > 0 ? formatoDuracion(d.pausa_min) : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>

      {asesores.length > 0 && (
        <button onClick={descargar} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-dark-surface py-2.5 text-xs font-medium text-white hover:bg-white/5">
          <Download className="h-3.5 w-3.5" />Descargar día por día (CSV)
        </button>
      )}

      <p className="text-[11px] text-gray-500">
        La jornada va de la primera a la última gestión registrada en la app (hora de Colombia); no incluye el tiempo antes del primer cliente ni después del último.
        La pausa más larga es el mayor rato entre dos gestiones seguidas y no se descuenta de la jornada. En amarillo, pausas de una hora o más.
      </p>
    </div>
  )
}

function Dato({ etiqueta, valor, fuerte }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <div className="rounded-lg bg-dark-bg px-2 py-1.5">
      <p className="text-[10px] text-gray-500">{etiqueta}</p>
      <p className={`font-mono text-xs ${fuerte ? "font-semibold text-white" : "text-gray-200"}`}>{valor}</p>
    </div>
  )
}
