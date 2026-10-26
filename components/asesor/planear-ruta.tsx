"use client"

// ============================================================================
// components/asesor/planear-ruta.tsx - Planeador de ruta: ordena los clientes que faltan por visitar para recorrer
// menos kilometros, desde donde esta el asesor, y deja navegar cada parada con Waze o Google Maps.
// Calcula en el telefono (lib/planeador.ts): no gasta datos ni depende de un servicio de mapas.
// ============================================================================

import { useEffect, useMemo, useState } from "react"
import useSWR, { mutate } from "swr"
import { Navigation, MapPin, Loader2, Route as RouteIcon, X, Check, LocateFixed } from "lucide-react"
import { fetcher } from "@/lib/fetcher"
import { rutaDe, compararRutas } from "@/lib/rutas"
import { coordValida, estimarMinutos, km, longitudRuta, ordenarRuta, textoDuracion, urlGoogleParada, urlWaze, urlsGoogleRuta, type Coord, type Punto } from "@/lib/planeador"

const botonPrimario = "rounded-xl bg-navy-accent px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
const botonSecundario = "rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-gray-200"

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

export function PlanearRuta({ asesorId, rutaInicial, onCerrar }: { asesorId: string; rutaInicial?: string; onCerrar: () => void }) {
  const fecha = fechaHoy()
  const { data, isLoading } = useSWR(`/api/clientes-del-dia?asesor_id=${asesorId}&fecha=${fecha}`, fetcher)
  const pendientes: any[] = useMemo(() => (data?.clientes ?? []).filter((c: any) => !c.completada && !c.visitado_en), [data])
  // Rutas que tienen clientes por visitar hoy (la ruta es el número con que empieza el nombre)
  const rutas = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of pendientes) { const r = rutaDe(c.nombre); m.set(r, (m.get(r) ?? 0) + 1) }
    return [...m.entries()].sort((a, b) => compararRutas(a[0], b[0]))
  }, [pendientes])
  // Sin ninguna ruta elegida se muestran todas
  const [rutasSel, setRutasSel] = useState<Set<string>>(new Set(rutaInicial ? [rutaDe(rutaInicial + " ")] : []))
  const visibles = useMemo(() => pendientes.filter(c => rutasSel.size === 0 || rutasSel.has(rutaDe(c.nombre))), [pendientes, rutasSel])
  const conUbicacion = visibles.filter(c => coordValida(c.lat, c.lng))
  const sinUbicacion = visibles.filter(c => !coordValida(c.lat, c.lng))

  const [gps, setGps] = useState<"buscando" | "ok" | "no">("buscando")
  const [aqui, setAqui] = useState<Coord | null>(null)
  const [desdeAqui, setDesdeAqui] = useState(true)
  const [omitidos, setOmitidos] = useState<Set<string>>(new Set())
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState("")
  const [guardado, setGuardado] = useState(false)

  useEffect(() => {
    if (!navigator.geolocation) { setGps("no"); return }
    navigator.geolocation.getCurrentPosition(
      p => { setAqui({ lat: p.coords.latitude, lng: p.coords.longitude }); setGps("ok") },
      () => setGps("no"),
      { enableHighAccuracy: false, timeout: 7000, maximumAge: 120000 },
    )
  }, [])

  const inicio = desdeAqui && aqui ? aqui : null
  const incluidos: Punto[] = conUbicacion.filter(c => !omitidos.has(c.id)).map(c => ({ id: c.id, lat: Number(c.lat), lng: Number(c.lng) }))
  const plan = useMemo(() => ordenarRuta(incluidos, inicio), [incluidos.map(p => p.id).join(","), inicio?.lat, inicio?.lng]) // eslint-disable-line react-hooks/exhaustive-deps
  const kmPlan = longitudRuta(plan, inicio)
  const kmActual = longitudRuta(incluidos, inicio)           // en el orden en que hoy aparecen en la lista
  const ahorro = Math.max(0, kmActual - kmPlan)
  const minutos = estimarMinutos(kmPlan, plan.length)
  const porId = new Map<string, any>(pendientes.map(c => [c.id, c]))
  const tramos = urlsGoogleRuta(plan, inicio)

  function alternarRuta(r: string) { setRutasSel(s => { const n = new Set(s); n.has(r) ? n.delete(r) : n.add(r); return n }); setGuardado(false) }
  function marcarTodos(marcar: boolean) {
    setOmitidos(s => { const n = new Set(s); conUbicacion.forEach(c => (marcar ? n.delete(c.id) : n.add(c.id))); return n }); setGuardado(false)
  }
  function alternar(id: string) { setOmitidos(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n }); setGuardado(false) }

  async function guardar() {
    setGuardando(true); setError("")
    const orden = [...plan.map(p => p.id), ...sinUbicacion.map(c => c.id), ...conUbicacion.filter(c => omitidos.has(c.id)).map(c => c.id)]
    const r = await llamar("/api/clientes-del-dia", "PUT", { fecha, orden })
    setGuardando(false)
    if (!r.ok) return setError(r.json.error ?? "No se pudo guardar el orden")
    setGuardado(true)
    mutate((k: unknown) => typeof k === "string" && k.startsWith("/api/clientes-del-dia"))
  }

  return (
    <Fondo onCerrar={onCerrar}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2"><RouteIcon className="h-5 w-5 text-navy-accent" /><div><h3 className="text-base font-bold text-white">Planear mi ruta</h3><p className="text-xs text-gray-400">Orden con menos kilómetros para los clientes que te faltan</p></div></div>
        <button onClick={onCerrar} aria-label="Cerrar" className="text-gray-500"><X className="h-5 w-5" /></button>
      </div>

      {isLoading && !data ? <p className="py-8 text-center text-sm text-gray-400"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Cargando tus clientes…</p> : pendientes.length === 0 ? (
        <p className="rounded-xl bg-white/5 px-3 py-6 text-center text-sm text-gray-300">No te quedan clientes por visitar hoy. 🎉</p>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-xs font-semibold text-gray-400">1. ¿Qué ruta vas a trabajar?</p>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => { setRutasSel(new Set()); setGuardado(false) }} className={`rounded-full border px-3 py-1 text-xs font-semibold ${rutasSel.size === 0 ? "border-navy-accent bg-navy-accent text-white" : "border-white/10 text-gray-400"}`}>Todas ({pendientes.length})</button>
              {rutas.map(([r, n]) => (
                <button key={r} onClick={() => alternarRuta(r)} aria-pressed={rutasSel.has(r)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${rutasSel.has(r) ? "border-navy-accent bg-navy-accent text-white" : "border-white/10 text-gray-400"}`}>Ruta {r} ({n})</button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-gray-500">Puedes elegir una o varias rutas. Así el orden se calcula solo con esos clientes.</p>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-400">2. ¿Qué clientes visitas hoy? ({incluidos.length} de {conUbicacion.length})</p>
              <span className="flex gap-3 text-[11px]"><button onClick={() => marcarTodos(true)} className="text-navy-accent">Todos</button><button onClick={() => marcarTodos(false)} className="text-gray-400">Ninguno</button></span>
            </div>
            <div className="max-h-44 overflow-y-auto rounded-xl border border-white/10 bg-dark-bg">
              {[...conUbicacion].sort((a, b) => compararRutas(rutaDe(a.nombre), rutaDe(b.nombre)) || a.nombre.localeCompare(b.nombre)).map(c => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 border-b border-white/5 px-3 py-2 last:border-0">
                  <input type="checkbox" checked={!omitidos.has(c.id)} onChange={() => alternar(c.id)} className="h-4 w-4 shrink-0 accent-[#0D7A70]" />
                  <span className="min-w-0 flex-1 truncate text-sm text-white">{quitarRuta(c.nombre)}</span>
                  <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-gray-300">{rutaDe(c.nombre)}</span>
                </label>
              ))}
              {conUbicacion.length === 0 && <p className="px-3 py-3 text-xs text-gray-500">Esta ruta no tiene clientes con ubicación.</p>}
            </div>
          </div>

          <p className="text-xs font-semibold text-gray-400">3. Recorrido sugerido</p>
          <div className="flex gap-2 text-xs">
            <button onClick={() => setDesdeAqui(true)} disabled={gps !== "ok"} className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 py-2 font-semibold disabled:opacity-40 ${desdeAqui && gps === "ok" ? "border-navy-accent bg-navy-accent/10 text-white" : "border-white/10 text-gray-400"}`}>
              {gps === "buscando" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5" />}
              {gps === "buscando" ? "Buscando tu ubicación…" : gps === "ok" ? "Salir desde donde estoy" : "Sin ubicación (permiso del GPS)"}
            </button>
            <button onClick={() => setDesdeAqui(false)} className={`flex flex-1 items-center justify-center rounded-xl border px-2 py-2 font-semibold ${!desdeAqui || gps !== "ok" ? "border-navy-accent bg-navy-accent/10 text-white" : "border-white/10 text-gray-400"}`}>Solo ordenar los clientes</button>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <Dato t="Paradas" v={String(plan.length)} />
            <Dato t="Recorrido" v={fkm(kmPlan)} />
            <Dato t="Tiempo aprox." v={textoDuracion(minutos)} />
          </div>
          {ahorro >= 0.5 && <p className="rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-center text-xs font-semibold text-success">Ahorras unos {fkm(ahorro)} frente al orden actual de tu lista</p>}

          <div className="rounded-xl border border-white/10 bg-dark-bg">
            {plan.map((p, i) => {
              const c = porId.get(p.id), previo = i === 0 ? inicio : plan[i - 1]
              const tramo = previo ? km(previo, p) * 1.3 : null
              return (
                <div key={p.id} className="flex items-center gap-2 border-b border-white/5 px-3 py-2 last:border-0">
                  <button onClick={() => alternar(p.id)} aria-label={`Quitar ${quitarRuta(c.nombre)} de hoy`} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy-accent text-xs font-bold text-white">{i + 1}</button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white">{quitarRuta(c.nombre)} <span className="ml-1 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-gray-300">{rutaDe(c.nombre)}</span></p>
                    <p className="truncate text-xs text-gray-500">{tramo !== null ? `${fkm(tramo)} desde ${i === 0 ? "tu ubicación" : "la parada anterior"}` : "Primera parada"}{c.direccion ? ` · ${c.direccion}` : ""}</p>
                  </div>
                  <a href={urlWaze(p)} target="_blank" rel="noreferrer" aria-label={`Waze a ${quitarRuta(c.nombre)}`} className="rounded-lg border border-white/10 px-2 py-1.5 text-xs font-bold text-gray-300">Waze</a>
                  <a href={urlGoogleParada(p)} target="_blank" rel="noreferrer" aria-label={`Google Maps a ${quitarRuta(c.nombre)}`} className="rounded-lg border border-white/10 p-1.5 text-gray-300"><Navigation className="h-4 w-4" /></a>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-gray-500">Toca el número de una parada, o quita la marca en la lista de arriba, para dejarla para otro día.</p>

          {conUbicacion.filter(c => omitidos.has(c.id)).length > 0 && (
            <div className="rounded-xl border border-white/10 bg-dark-bg p-2">
              <p className="px-1 pb-1 text-xs font-semibold text-gray-400">Para otro día</p>
              {conUbicacion.filter(c => omitidos.has(c.id)).map(c => (
                <button key={c.id} onClick={() => alternar(c.id)} className="flex w-full items-center justify-between px-1 py-1 text-left text-xs text-gray-400"><span className="truncate">{quitarRuta(c.nombre)}</span><span className="shrink-0 text-navy-accent">Volver a incluir</span></button>
              ))}
            </div>
          )}
          {sinUbicacion.length > 0 && (
            <div className="rounded-xl border border-warning/30 bg-warning/5 p-2">
              <p className="flex items-center gap-1.5 px-1 pb-1 text-xs font-semibold text-warning"><MapPin className="h-3.5 w-3.5" /> {sinUbicacion.length} cliente(s) sin ubicación: van al final</p>
              {sinUbicacion.map(c => <p key={c.id} className="truncate px-1 text-xs text-gray-400">{quitarRuta(c.nombre)}</p>)}
            </div>
          )}

          {error && <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
          {guardado && <p className="flex items-center justify-center gap-1.5 rounded-lg bg-success/10 px-3 py-2 text-xs font-semibold text-success"><Check className="h-4 w-4" /> Listo: tu lista de hoy quedó en este orden.</p>}

          <div className="space-y-2">
            <button onClick={guardar} disabled={guardando || plan.length === 0} className={`${botonPrimario} w-full`}>{guardando ? "Guardando…" : guardado ? "Guardar de nuevo" : "Usar este orden en mi lista de hoy"}</button>
            {tramos.length > 0 && (
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
