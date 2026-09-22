"use client"

// ============================================================================
// components/supervisor/supervisor-rutas.tsx
// Supervisor elige una ruta (ordenadas 1..N), ve sus clientes ordenados por
// urgencia (sin visitar primero, luego más visitas sin pedido) y envía los
// que quiera al asesor dueño de cada uno. El asesor los ve de inmediato en
// su propia app ("Asignado").
// ============================================================================

import { useState, useMemo } from "react"
import useSWR from "swr"
import { Search, Send, Loader2, MapPin, CheckSquare, Square, History } from "lucide-react"
import { fetcher } from "@/lib/fetcher"

type Cliente = {
  id: string
  codigo: string
  nombre: string
  direccion: string | null
  lat: number | null
  lng: number | null
  asesorId: string
  asesorNombre: string
  totalVisitas: number
  totalPedidos: number
  visitasSinPedido: number
  nuncaVisitado: boolean
  diasSinVisita: number | null
  motivo: "sin_visitar" | "sin_pedido" | "depurar" | "normal"
}

type RutaGrupo = {
  ruta: string
  totalClientes: number
  sinVisitar: number
  depurarCandidatos: number
  clientes: Cliente[]
}

const MOTIVO_LABEL: Record<string, string> = {
  sin_visitar: "Sin visitar",
  depurar: "Depurar",
  sin_pedido: "Sin pedido",
  normal: "Normal",
}
const MOTIVO_CLASS: Record<string, string> = {
  sin_visitar: "bg-danger/15 text-danger",
  depurar: "bg-danger/25 text-danger",
  sin_pedido: "bg-warning/15 text-warning",
  normal: "bg-white/5 text-gray-400",
}

function shortName(n: string) {
  return n.replace(/^\S+\s/, "").trim()
}

