"use client"

// ============================================================================
// components/gerencia/tab-metas.tsx
// Presupuesto y dias laborables por asesor y por mes (edita el admin maestro).
// ============================================================================

import { useState } from "react"
import useSWR from "swr"
import { Loader2, ChevronLeft, ChevronRight, Check, CalendarDays, Lock } from "lucide-react"
import { fetcher } from "@/lib/fetcher"

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]

export function mesActual(): string {
  return new Date().toLocaleString("en-CA", { timeZone: "America/Bogota" }).split(",")[0].slice(0, 7)
}
export function moverMes(mes: string, delta: number): string {
  const [a, m] = mes.split("-").map(Number)
  const d = new Date(Date.UTC(a, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}
export function nombreMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number)
  return `${MESES[m - 1]} ${a}`
}
export function cop(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-CO")
}

export function SelectorMes({ mes, onChange }: { mes: string; onChange: (m: string) => void }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-dark-surface px-2 py-1.5">
      <button onClick={() => onChange(moverMes(mes, -1))} aria-label="Mes anterior" className="rounded-lg p-2 text-gray-400 hover:text-white"><ChevronLeft className="h-4 w-4" /></button>
      <p className="text-sm font-semibold capitalize text-white">{nombreMes(mes)}</p>
      <button onClick={() => onChange(moverMes(mes, 1))} aria-label="Mes siguiente" className="rounded-lg p-2 text-gray-400 hover:text-white"><ChevronRight className="h-4 w-4" /></button>
    </div>
  )
}

interface FilaMeta {
  asesor_id: string
  nombre: string
  zona: string | null
  presupuesto: number | null
  dias_laborables: number | null
  dias_con_visitas: number
}

export function TabMetas() {
  const [mes, setMes] = useState(mesActual())
  const { data, error, isLoading, mutate } = useSWR(`/api/admin/metas?mes=${mes}`, fetcher)
  const [guardado, setGuardado] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  async function guardar(asesorId: string, cuerpo: object, marca: string) {
    setAviso(null)
    try {
      const res = await fetch("/api/admin/metas", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mes, asesor_id: asesorId, ...cuerpo }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setAviso(json.error || "No se pudo guardar"); return }
      setGuardado(marca)
      setTimeout(() => setGuardado(g => (g === marca ? null : g)), 1500)
      mutate()
    } catch {
      setAviso("Error de conexión. Intenta de nuevo.")
    }
  }

  async function aplicarCalendario() {
    setAviso(null)
    const res = await fetch("/api/admin/metas", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mes, accion: "aplicar_calendario" }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { setAviso(json.error || "No se pudo aplicar el calendario"); return }
    setAviso(json.aplicados > 0 ? `Se pusieron ${json.dias} días a ${json.aplicados} asesor(es) que no tenían dato.` : "Todos los asesores ya tenían días definidos.")
    mutate()
  }

  const filas: FilaMeta[] = data?.asesores ?? []
  const cerrado: boolean = !!data?.cerrado
  const cal = data?.calendario

  return (
    <div className="p-4 space-y-3">
      <SelectorMes mes={mes} onChange={setMes} />

      {isLoading && <div className="flex h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-navy-accent" /></div>}
      {(error || data?.error) && <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-xs text-danger">{data?.error || "No se pudieron cargar las metas."}</p>}

      {cal && (
        <div className="rounded-xl border border-white/10 bg-dark-surface p-3 text-xs text-gray-400">
          <p className="flex items-center gap-1.5 text-gray-200"><CalendarDays className="h-3.5 w-3.5" /> <b className="text-white">{cal.laborables} días laborables</b> en el mes (lunes a sábado, sin festivos)</p>
          {cal.festivos.length > 0 && <p className="mt-1">Festivos: {cal.festivos.map((f: any) => `${Number(f.fecha.slice(8))} (${f.nombre})`).join(", ")}</p>}
        </div>
      )}

      {cerrado && (
        <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-gray-300">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <p>Este mes está cerrado en Incentivos: sus metas no se pueden modificar. Para editarlas, reábrelo allí.</p>
        </div>
      )}

      {aviso && <p className="rounded-lg border border-white/10 bg-dark-surface px-3 py-2 text-xs text-gray-300">{aviso}</p>}

      <div className="space-y-2">
        {filas.map(f => (
          <div key={f.asesor_id} className="rounded-xl border border-white/10 bg-dark-surface p-3">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-white">{f.nombre}</p>
              <p className="text-[11px] text-gray-500">{f.zona || "Sin zona"} · {f.dias_con_visitas} días con visitas</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <CampoNumero
                etiqueta="Presupuesto del mes ($)"
                valor={f.presupuesto}
                formato="pesos"
                deshabilitado={cerrado}
                marcado={guardado === `${f.asesor_id}-p`}
                onGuardar={v => guardar(f.asesor_id, { presupuesto: v }, `${f.asesor_id}-p`)}
              />
              <CampoNumero
                etiqueta="Días laborables"
                valor={f.dias_laborables}
                formato="entero"
                sugerido={cal?.laborables}
                deshabilitado={cerrado}
                marcado={guardado === `${f.asesor_id}-d`}
                onGuardar={v => guardar(f.asesor_id, { dias: v }, `${f.asesor_id}-d`)}
              />
            </div>
          </div>
        ))}
        {!isLoading && filas.length === 0 && !error && <p className="py-8 text-center text-xs text-gray-500">No hay asesores activos. Créalos en la pestaña Usuarios.</p>}
      </div>

      {filas.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-dark-surface p-3">
          <p className="text-xs text-gray-400">Presupuesto total: <b className="text-white">{cop(data?.total_presupuesto ?? 0)}</b></p>
          <button onClick={aplicarCalendario} disabled={cerrado}
            className="rounded-lg bg-white/10 px-3 py-2 text-xs font-medium text-white hover:bg-white/15 disabled:opacity-40">
            Usar el calendario ({cal?.laborables ?? "—"} días) donde falte
          </button>
        </div>
      )}
      <p className="text-[11px] text-gray-500">Si un asesor tuvo vacaciones, incapacidad o entró a mitad de mes, escribe sus días reales. Mientras un campo esté vacío se usa el calendario.</p>
    </div>
  )
}

