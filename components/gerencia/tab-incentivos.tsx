"use client"

// ============================================================================
// components/gerencia/tab-incentivos.tsx
// Incentivos configurables: reglas (escala o pago por unidad), resultado por
// asesor en el mes y cierre de mes (congela los resultados para auditarlos).
// Crea y edita reglas solo el admin maestro; supervisor y gerencia ven resultados.
// ============================================================================

import { useState } from "react"
import useSWR from "swr"
import { Loader2, Plus, Trash2, X, Lock, Unlock, Pencil, AlertTriangle } from "lucide-react"
import { fetcher } from "@/lib/fetcher"
import { METRICAS, describirRegla, type MetricaId } from "@/lib/incentivos"
import { SelectorMes, mesActual, cop, nombreMes } from "./tab-metas"

type Modo = "escala" | "por_unidad"
type Plantilla = "eficiencia" | "activacion" | "presupuesto" | "cobertura" | "personalizada"

interface ReglaApi {
  id: string
  nombre: string
  plantilla: Plantilla
  modo: Modo
  definicion: any
  activa: boolean
  vigente_desde: string
  vigente_hasta: string | null
}

const PLANTILLAS: { id: Plantilla; titulo: string; texto: string }[] = [
  { id: "eficiencia", titulo: "Eficiencia", texto: "Visitas por día y efectividad (pedidos contra visitas, descontando devoluciones)." },
  { id: "activacion", titulo: "Activación de clientes", texto: "Un monto por cada cliente inactivo que vuelve a comprar o cliente nuevo que compra." },
  { id: "presupuesto", titulo: "Cumplimiento del presupuesto", texto: "Niveles según el porcentaje de la meta de venta que se alcanza." },
  { id: "cobertura", titulo: "Cobertura de la cartera", texto: "Niveles según el porcentaje de clientes asignados que se visitó en el mes." },
  { id: "personalizada", titulo: "Personalizada", texto: "Combina las métricas que quieras, en escala o por unidad." },
]

// ── edicion de una regla (todo en texto hasta guardar) ─────────────────────
interface CondEd { metrica: MetricaId; op: ">=" | ">"; valor: string }
interface NivelEd { nombre: string; monto: string; condiciones: CondEd[] }
interface BorradorRegla {
  id?: string
  nombre: string
  plantilla: Plantilla
  modo: Modo
  niveles: NivelEd[]
  unidad: { metrica: MetricaId; monto_unidad: string; minimo: string; tope: string }
  vigente_desde: string
  vigente_hasta: string
}

function nivelVacio(n: number, conds: CondEd[]): NivelEd {
  return { nombre: `Nivel ${n}`, monto: "", condiciones: conds }
}

function borradorNuevo(p: Plantilla): BorradorRegla {
  const base: BorradorRegla = {
    nombre: PLANTILLAS.find(x => x.id === p)!.titulo, plantilla: p, modo: "escala",
    niveles: [], unidad: { metrica: "activaciones", monto_unidad: "", minimo: "0", tope: "" },
    vigente_desde: mesActual() + "-01", vigente_hasta: "",
  }
  if (p === "eficiencia") base.niveles = [nivelVacio(1, [{ metrica: "visitas_dia", op: ">=", valor: "" }, { metrica: "efectividad_neta", op: ">", valor: "" }])]
  else if (p === "activacion") base.modo = "por_unidad"
  else if (p === "presupuesto") base.niveles = [nivelVacio(1, [{ metrica: "cumplimiento_presupuesto_pct", op: ">=", valor: "" }])]
  else if (p === "cobertura") base.niveles = [nivelVacio(1, [{ metrica: "cobertura_pct", op: ">=", valor: "" }])]
  else base.niveles = [nivelVacio(1, [{ metrica: "efectividad_neta", op: ">=", valor: "" }])]
  return base
}