export function SupervisorRutas() {
  const { data, isLoading, mutate } = useSWR<{ rutas: RutaGrupo[] }>("/api/admin/rutas", fetcher)
  const { data: historialData, mutate: mutateHistorial } = useSWR<{ asignaciones: any[] }>(
    "/api/admin/asignaciones",
    fetcher
  )

  const [rutaSel, setRutaSel] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState("")
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [verHistorial, setVerHistorial] = useState(false)

  const rutas = data?.rutas ?? []

  const rutasFiltradas = useMemo(() => {
    const q = busqueda.trim().toUpperCase()
    return q ? rutas.filter(r => r.ruta.includes(q)) : rutas
  }, [rutas, busqueda])

  const grupoActivo = useMemo(() => {
    const rutaActual = rutaSel ?? rutasFiltradas[0]?.ruta ?? null
    return rutas.find(r => r.ruta === rutaActual) ?? null
  }, [rutas, rutaSel, rutasFiltradas])

  function toggleCliente(id: string) {
    setSeleccionados(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function enviarSeleccionados() {
    if (!grupoActivo || seleccionados.size === 0) return
    setEnviando(true)
    setMensaje(null)
    try {
      const clientes = grupoActivo.clientes
        .filter(c => seleccionados.has(c.id))
        .map(c => ({ clienteId: c.id, ruta: grupoActivo.ruta, motivo: c.motivo }))

      const res = await fetch("/api/admin/asignaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientes }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Error al enviar")

      setMensaje(`✅ ${json.creadas} cliente${json.creadas === 1 ? "" : "s"} enviado${json.creadas === 1 ? "" : "s"} a su asesor`)
      setSeleccionados(new Set())
      mutateHistorial()
    } catch (e: any) {
      setMensaje(`❌ ${e.message || "Error al enviar"}`)
    } finally {
      setEnviando(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-navy-accent" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Resumen */}
      <div className="px-4 pt-3 pb-2">
        <p className="text-xs text-gray-400">
          {rutas.length} rutas · {rutas.reduce((s, r) => s + r.totalClientes, 0).toLocaleString("es-CO")} clientes activos ·{" "}
          <span className="text-danger font-semibold">{rutas.reduce((s, r) => s + r.sinVisitar, 0).toLocaleString("es-CO")} nunca visitados</span> ·{" "}
          <span className="text-danger font-semibold">{rutas.reduce((s, r) => s + r.depurarCandidatos, 0)} candidatos a depurar</span>
        </p>
      </div>

      {/* Buscar ruta */}
      <div className="px-4 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar ruta (ej: 84)"
            className="w-full rounded-lg border border-white/10 bg-dark-surface pl-9 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-navy-accent"
          />
        </div>
      </div>

      {/* Tabs de ruta */}
      <div className="flex gap-2 overflow-x-auto px-4 pb-3">
        {rutasFiltradas.map(r => {
          const urgente = r.sinVisitar + r.depurarCandidatos
          const activo = (rutaSel ?? rutasFiltradas[0]?.ruta) === r.ruta
          return (
            <button
              key={r.ruta}
              onClick={() => { setRutaSel(r.ruta); setSeleccionados(new Set()) }}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                activo ? "bg-navy-accent text-white" : "bg-dark-surface text-gray-400 border border-white/10"
              }`}
            >
              Ruta {r.ruta}
              {urgente > 0 && <span className="ml-1 text-warning">({urgente})</span>}
            </button>
          )
        })}
        {rutasFiltradas.length === 0 && <p className="text-xs text-gray-500 py-2">Sin rutas que coincidan.</p>}
      </div>

      {/* Tabla de clientes de la ruta */}
      {grupoActivo && (
        <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-2">
          {grupoActivo.totalClientes > grupoActivo.clientes.length && (
            <p className="text-[10px] text-gray-500 mb-1">
              Mostrando los {grupoActivo.clientes.length} más urgentes de {grupoActivo.totalClientes} clientes en esta ruta.
            </p>
          )}
          {grupoActivo.clientes.map(c => {
            const sel = seleccionados.has(c.id)
            return (
              <button
                key={c.id}
                onClick={() => toggleCliente(c.id)}
                className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                  sel ? "border-navy-accent bg-navy-accent/10" : "border-white/10 bg-dark-surface"
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {sel ? <CheckSquare className="h-4 w-4 text-navy-accent" /> : <Square className="h-4 w-4 text-gray-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-white truncate">{shortName(c.nombre)}</p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${MOTIVO_CLASS[c.motivo]}`}>
                      {MOTIVO_LABEL[c.motivo]}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    Asesor: {c.asesorNombre || "sin asignar"}
                    {c.diasSinVisita != null && ` · ${c.diasSinVisita}d sin visita`}
                    {` · ${c.totalPedidos} pedido${c.totalPedidos === 1 ? "" : "s"}/${c.totalVisitas} visitas`}
                  </p>
                  {c.direccion && (
                    <p className="flex items-center gap-1 text-[10px] text-gray-600 mt-0.5">
                      <MapPin className="h-2.5 w-2.5" /> {c.direccion}
                    </p>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Barra de envío */}
      <div className="fixed inset-x-0 bottom-16 z-40 border-t border-white/10 bg-dark-bg/95 backdrop-blur-md px-4 py-3 flex items-center gap-3">
        <span className="text-xs font-semibold text-gray-400 shrink-0">{seleccionados.size} seleccionado{seleccionados.size === 1 ? "" : "s"}</span>
        {mensaje && <span className="text-xs truncate flex-1">{mensaje}</span>}
        <button
          onClick={enviarSeleccionados}
          disabled={seleccionados.size === 0 || enviando}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-navy-accent px-3 py-2 text-xs font-semibold text-white disabled:opacity-40 shrink-0"
        >
          {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Enviar al asesor
        </button>
      </div>

      {/* Historial (colapsable) */}
      <div className="px-4 pt-2 pb-4">
        <button
          onClick={() => setVerHistorial(v => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-white"
        >
          <History className="h-3.5 w-3.5" /> {verHistorial ? "Ocultar" : "Ver"} historial de asignaciones ({historialData?.asignaciones?.length ?? 0})
        </button>
        {verHistorial && (
          <div className="mt-2 space-y-1.5">
            {(historialData?.asignaciones ?? []).slice(0, 50).map((a: any) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg bg-dark-surface border border-white/10 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white truncate">{shortName(a.cliente_nombre)}</p>
                  <p className="text-[10px] text-gray-500">Ruta {a.ruta} → {a.asesor_nombre}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${
                  a.estado === "vendido" ? "bg-success/20 text-success" : "bg-white/10 text-gray-300"
                }`}>
                  {a.estado === "vendido" && a.valor_pedido
                    ? `Vendido · $${Math.round(Number(a.valor_pedido)).toLocaleString("es-CO")}`
                    : a.estado.replace("_", " ")}
                </span>
              </div>
            ))}
            {(historialData?.asignaciones?.length ?? 0) === 0 && (
              <p className="text-xs text-gray-500">Todavía no se ha enviado ningún cliente.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