function CampoNumero({ etiqueta, valor, formato, sugerido, deshabilitado, marcado, onGuardar }: {
  etiqueta: string
  valor: number | null
  formato: "pesos" | "entero"
  sugerido?: number
  deshabilitado: boolean
  marcado: boolean
  onGuardar: (v: number | null) => void
}) {
  const inicial = valor === null || valor === undefined ? "" : formato === "pesos" ? Math.round(valor).toLocaleString("es-CO") : String(valor)
  const [texto, setTexto] = useState(inicial)
  const [ultimo, setUltimo] = useState(inicial)

  // si el dato cambia desde el servidor (otro mes, otro guardado), se refleja
  if (inicial !== ultimo) { setUltimo(inicial); setTexto(inicial) }

  function alSalir() {
    const limpio = texto.replace(/[^\d]/g, "")
    if (limpio === (valor === null ? "" : String(Math.round(valor)))) { setTexto(inicial); return }
    onGuardar(limpio === "" ? null : Number(limpio))
  }

  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-[11px] text-gray-400">
        {etiqueta}
        {marcado && <span className="flex items-center gap-0.5 text-success"><Check className="h-3 w-3" />Guardado</span>}
      </span>
      <input
        value={texto}
        disabled={deshabilitado}
        inputMode="numeric"
        placeholder={sugerido !== undefined ? `Calendario: ${sugerido}` : "Sin definir"}
        onChange={e => {
          const d = e.target.value.replace(/[^\d]/g, "")
          setTexto(formato === "pesos" && d ? Number(d).toLocaleString("es-CO") : d)
        }}
        onBlur={alSalir}
        onKeyDown={e => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="w-full rounded-lg border border-white/10 bg-dark-bg px-3 py-2 font-mono text-sm text-white placeholder-gray-600 focus:border-navy-accent focus:outline-none disabled:opacity-50"
      />
    </label>
  )
}