function borradorDe(r: ReglaApi): BorradorRegla {
  const b = borradorNuevo(r.plantilla)
  b.id = r.id; b.nombre = r.nombre; b.modo = r.modo
  b.vigente_desde = r.vigente_desde; b.vigente_hasta = r.vigente_hasta ?? ""
  if (r.modo === "escala") {
    b.niveles = r.definicion.niveles.map((n: any) => ({
      nombre: n.nombre, monto: String(n.monto),
      condiciones: n.condiciones.map((c: any) => ({ metrica: c.metrica, op: c.op, valor: String(c.valor) })),
    }))
  } else {
    const d = r.definicion
    b.unidad = { metrica: d.metrica, monto_unidad: String(d.monto_unidad), minimo: String(d.minimo), tope: d.tope === null ? "" : String(d.tope) }
  }
  return b
}

function aDefinicion(b: BorradorRegla): { definicion?: any; error?: string } {
  const num = (t: string) => (t.trim() === "" ? NaN : Number(t.replace(/[^\d.-]/g, "")))
  if (b.modo === "escala") {
    const niveles = []
    for (const n of b.niveles) {
      const monto = num(n.monto)
      if (!Number.isFinite(monto) || monto < 0) return { error: `Pon el monto del «${n.nombre || "nivel"}»` }
      const condiciones = []
      for (const c of n.condiciones) {
        const valor = num(c.valor)
        if (!Number.isFinite(valor)) return { error: `Completa el valor de «${METRICAS[c.metrica].etiqueta}» en «${n.nombre}»` }
        condiciones.push({ metrica: c.metrica, op: c.op, valor })
      }
      if (condiciones.length === 0) return { error: `«${n.nombre}» necesita al menos una condición` }
      niveles.push({ nombre: n.nombre.trim() || "Nivel", condiciones, monto })
    }
    if (niveles.length === 0) return { error: "Agrega al menos un nivel" }
    return { definicion: { niveles } }
  }
  const monto = num(b.unidad.monto_unidad)
  if (!Number.isFinite(monto) || monto < 0) return { error: "Pon el monto por cada unidad" }
  const minimo = b.unidad.minimo.trim() === "" ? 0 : num(b.unidad.minimo)
  if (!Number.isFinite(minimo) || minimo < 0) return { error: "El mínimo no es válido" }
  const tope = b.unidad.tope.trim() === "" ? null : num(b.unidad.tope)
  if (tope !== null && (!Number.isFinite(tope) || tope < 0)) return { error: "El tope no es válido" }
  return { definicion: { metrica: b.unidad.metrica, monto_unidad: monto, minimo, tope } }
}

function valorMetrica(id: MetricaId, v: number | undefined): string {
  if (v === undefined || v === null) return "—"
  const { decimales, unidad } = METRICAS[id]
  const t = v.toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: decimales })
  return unidad === "$" ? "$" + t : unidad ? t + unidad : t
}

