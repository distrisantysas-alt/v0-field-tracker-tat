"use client"

// ============================================================================
// components/asesor/planear-ruta.tsx - Planear mi ruta
//   1) La app propone los clientes de hoy: los N más cercanos al asesor (una sola zona), con preferencia opcional
//      por clientes con oportunidad de venta. El asesor puede ajustar la ruta, la cantidad y cliente por cliente.
//   2) Los ordena para recorrer menos kilómetros (lib/planeador.ts) y los dibuja en un esquema con paradas numeradas.
//   3) Guarda el orden en su lista de hoy y deja navegar cada parada con Waze o Google Maps.
// Calcula en el teléfono: no gasta datos ni depende de un servicio de mapas.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react"
import useSWR, { mutate } from "swr"
import { Navigation, MapPin, Loader2, Route as RouteIcon, X, Check, LocateFixed, AlertTriangle, Sparkles } from "lucide-react"
import { fetcher } from "@/lib/fetcher"
import { rutaDe, compararRutas } from "@/lib/rutas"
import {
  coordValida, elegirParaHoy, estimarMinutos, km, longitudRuta, ordenarRuta, textoDuracion,
  ubicacionesLejanas, urlGoogleParada, urlWaze, urlsGoogleRuta, type Candidato, type Coord, type Punto,
} from "@/lib/planeador"

const botonPrimario = "rounded-xl bg-navy-accent px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
const botonSecundario = "rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-gray-200"
const MAX_PARADAS_DIA = 60   // más que esto ya no es una ruta de un día

function Fondo({ children, onCerrar }: { children: React.ReactNode; onCerrar: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={onCerrar}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-dark-surface p-5" onClick={e => e.stopPropagation()}>{children}</div>
    </div>
  )
}

async function llamar(url: string, metodo: string, cuerpo: object): Promise<{ ok: boolean; json: any }> {
  try {
    const res = await fetch(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) })
    return { ok: res.ok, json: await res.json().catch(() => ({})) }
  } catch {
    return { ok: false, json: { error: "Error de conexión. Intenta de nuevo." } }
  }
}

const quitarRuta = (n: string) => (n || "").replace(/^\S+\s/, "").trim()
const fechaHoy = () => new Date().toLocaleString("en-CA", { timeZone: "America/Bogota" }).split(",")[0]
const fkm = (n: number) => `${n.toLocaleString("es-CO", { maximumFractionDigits: 1 })} km`
const conOportunidad = (c: any) => Number(c.racha_sin_pedido ?? 0) >= 2 || !c.ultima_gestion_en

