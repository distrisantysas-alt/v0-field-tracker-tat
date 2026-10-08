"use client"

// ============================================================================
// components/supervisor/supervisor-reasignar-rutas.tsx
// Reasignar por RUTA: se busca la ruta (o el asesor que la tiene), se marcan una o
// varias y se pasan a otro asesor en un solo paso. Las rutas cuyo asesor fue
// desactivado salen primero ("Sin asesor activo"), que son las que hay que repartir.
// ============================================================================

import { useMemo, useState } from "react"
import useSWR from "swr"
import { Search, Loader2, CheckSquare, Square, ArrowRightLeft, AlertTriangle, X } from "lucide-react"
import { fetcher } from "@/lib/fetcher"

type Dueno = { asesor_id: string | null; nombre: string; activo: boolean; clientes: number }
type RutaFila = { ruta: string; total: number; duenos: Dueno[]; sin_asesor_activo: number }
type AsesorDest = { id: string; nombre: string; zona: string | null; clientes: number }

export function ReasignarRutas() {
  const { data, isLoading, error, mutate } = useSWR<{ rutas: RutaFila[]; asesores: AsesorDest[]; error?: string }>(
    "/api/admin/reasignar-ruta",
    fetcher
  )
  const [busqueda, setBusqueda] = useState("")
  const [soloSinAsesor, setSoloSinAsesor] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [destino, setDestino] = useState("")
  const [confirmando, setConfirmando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null)

  const rutas = data?.rutas ?? []
  const asesores = data?.asesores ?? []
  const huerfanas = rutas.filter(r => r.sin_asesor_activo > 0)

  const visibles = useMemo(() => {
    const q = busqueda.trim().toUpperCase()
    return rutas.filter(r => {
      if (soloSinAsesor && r.sin_asesor_activo === 0) return false
      if (!q) return true
      return r.ruta.includes(q) || r.duenos.some(d => d.nombre.toUpperCase().includes(q))
    })
  }, [rutas, busqueda, soloSinAsesor])

  const clientesSel = rutas.filter(r => sel.has(r.ruta)).reduce((s, r) => s + r.total, 0)
  const destinoNombre = asesores.find(a => a.id === destino)?.nombre ?? ""

  function alternar(ruta: string) {
    setConfirmando(false)
    setSel(prev => {
      const n = new Set(prev)
      if (n.has(ruta)) n.delete(ruta)
      else n.add(ruta)
      return n
    })
  }
  function seleccionarVisibles() {
    setConfirmando(false)
    setSel(prev => {
      const todasMarcadas = visibles.length > 0 && visibles.every(r => prev.has(r.ruta))
      const n = new Set(prev)
      for (const r of visibles) todasMarcadas ? n.delete(r.ruta) : n.add(r.ruta)
      return n
    })
  }

  async function reasignar() {
    setEnviando(true)
    setMensaje(null)
    try {
      const res = await fetch("/api/admin/reasignar-ruta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rutas: [...sel], asesor_destino_id: destino }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || "No se pudo reasignar")
      const de = (json.de ?? []).slice(0, 3).map((d: any) => `${d.nombre} (${d.clientes})`).join(", ")
      setMensaje({ ok: true, texto: `${json.mensaje}${de ? ` · venían de: ${de}` : ""}` })
      setSel(new Set())
      setConfirmando(false)
      mutate()
    } catch (e: any) {
      setMensaje({ ok: false, texto: e.message || "No se pudo reasignar" })
      setConfirmando(false)
    } finally {
      setEnviando(false)
    }
  }

  if (isLoading) {
    return <div className="flex h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-navy-accent" /></div>
  }
  if (error || data?.error) {
    return <p className="px-4 py-8 text-center text-xs text-danger">{data?.error || "No se pudieron cargar las rutas."}</p>
  }

  return (
    <div className="flex flex-col">
      <div className="px-4 pb-2 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar ruta (84) o asesor que la tiene"
            className="w-full rounded-lg border border-white/10 bg-dark-surface pl-9 pr-8 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-navy-accent"
          />
          {busqueda && (
            <button onClick={() => setBusqueda("")} aria-label="Limpiar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setSoloSinAsesor(false)}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold ${!soloSinAsesor ? "bg-navy-accent text-white" : "bg-dark-surface text-gray-400 border border-white/10"}`}
          >
            Todas ({rutas.length})
          </button>
          <button
            onClick={() => setSoloSinAsesor(true)}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold ${soloSinAsesor ? "bg-danger text-white" : "bg-dark-surface text-gray-400 border border-white/10"}`}
          >
            Sin asesor activo ({huerfanas.length})
          </button>
          <button onClick={seleccionarVisibles} className="ml-auto text-[11px] text-navy-accent">
            {visibles.length > 0 && visibles.every(r => sel.has(r.ruta)) ? "Quitar selección" : `Marcar ${visibles.length} visibles`}
          </button>
        </div>
      </div>

      {mensaje && (
        <p className={`mx-4 mb-2 rounded-lg border px-3 py-2 text-[11px] ${mensaje.ok ? "border-success/30 bg-success/10 text-gray-200" : "border-danger/30 bg-danger/10 text-danger"}`}>
          {mensaje.ok ? "✅ " : "❌ "}{mensaje.texto}
        </p>
      )}

      <div className="space-y-1.5 px-4 pb-44">
        {visibles.map(r => {
          const marcada = sel.has(r.ruta)
          const principales = r.duenos.slice(0, 2)
          const resto = r.duenos.length - principales.length
          return (
            <button
              key={r.ruta}
              onClick={() => alternar(r.ruta)}
              className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                marcada ? "border-navy-accent bg-navy-accent/10" : "border-white/10 bg-dark-surface"
              }`}
            >
              <div className="mt-0.5 shrink-0">
                {marcada ? <CheckSquare className="h-4 w-4 text-navy-accent" /> : <Square className="h-4 w-4 text-gray-600" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-white">Ruta {r.ruta}</p>
                  <span className="text-[11px] text-gray-500">{r.total.toLocaleString("es-CO")} cliente{r.total === 1 ? "" : "s"}</span>
                  {r.sin_asesor_activo > 0 && (
                    <span className="flex items-center gap-1 rounded-full bg-danger/15 px-2 py-0.5 text-[10px] font-bold text-danger">
                      <AlertTriangle className="h-2.5 w-2.5" />
                      {r.sin_asesor_activo === r.total ? "Sin asesor activo" : `${r.sin_asesor_activo} sin asesor activo`}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-gray-400">
                  {principales.map(d => `${d.nombre} (${d.clientes})`).join(" · ")}
                  {resto > 0 && ` · +${resto} más`}
                </p>
              </div>
            </button>
          )
        })}
        {visibles.length === 0 && (
          <p className="py-10 text-center text-xs text-gray-500">
            {soloSinAsesor ? "No hay rutas sin asesor activo. Todas tienen dueño." : "Ninguna ruta coincide con la búsqueda."}
          </p>
        )}
      </div>

      {/* Barra de acción */}
      <div className="fixed inset-x-0 bottom-16 z-40 border-t border-white/10 bg-dark-bg/95 backdrop-blur-md px-4 py-3 space-y-2">
        {confirmando ? (
          <>
            <p className="text-xs text-gray-200">
              ¿Pasar <b className="text-white">{sel.size} ruta{sel.size === 1 ? "" : "s"}</b> ({clientesSel.toLocaleString("es-CO")} clientes) a <b className="text-white">{destinoNombre}</b>?
              Los clientes salen de su asesor actual.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmando(false)} disabled={enviando} className="flex-1 rounded-lg border border-white/10 py-2 text-xs font-semibold text-gray-300">
                Cancelar
              </button>
              <button onClick={reasignar} disabled={enviando} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-navy-accent py-2 text-xs font-semibold text-white disabled:opacity-50">
                {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRightLeft className="h-3.5 w-3.5" />}
                Sí, reasignar
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-xs font-semibold text-gray-400">
              {sel.size} ruta{sel.size === 1 ? "" : "s"}{sel.size > 0 ? ` · ${clientesSel.toLocaleString("es-CO")} cl.` : ""}
            </span>
            <select
              value={destino}
              onChange={e => { setDestino(e.target.value); setConfirmando(false) }}
              aria-label="Asesor que recibe"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-dark-surface px-2 py-2 text-xs text-white focus:border-navy-accent focus:outline-none"
            >
              <option value="">Pasar a…</option>
              {asesores.map(a => (
                <option key={a.id} value={a.id}>{a.nombre} · {a.clientes.toLocaleString("es-CO")} cl.</option>
              ))}
            </select>
            <button
              onClick={() => setConfirmando(true)}
              disabled={sel.size === 0 || !destino}
              className="shrink-0 rounded-lg bg-navy-accent px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
            >
              Reasignar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