export function TabIncentivos() {
  const [mes, setMes] = useState(mesActual())
  const { data, error, isLoading, mutate } = useSWR(`/api/admin/incentivos?mes=${mes}`, fetcher)
  const [editor, setEditor] = useState<BorradorRegla | { elegir: true } | null>(null)
  const [confirmar, setConfirmar] = useState<"cerrar" | "reabrir" | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  async function llamar(metodo: "POST" | "PATCH", cuerpo: object): Promise<boolean> {
    setTrabajando(true); setAviso(null)
    try {
      const res = await fetch("/api/admin/incentivos", { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setAviso(json.error || "No se pudo completar la acción"); return false }
      await mutate()
      return true
    } catch {
      setAviso("Error de conexión. Intenta de nuevo.")
      return false
    } finally {
      setTrabajando(false)
    }
  }

  if (isLoading) return <div className="flex h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-navy-accent" /></div>

  const cerrado: boolean = !!data?.cerrado
  const reglas: any[] = data?.reglas ?? []
  const todas: ReglaApi[] = data?.todas_las_reglas ?? []
  const filas: any[] = data?.filas ?? []
  const mesTerminado = mes < mesActual()

  return (
    <div className="p-4 space-y-3">
      <SelectorMes mes={mes} onChange={m => { setMes(m); setAviso(null) }} />
      {(error || data?.error) && <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-xs text-danger">{data?.error || "No se pudo cargar."}</p>}

      {/* Resumen del mes */}
      <div className="rounded-xl border border-white/10 bg-dark-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-500">Total a pagar en {nombreMes(mes)}</p>
            <p className="font-mono text-2xl font-bold text-white">{cop(data?.total_mes ?? 0)}</p>
          </div>
          <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${cerrado ? "bg-success/20 text-success" : "bg-warning/20 text-warning"}`}>
            {cerrado ? <><Lock className="h-3 w-3" />Cerrado</> : <>Abierto</>}
          </span>
        </div>
        {cerrado && data?.cierre && <p className="mt-1 text-[11px] text-gray-500">Cerrado por {data.cierre.cerrado_por} · los valores de abajo quedaron congelados.</p>}
        {data?.datos && !data.datos.devoluciones_cargadas && !cerrado && (
          <p className="mt-2 flex items-start gap-1.5 text-[11px] text-warning"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />No hay devoluciones del POS cargadas en este mes: las reglas que usan la efectividad neta quedarán «sin dato» hasta cargarlas (Reportes del supervisor).</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {!cerrado && <button onClick={() => { setAviso(null); setConfirmar("cerrar") }} disabled={!mesTerminado || reglas.length === 0}
            title={!mesTerminado ? "Solo se pueden cerrar meses que ya terminaron" : undefined}
            className="flex items-center gap-1.5 rounded-lg bg-navy-accent px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"><Lock className="h-3.5 w-3.5" />Cerrar mes</button>}
          {cerrado && <button onClick={() => { setAviso(null); setConfirmar("reabrir") }} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs font-medium text-white"><Unlock className="h-3.5 w-3.5" />Reabrir mes</button>}
        </div>
        {!cerrado && !mesTerminado && <p className="mt-2 text-[11px] text-gray-500">El mes se puede cerrar cuando termine.</p>}
      </div>

      {aviso && !confirmar && !editor && <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-xs text-danger">{aviso}</p>}

      {/* Resultados */}
      <div className="space-y-2">
        {filas.length === 0 && <p className="py-6 text-center text-xs text-gray-500">{reglas.length === 0 ? "No hay reglas de incentivo activas en este mes. Crea una abajo." : "No hay asesores activos."}</p>}
        {filas.map(f => (
          <div key={f.asesor_id} className="rounded-xl border border-white/10 bg-dark-surface p-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-white">{f.nombre}</p>
              <p className={`font-mono text-sm font-bold ${f.total > 0 ? "text-success" : "text-gray-500"}`}>{cop(f.total)}</p>
            </div>
            <div className="mt-1.5 grid grid-cols-3 gap-x-3 gap-y-1 text-[11px] text-gray-400">
              {(["visitas_dia", "efectividad_neta", "activaciones", "cobertura_pct", "cumplimiento_presupuesto_pct", "ventas"] as MetricaId[]).map(id => (
                <span key={id} title={METRICAS[id].etiqueta}>
                  <span className="text-gray-500">{({ visitas_dia: "Visitas/día", efectividad_neta: "Efect. neta", activaciones: "Activ.", cobertura_pct: "Cobertura", cumplimiento_presupuesto_pct: "Ppto.", ventas: "Ventas" } as any)[id]}: </span>
                  <b className="text-gray-200">{valorMetrica(id, f.metricas?.[id])}</b>
                </span>
              ))}
            </div>
            <div className="mt-2 space-y-1.5 border-t border-white/5 pt-2">
              {f.resultados.map((r: any) => {
                const regla = reglas.find(x => x.id === r.regla_id)
                return (
                  <div key={r.regla_id} className="text-[11px]">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-gray-300">{regla?.nombre ?? "Regla"}{r.nivel ? <span className="text-gray-500"> · {r.nivel}</span> : null}</span>
                      <span className={r.monto > 0 ? "font-semibold text-success" : "text-gray-500"}>{r.monto > 0 ? cop(r.monto) : r.incompleto ? "Sin dato" : "$0"}</span>
                    </div>
                    {r.falta && <p className="text-gray-500">{r.falta}</p>}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Reglas */}
      <div className="rounded-xl border border-white/10 bg-dark-surface p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-white">Reglas de incentivo</p>
          <button onClick={() => { setAviso(null); setEditor({ elegir: true }) }} className="flex items-center gap-1 rounded-lg bg-navy-accent px-2.5 py-1.5 text-xs font-semibold text-white"><Plus className="h-3.5 w-3.5" />Nueva regla</button>
        </div>
        {todas.length === 0 && <p className="py-3 text-xs text-gray-500">Todavía no hay reglas. Las reglas definen cuánto se paga y por qué: cada empresa decide las suyas.</p>}
        <div className="space-y-2">
          {todas.map(r => (
            <div key={r.id} className={`rounded-lg border border-white/5 bg-dark-bg p-3 ${r.activa ? "" : "opacity-60"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">{r.nombre} {!r.activa && <span className="ml-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-gray-400">Desactivada</span>}</p>
                  <p className="text-[11px] text-gray-500">Desde {r.vigente_desde}{r.vigente_hasta ? ` hasta ${r.vigente_hasta}` : " sin fecha final"}</p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button onClick={() => { setAviso(null); setEditor(borradorDe(r)) }} aria-label="Editar regla" className="rounded-lg bg-white/5 p-2 text-gray-300 hover:text-white"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => llamar("PATCH", { id: r.id, activa: !r.activa })} disabled={trabajando} className="rounded-lg bg-white/5 px-2.5 text-[11px] text-gray-300 hover:text-white disabled:opacity-50">{r.activa ? "Desactivar" : "Activar"}</button>
                </div>
              </div>
              <ul className="mt-1.5 space-y-0.5 text-[11px] text-gray-400">
                {describirRegla(r).map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-gray-500">Cambiar una regla no altera los meses ya cerrados: cada cierre guarda su propia copia.</p>
      </div>

      {confirmar && (
        <Fondo onCerrar={() => setConfirmar(null)}>
          <h3 className="text-base font-bold text-white">{confirmar === "cerrar" ? `¿Cerrar ${nombreMes(mes)}?` : `¿Reabrir ${nombreMes(mes)}?`}</h3>
          <p className="mt-2 text-sm text-gray-400">
            {confirmar === "cerrar"
              ? "Se congelan las métricas, las reglas y los montos de cada asesor. Después ya no cambian aunque modifiques una regla o una meta, y el mes queda como constancia de lo que se pagó."
              : "Se borran los resultados congelados y vuelven a calcularse con los datos y reglas de hoy. Queda registrado en la bitácora."}
          </p>
          {aviso && <p className="mt-2 text-xs text-danger">{aviso}</p>}
          <div className="mt-4 flex gap-2">
            <button onClick={() => setConfirmar(null)} className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm text-gray-300">Cancelar</button>
            <button disabled={trabajando} onClick={async () => { if (await llamar("POST", { accion: confirmar === "cerrar" ? "cerrar_mes" : "reabrir_mes", mes })) setConfirmar(null) }}
              className="flex-1 rounded-xl bg-navy-accent py-2.5 text-sm font-semibold text-white disabled:opacity-50">{trabajando ? "Procesando..." : "Confirmar"}</button>
          </div>
        </Fondo>
      )}

      {editor && "elegir" in editor && (
        <Fondo onCerrar={() => setEditor(null)}>
          <h3 className="text-base font-bold text-white">¿Qué quieres incentivar?</h3>
          <div className="mt-3 space-y-2">
            {PLANTILLAS.map(p => (
              <button key={p.id} onClick={() => setEditor(borradorNuevo(p.id))} className="w-full rounded-xl border border-white/10 bg-dark-bg p-3 text-left hover:border-navy-accent/60">
                <p className="text-sm font-semibold text-white">{p.titulo}</p>
                <p className="text-xs text-gray-400">{p.texto}</p>
              </button>
            ))}
          </div>
        </Fondo>
      )}

      {editor && !("elegir" in editor) && (
        <EditorRegla
          borrador={editor}
          aviso={aviso}
          trabajando={trabajando}
          onCerrar={() => { setEditor(null); setAviso(null) }}
          onGuardar={async (b, definicion) => {
            const ok = b.id
              ? await llamar("PATCH", { id: b.id, nombre: b.nombre, definicion, vigente_desde: b.vigente_desde, vigente_hasta: b.vigente_hasta || null })
              : await llamar("POST", { accion: "crear_regla", nombre: b.nombre, plantilla: b.plantilla, modo: b.modo, definicion, vigente_desde: b.vigente_desde, vigente_hasta: b.vigente_hasta || null })
            if (ok) setEditor(null)
          }}
        />
      )}
    </div>
  )
}

function Fondo({ children, onCerrar }: { children: React.ReactNode; onCerrar: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={onCerrar}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-dark-surface p-5" onClick={e => e.stopPropagation()}>{children}</div>
    </div>
  )
}

function EditorRegla({ borrador, aviso, trabajando, onCerrar, onGuardar }: {
  borrador: BorradorRegla
  aviso: string | null
  trabajando: boolean
  onCerrar: () => void
  onGuardar: (b: BorradorRegla, definicion: any) => void
}) {
  const [b, setB] = useState<BorradorRegla>(borrador)
  const [error, setError] = useState("")
  const campo = "w-full rounded-lg border border-white/10 bg-dark-bg px-2.5 py-2 text-sm text-white placeholder-gray-600 focus:border-navy-accent focus:outline-none"
  const eti = "mb-1 block text-[11px] text-gray-400"
  const metricas = Object.keys(METRICAS) as MetricaId[]

  const setNivel = (i: number, parche: Partial<NivelEd>) => setB(x => ({ ...x, niveles: x.niveles.map((n, k) => (k === i ? { ...n, ...parche } : n)) }))
  const setCond = (i: number, j: number, parche: Partial<CondEd>) =>
    setB(x => ({ ...x, niveles: x.niveles.map((n, k) => (k === i ? { ...n, condiciones: n.condiciones.map((c, l) => (l === j ? { ...c, ...parche } : c)) } : n)) }))

  function guardar() {
    if (b.nombre.trim().length < 3) return setError("Ponle un nombre a la regla")
    const r = aDefinicion(b)
    if (r.error) return setError(r.error)
    setError("")
    onGuardar(b, r.definicion)
  }

  return (
    <Fondo onCerrar={onCerrar}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-bold text-white">{b.id ? "Editar regla" : "Nueva regla"}</h3>
        <button onClick={onCerrar} aria-label="Cerrar" className="text-gray-500 hover:text-white"><X className="h-5 w-5" /></button>
      </div>
      <div className="space-y-3">
        <div><label className={eti} htmlFor="r-nombre">Nombre de la regla</label><input id="r-nombre" className={campo} value={b.nombre} onChange={e => setB({ ...b, nombre: e.target.value })} /></div>

        {b.plantilla === "personalizada" && !b.id && (
          <div>
            <label className={eti} htmlFor="r-modo">Cómo se paga</label>
            <select id="r-modo" className={campo} value={b.modo} onChange={e => setB({ ...b, modo: e.target.value as Modo })}>
              <option value="escala">Por niveles (al cumplir condiciones se paga un monto)</option>
              <option value="por_unidad">Por unidad (un monto por cada visita, activación, etc.)</option>
            </select>
          </div>
        )}

        {b.modo === "escala" ? (
          <div className="space-y-3">
            {b.niveles.map((n, i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-dark-bg p-3">
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={eti}>Nombre del nivel</label><input className={campo} value={n.nombre} onChange={e => setNivel(i, { nombre: e.target.value })} /></div>
                  <div><label className={eti}>Monto a pagar ($)</label><input className={campo} inputMode="numeric" value={n.monto} placeholder="120000" onChange={e => setNivel(i, { monto: e.target.value.replace(/[^\d]/g, "") })} /></div>
                </div>
                <p className="mb-1 mt-2 text-[11px] text-gray-400">Se paga cuando se cumple <b className="text-gray-200">todo</b> esto:</p>
                <div className="space-y-1.5">
                  {n.condiciones.map((c, j) => (
                    <div key={j} className="flex flex-wrap items-center gap-1.5">
                      <select aria-label="Métrica" className={`${campo} w-full`} value={c.metrica} onChange={e => setCond(i, j, { metrica: e.target.value as MetricaId })}>
                        {metricas.map(m => <option key={m} value={m}>{METRICAS[m].etiqueta}</option>)}
                      </select>
                      <select aria-label="Operador" className={`${campo} w-20 shrink-0`} value={c.op} onChange={e => setCond(i, j, { op: e.target.value as ">=" | ">" })}>
                        <option value=">=">≥</option>
                        <option value=">">&gt;</option>
                      </select>
                      <input aria-label="Valor" className={`${campo} min-w-0 flex-1`} inputMode="decimal" value={c.valor} placeholder="40" onChange={e => setCond(i, j, { valor: e.target.value })} />
                      {n.condiciones.length > 1 && <button aria-label="Quitar condición" onClick={() => setNivel(i, { condiciones: n.condiciones.filter((_, l) => l !== j) })} className="text-gray-500 hover:text-danger"><X className="h-4 w-4" /></button>}
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <button onClick={() => setNivel(i, { condiciones: [...n.condiciones, { metrica: "visitas_dia", op: ">=", valor: "" }] })} className="text-[11px] text-navy-accent">+ Agregar condición</button>
                  {b.niveles.length > 1 && <button onClick={() => setB(x => ({ ...x, niveles: x.niveles.filter((_, k) => k !== i) }))} className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-danger"><Trash2 className="h-3 w-3" />Quitar nivel</button>}
                </div>
              </div>
            ))}
            {b.niveles.length < 8 && <button onClick={() => setB(x => ({ ...x, niveles: [...x.niveles, nivelVacio(x.niveles.length + 1, [{ metrica: x.niveles[0]?.condiciones[0]?.metrica ?? "visitas_dia", op: ">=", valor: "" }])] }))} className="w-full rounded-lg border border-dashed border-white/15 py-2 text-xs text-gray-400 hover:text-white">+ Agregar otro nivel</button>}
            <p className="text-[11px] text-gray-500">Si un asesor cumple varios niveles se le paga el de mayor monto, no se suman.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-dark-bg p-3 space-y-2">
            <div>
              <label className={eti} htmlFor="r-met">Qué se cuenta</label>
              <select id="r-met" className={campo} value={b.unidad.metrica} onChange={e => setB({ ...b, unidad: { ...b.unidad, metrica: e.target.value as MetricaId } })}>
                {metricas.map(m => <option key={m} value={m}>{METRICAS[m].etiqueta}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div><label className={eti}>Monto por unidad ($)</label><input className={campo} inputMode="numeric" value={b.unidad.monto_unidad} placeholder="15000" onChange={e => setB({ ...b, unidad: { ...b.unidad, monto_unidad: e.target.value.replace(/[^\d]/g, "") } })} /></div>
              <div><label className={eti}>Mínimo para pagar</label><input className={campo} inputMode="decimal" value={b.unidad.minimo} onChange={e => setB({ ...b, unidad: { ...b.unidad, minimo: e.target.value } })} /></div>
              <div><label className={eti}>Tope ($, opcional)</label><input className={campo} inputMode="numeric" value={b.unidad.tope} placeholder="Sin tope" onChange={e => setB({ ...b, unidad: { ...b.unidad, tope: e.target.value.replace(/[^\d]/g, "") } })} /></div>
            </div>
            {b.plantilla === "activacion" && <p className="text-[11px] text-gray-500">Una activación es un cliente que compra tras 60 días sin hacerlo (o su primera compra) en una visita verificada con GPS.</p>}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div><label className={eti} htmlFor="r-desde">Vigente desde</label><input id="r-desde" type="date" className={campo} value={b.vigente_desde} onChange={e => setB({ ...b, vigente_desde: e.target.value })} /></div>
          <div><label className={eti} htmlFor="r-hasta">Hasta (opcional)</label><input id="r-hasta" type="date" className={campo} value={b.vigente_hasta} onChange={e => setB({ ...b, vigente_hasta: e.target.value })} /></div>
        </div>

        {(error || aviso) && <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-xs text-danger">{error || aviso}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onCerrar} className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm text-gray-300">Cancelar</button>
          <button onClick={guardar} disabled={trabajando} className="flex-1 rounded-xl bg-navy-accent py-2.5 text-sm font-semibold text-white disabled:opacity-50">{trabajando ? "Guardando..." : b.id ? "Guardar cambios" : "Crear regla"}</button>
        </div>
      </div>
    </Fondo>
  )
}