export function PlanearRuta({ asesorId, rutaInicial, modo = "nuevo", onCerrar }: {
  asesorId: string
  rutaInicial?: string
  /** "reordenar": vuelve a ordenar los clientes que ya había planeado hoy, desde donde está ahora */
  modo?: "nuevo" | "reordenar"
  onCerrar: () => void
}) {
  const fecha = fechaHoy()
  const { data, isLoading } = useSWR(`/api/clientes-del-dia?asesor_id=${asesorId}&fecha=${fecha}`, fetcher)
  const pendientes: any[] = useMemo(() => (data?.clientes ?? []).filter((c: any) => !c.completada && !c.visitado_en), [data])

  // ── Ruta ───────────────────────────────────────────────────────────────
  const rutas = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of pendientes) { const r = rutaDe(c.nombre); m.set(r, (m.get(r) ?? 0) + 1) }
    return [...m.entries()].sort((a, b) => compararRutas(a[0], b[0]))
  }, [pendientes])
  const [rutasSel, setRutasSel] = useState<Set<string>>(new Set(rutaInicial ? [rutaDe(rutaInicial + " ")] : []))
  const visibles = useMemo(() => pendientes.filter(c => rutasSel.size === 0 || rutasSel.has(rutaDe(c.nombre))), [pendientes, rutasSel])
  const conUbicacion = useMemo(() => visibles.filter(c => coordValida(c.lat, c.lng)), [visibles])
  const sinUbicacion = useMemo(() => visibles.filter(c => !coordValida(c.lat, c.lng)), [visibles])
  const puntos: Candidato[] = useMemo(
    () => conUbicacion.map(c => ({ id: c.id, lat: Number(c.lat), lng: Number(c.lng), prioridad: conOportunidad(c) })),
    [conUbicacion],
  )
  const lejanos = useMemo(() => ubicacionesLejanas(puntos), [puntos])

  // ── Dónde está el asesor ───────────────────────────────────────────────
  const [gps, setGps] = useState<"buscando" | "ok" | "no">("buscando")
  const [aqui, setAqui] = useState<Coord | null>(null)
  const [desdeAqui, setDesdeAqui] = useState(true)
  useEffect(() => {
    if (!navigator.geolocation) { setGps("no"); return }
    navigator.geolocation.getCurrentPosition(
      p => { setAqui({ lat: p.coords.latitude, lng: p.coords.longitude }); setGps("ok") },
      () => setGps("no"),
      { enableHighAccuracy: false, timeout: 7000, maximumAge: 120000 },
    )
  }, [])
  const inicio = desdeAqui && aqui ? aqui : null
  // No se espera al GPS más de 2,5 s para proponer los clientes; si llega después, se vuelve a proponer
  const [sinEspera, setSinEspera] = useState(false)
  useEffect(() => { const t = setTimeout(() => setSinEspera(true), 2500); return () => clearTimeout(t) }, [])

  // ── Qué clientes se visitan hoy ────────────────────────────────────────
  const [cantidad, setCantidad] = useState("40")
  const [usarPrioridad, setUsarPrioridad] = useState(true)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [manual, setManual] = useState(modo === "reordenar")
  const iniciado = useRef(false)
  const n = Math.max(1, Math.min(200, Math.round(Number(cantidad)) || 40))

  const propuesta = useMemo(
    () => elegirParaHoy(puntos.filter(p => !lejanos.has(p.id)), inicio, n, usarPrioridad),
    [puntos, lejanos, inicio?.lat, inicio?.lng, n, usarPrioridad], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const claveProp = propuesta.join(",")
  useEffect(() => {
    if (!data) return
    if (modo === "reordenar" && !iniciado.current) {
      iniciado.current = true
      setSeleccion(new Set(conUbicacion.filter(c => Number(c.orden) > 0).map(c => c.id)))
      return
    }
    if (!manual && (gps !== "buscando" || sinEspera)) setSeleccion(new Set(propuesta))
  }, [data, claveProp, manual, gps, sinEspera]) // eslint-disable-line react-hooks/exhaustive-deps

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState("")
  const [guardado, setGuardado] = useState(false)

  function alternarRuta(r: string) { setRutasSel(s => { const x = new Set(s); x.has(r) ? x.delete(r) : x.add(r); return x }); setManual(false); setGuardado(false) }
  function alternar(id: string) { setSeleccion(s => { const x = new Set(s); x.has(id) ? x.delete(id) : x.add(id); return x }); setManual(true); setGuardado(false) }
  function marcarTodos(marcar: boolean) { setSeleccion(marcar ? new Set(conUbicacion.map(c => c.id)) : new Set()); setManual(true); setGuardado(false) }
  function elegirPorMi() { setManual(false); setGuardado(false) }

  const incluidos: Punto[] = puntos.filter(p => seleccion.has(p.id)).map(p => ({ id: p.id, lat: p.lat, lng: p.lng }))
  const plan = useMemo(() => ordenarRuta(incluidos, inicio), [incluidos.map(p => p.id).join(","), inicio?.lat, inicio?.lng]) // eslint-disable-line react-hooks/exhaustive-deps
  const kmPlan = longitudRuta(plan, inicio)
  const kmActual = longitudRuta(incluidos, inicio)
  const ahorro = Math.max(0, kmActual - kmPlan)
  const minutos = estimarMinutos(kmPlan, plan.length)
  const porId = new Map<string, any>(pendientes.map(c => [c.id, c]))
  const tramos = urlsGoogleRuta(plan, inicio)
  const demasiadas = plan.length > MAX_PARADAS_DIA

  async function guardar() {
    setGuardando(true); setError("")
    // Solo se guardan los elegidos: el resto de la lista queda detrás, sin entrar a la ruta del día
    const orden = plan.map(p => p.id)
    const r = await llamar("/api/clientes-del-dia", "PUT", { fecha, orden })
    setGuardando(false)
    if (!r.ok) return setError(r.json.error ?? "No se pudo guardar el orden")
    setGuardado(true)
    mutate((k: unknown) => typeof k === "string" && k.startsWith("/api/clientes-del-dia"))
  }

  return (
    <Fondo onCerrar={onCerrar}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2"><RouteIcon className="h-5 w-5 text-navy-accent" /><div><h3 className="text-base font-bold text-white">{modo === "reordenar" ? "Reordenar desde donde estoy" : "Planear mi ruta"}</h3><p className="text-xs text-gray-400">La app elige los clientes de hoy y los ordena para recorrer menos</p></div></div>
        <button onClick={onCerrar} aria-label="Cerrar" className="text-gray-500"><X className="h-5 w-5" /></button>
      </div>

      {isLoading && !data ? <p className="py-8 text-center text-sm text-gray-400"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Cargando tus clientes…</p> : pendientes.length === 0 ? (
        <p className="rounded-xl bg-white/5 px-3 py-6 text-center text-sm text-gray-300">No te quedan clientes por visitar hoy. 🎉</p>
      ) : (
        <div className="space-y-3">
          {/* 1. Ruta */}
          <div>
            <p className="mb-1 text-xs font-semibold text-gray-400">1. ¿Qué ruta vas a trabajar?</p>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => { setRutasSel(new Set()); setManual(false); setGuardado(false) }} className={`rounded-full border px-3 py-1 text-xs font-semibold ${rutasSel.size === 0 ? "border-navy-accent bg-navy-accent text-white" : "border-white/10 text-gray-400"}`}>Todas ({pendientes.length})</button>
              {rutas.map(([r, c]) => (
                <button key={r} onClick={() => alternarRuta(r)} aria-pressed={rutasSel.has(r)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${rutasSel.has(r) ? "border-navy-accent bg-navy-accent text-white" : "border-white/10 text-gray-400"}`}>Ruta {r} ({c})</button>
              ))}
            </div>
          </div>

          {/* 2. Cuántos y cuáles */}
          <div className="rounded-xl border border-white/10 bg-dark-bg p-3">
            <p className="mb-2 text-xs font-semibold text-gray-400">2. ¿Cuántas visitas harás hoy?</p>
            <div className="flex items-center gap-2">
              <input type="number" inputMode="numeric" min={1} max={200} value={cantidad} onChange={e => { setCantidad(e.target.value); setManual(false); setGuardado(false) }}
                aria-label="Cantidad de visitas de hoy" className="w-20 rounded-lg border border-white/10 bg-dark-surface px-2 py-2 text-center text-sm font-bold text-white" />
              <button onClick={elegirPorMi} className={`${botonPrimario} flex flex-1 items-center justify-center gap-1.5 !py-2 text-xs`}><Sparkles className="h-4 w-4" />Elegir por mí los {n} más cercanos</button>
            </div>
            <label className="mt-2 flex cursor-pointer items-start gap-2 text-xs text-gray-300">
              <input type="checkbox" checked={usarPrioridad} onChange={e => { setUsarPrioridad(e.target.checked); setManual(false); setGuardado(false) }} className="mt-0.5 h-4 w-4 shrink-0 accent-[#0D7A70]" />
              <span>Dar preferencia a clientes con oportunidad de venta (varias visitas sin pedido o nunca visitados)</span>
            </label>

            <div className="mb-1 mt-3 flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-400">Clientes elegidos: {incluidos.length} de {conUbicacion.length}</p>
              <span className="flex gap-3 text-[11px]"><button onClick={() => marcarTodos(true)} className="text-navy-accent">Todos</button><button onClick={() => marcarTodos(false)} className="text-gray-400">Ninguno</button></span>
            </div>
            <div className="max-h-44 overflow-y-auto rounded-lg border border-white/10 bg-dark-surface">
              {[...conUbicacion].sort((a, b) => compararRutas(rutaDe(a.nombre), rutaDe(b.nombre)) || a.nombre.localeCompare(b.nombre)).map(c => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 border-b border-white/5 px-3 py-2 last:border-0">
                  <input type="checkbox" checked={seleccion.has(c.id)} onChange={() => alternar(c.id)} className="h-4 w-4 shrink-0 accent-[#0D7A70]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-white">{quitarRuta(c.nombre)}</span>
                    {lejanos.has(c.id) && <span className="flex items-center gap-1 text-[10px] text-warning"><AlertTriangle className="h-3 w-3" />Muy lejos de los demás: revisa su ubicación</span>}
                  </span>
                  <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-gray-300">{rutaDe(c.nombre)}</span>
                </label>
              ))}
              {conUbicacion.length === 0 && <p className="px-3 py-3 text-xs text-gray-500">Esta ruta no tiene clientes con ubicación.</p>}
            </div>
          </div>

          {/* 3. Recorrido */}
          <p className="text-xs font-semibold text-gray-400">3. Recorrido sugerido</p>
          <div className="flex gap-2 text-xs">
            <button onClick={() => setDesdeAqui(true)} disabled={gps !== "ok"} className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 py-2 font-semibold disabled:opacity-40 ${desdeAqui && gps === "ok" ? "border-navy-accent bg-navy-accent/10 text-white" : "border-white/10 text-gray-400"}`}>
              {gps === "buscando" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5" />}
              {gps === "buscando" ? "Buscando tu ubicación…" : gps === "ok" ? "Salir desde donde estoy" : "Sin ubicación (permiso del GPS)"}
            </button>
            <button onClick={() => setDesdeAqui(false)} className={`flex flex-1 items-center justify-center rounded-xl border px-2 py-2 font-semibold ${!desdeAqui || gps !== "ok" ? "border-navy-accent bg-navy-accent/10 text-white" : "border-white/10 text-gray-400"}`}>Solo ordenar los clientes</button>
          </div>

          {plan.length > 0 && <MapaEsquema plan={plan} inicio={inicio} />}

          <div className="grid grid-cols-3 gap-2 text-center">
            <Dato t="Paradas" v={String(plan.length)} />
            <Dato t="Recorrido" v={demasiadas ? "—" : fkm(kmPlan)} />
            <Dato t="Tiempo aprox." v={demasiadas ? "—" : textoDuracion(minutos)} />
          </div>
          {demasiadas && <p className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-center text-xs font-semibold text-warning">Son {plan.length} paradas: demasiadas para un día. Baja la cantidad o elige una ruta para ver el recorrido.</p>}
          {!demasiadas && ahorro >= 0.5 && <p className="rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-center text-xs font-semibold text-success">Ahorras unos {fkm(ahorro)} frente a visitarlos en el orden de tu lista</p>}

          <div className="rounded-xl border border-white/10 bg-dark-bg">
            {plan.slice(0, MAX_PARADAS_DIA).map((p, i) => {
              const c = porId.get(p.id), previo = i === 0 ? inicio : plan[i - 1]
              const tramo = previo ? km(previo, p) * 1.3 : null
              return (
                <div key={p.id} className="flex items-center gap-2 border-b border-white/5 px-3 py-2 last:border-0">
                  <button onClick={() => alternar(p.id)} aria-label={`Quitar ${quitarRuta(c.nombre)} de hoy`} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy-accent text-xs font-bold text-white">{i + 1}</button>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm text-white"><span className="truncate">{quitarRuta(c.nombre)}</span><span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-gray-300">{rutaDe(c.nombre)}</span></p>
                    <p className="truncate text-xs text-gray-500">{tramo !== null ? `${fkm(tramo)} desde ${i === 0 ? "tu ubicación" : "la parada anterior"}` : "Primera parada"}{c.direccion ? ` · ${c.direccion}` : ""}</p>
                  </div>
                  <a href={urlWaze(p)} target="_blank" rel="noreferrer" aria-label={`Waze a ${quitarRuta(c.nombre)}`} className="rounded-lg border border-white/10 px-2 py-1.5 text-xs font-bold text-gray-300">Waze</a>
                  <a href={urlGoogleParada(p)} target="_blank" rel="noreferrer" aria-label={`Google Maps a ${quitarRuta(c.nombre)}`} className="rounded-lg border border-white/10 p-1.5 text-gray-300"><Navigation className="h-4 w-4" /></a>
                </div>
              )
            })}
            {plan.length > MAX_PARADAS_DIA && <p className="px-3 py-2 text-xs text-gray-500">… y {plan.length - MAX_PARADAS_DIA} paradas más.</p>}
          </div>
          <p className="text-xs text-gray-500">Toca el número de una parada, o quita la marca en la lista de arriba, para dejarla para otro día.</p>

          {sinUbicacion.length > 0 && (
            <div className="rounded-xl border border-warning/30 bg-warning/5 p-2">
              <p className="flex items-center gap-1.5 px-1 pb-1 text-xs font-semibold text-warning"><MapPin className="h-3.5 w-3.5" /> {sinUbicacion.length} cliente(s) sin ubicación: no se pueden ordenar y quedan al final</p>
              {sinUbicacion.slice(0, 8).map(c => <p key={c.id} className="truncate px-1 text-xs text-gray-400">{quitarRuta(c.nombre)}</p>)}
              {sinUbicacion.length > 8 && <p className="px-1 text-xs text-gray-500">… y {sinUbicacion.length - 8} más</p>}
            </div>
          )}

          {error && <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
          {guardado && <p className="flex items-center justify-center gap-1.5 rounded-lg bg-success/10 px-3 py-2 text-xs font-semibold text-success"><Check className="h-4 w-4" /> Listo: tu lista de hoy quedó en este orden.</p>}

          <div className="space-y-2">
            <button onClick={guardar} disabled={guardando || plan.length === 0} className={`${botonPrimario} w-full`}>{guardando ? "Guardando…" : guardado ? "Guardar de nuevo" : "Usar este orden en mi lista de hoy"}</button>
            {tramos.length > 0 && !demasiadas && (
              <div className="flex flex-wrap gap-2">
                {tramos.map(t => <a key={t.desde} href={t.url} target="_blank" rel="noreferrer" className={`${botonSecundario} flex flex-1 items-center justify-center gap-1.5 text-center text-xs`}><Navigation className="h-4 w-4" /> {tramos.length === 1 ? "Abrir toda la ruta en Google Maps" : `Google Maps: paradas ${t.desde}–${t.hasta}`}</a>)}
              </div>
            )}
          </div>
        </div>
      )}
    </Fondo>
  )
}

function Dato({ t, v }: { t: string; v: string }) {
  return <div className="rounded-xl border border-white/10 bg-dark-surface p-2"><p className="text-xs text-gray-500">{t}</p><p className="text-sm font-bold text-white">{v}</p></div>
}

/** Esquema del recorrido: las paradas numeradas unidas en orden. No muestra calles; sirve para ver de un vistazo si el orden tiene sentido. */
function MapaEsquema({ plan, inicio }: { plan: Punto[]; inicio: Coord | null }) {
  const W = 320, H = 200, M = 16
  const todos: Coord[] = inicio ? [inicio, ...plan] : plan
  const lat0 = todos.reduce((s, p) => s + p.lat, 0) / todos.length
  const ex = Math.cos((lat0 * Math.PI) / 180)
  const xs = todos.map(p => p.lng * ex), ys = todos.map(p => -p.lat)
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const rx = maxX - minX || 1e-6, ry = maxY - minY || 1e-6
  const esc = Math.min((W - 2 * M) / rx, (H - 2 * M) / ry)
  const ox = (W - rx * esc) / 2, oy = (H - ry * esc) / 2
  const pos = (p: Coord) => ({ x: ox + (p.lng * ex - minX) * esc, y: oy + (-p.lat - minY) * esc })
  const trazo = [...(inicio ? [inicio] : []), ...plan].map(pos)
  const numerar = plan.length <= 40
  return (
    <div className="rounded-xl border border-white/10 bg-dark-bg p-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Esquema del recorrido con las paradas numeradas">
        <polyline points={trazo.map(t => `${t.x},${t.y}`).join(" ")} fill="none" stroke="#0D7A70" strokeWidth="1.5" strokeLinejoin="round" opacity="0.7" />
        {plan.map((p, i) => { const t = pos(p); return (
          <g key={p.id}>
            <circle cx={t.x} cy={t.y} r={numerar ? 8 : 2.5} fill="#0D7A70" />
            {numerar && <text x={t.x} y={t.y + 3} textAnchor="middle" fontSize="8" fontWeight="700" fill="#ffffff">{i + 1}</text>}
          </g>
        ) })}
        {inicio && (() => { const t = pos(inicio); return <g><circle cx={t.x} cy={t.y} r="6" fill="#2563EB" stroke="#ffffff" strokeWidth="1.5" /><text x={t.x + 9} y={t.y + 3} fontSize="8" fill="#93C5FD">Tú</text></g> })()}
      </svg>
      <p className="px-1 text-[10px] text-gray-500">Esquema de las paradas en orden (no muestra calles). Para ver las calles abre la ruta en Google Maps.</p>
    </div>
  )
}
