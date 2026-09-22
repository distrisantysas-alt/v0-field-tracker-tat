"use client"

// ============================================================================
// components/asesor/mis-asignaciones.tsx
// Clientes que el supervisor priorizó y te asignó a ti. Actualiza el estado
// a medida que los trabajas: en gestión, ubicado, activado, depurado (si ya
// no existe o no compra hace mucho) — o VENDIDO, que exige el valor del
// pedido y registra una visita real (igual que en la gestión habitual),
// para que cuente en tus estadísticas de siempre.
// ============================================================================

import { useState } from "react"
import useSWR from "swr"
import { Loader2, MapPin, Navigation, DollarSign, X } from "lucide-react"
import { fetcher } from "@/lib/fetcher"
import { obtenerPosicionGPS, soportaGPS } from "@/lib/db"
import type { AsesorSession } from "./login-asesor"

const ESTADOS_SIMPLES = [
  { id: "en_gestion", label: "En gestión" },
  { id: "ubicado",    label: "Ubicado" },
  { id: "activado",   label: "Activado" },
  { id: "depurado",   label: "Depurar" },
] as const

const MOTIVO_LABEL: Record<string, string> = {
  sin_visitar: "Nunca visitado",
  depurar: "Muchas visitas sin pedido",
  sin_pedido: "Sin pedido",
  normal: "Prioridad del supervisor",
}

const ESTADO_BADGE: Record<string, string> = {
  pendiente: "bg-warning/15 text-warning",
  en_gestion: "bg-navy-accent/15 text-navy-accent",
  ubicado: "bg-success/15 text-success",
  activado: "bg-success/15 text-success",
  vendido: "bg-success/15 text-success",
  depurado: "bg-danger/15 text-danger",
}

function shortName(n: string) {
  return n.replace(/^\S+\s/, "").trim()
}

export function MisAsignaciones({ asesor }: { asesor: AsesorSession }) {
  const { data, isLoading, mutate } = useSWR<{ asignaciones: any[] }>(
    "/api/asignaciones",
    fetcher,
    { refreshInterval: 30000 }
  )
  const [actualizando, setActualizando] = useState<string | null>(null)
  const [ventaEnCurso, setVentaEnCurso] = useState<string | null>(null)
  const [valorVenta, setValorVenta] = useState("")
  const [errorVenta, setErrorVenta] = useState<string | null>(null)

  const asignaciones = data?.asignaciones ?? []

  async function cambiarEstadoSimple(id: string, estado: string) {
    setActualizando(id)
    try {
      await fetch(`/api/asignaciones/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado }),
      })
      mutate()
    } catch {}
    finally { setActualizando(null) }
  }

  function abrirFormularioVenta(id: string) {
    setVentaEnCurso(id)
    setValorVenta("")
    setErrorVenta(null)
  }

  async function confirmarVenta(a: any) {
    const valor = parseFloat(valorVenta.replace(/[^\d.]/g, ""))
    if (!valor || valor <= 0) {
      setErrorVenta("Ingresa el valor del pedido")
      return
    }
    if (!soportaGPS()) {
      setErrorVenta("Tu dispositivo no soporta GPS — no se puede registrar la venta")
      return
    }

    setActualizando(a.id)
    setErrorVenta(null)
    try {
      // 1) GPS, igual que en el check-in habitual
      const pos = await obtenerPosicionGPS()

      // 2) Registra la visita real con pedido — así cuenta en tus estadísticas
      const resCheckin = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente_id: a.cliente_id,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          hubo_pedido: true,
          valor_pedido: valor,
          notas: "Venta registrada desde asignación del supervisor",
        }),
      })
      const checkinData = await resCheckin.json()
      if (!resCheckin.ok) throw new Error(checkinData.error || "No se pudo registrar la visita")

      // 3) Marca la asignación como vendida, con el valor y el vínculo a la visita real
      await fetch(`/api/asignaciones/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: "vendido", valorPedido: valor, visitaId: checkinData.visita?.id }),
      })

      setVentaEnCurso(null)
      mutate()
    } catch (e: any) {
      setErrorVenta(e.message || "Necesitas activar el GPS para registrar la venta, igual que en una visita normal")
    } finally {
      setActualizando(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-navy-accent" />
      </div>
    )
  }

  if (asignaciones.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <Navigation className="h-10 w-10 text-gray-600 mb-3" />
        <p className="text-gray-400 text-sm">Tu supervisor no te ha asignado clientes por ahora.</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3">
      <p className="text-xs text-gray-500">
        Clientes que tu supervisor priorizó para ti. Si te compró, marca <b>Vendido</b> y anota el valor —
        igual que en una visita normal. Si solo lo gestionaste, usa las otras opciones.
      </p>
      {asignaciones.map((a: any) => {
        const mapsUrl = a.lat && a.lng
          ? `https://www.google.com/maps/search/?api=1&query=${a.lat},${a.lng}`
          : null
        const enFormularioVenta = ventaEnCurso === a.id

        return (
          <div key={a.id} className="rounded-xl bg-dark-surface border border-white/10 p-4 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{shortName(a.cliente_nombre)}</p>
                <p className="text-[10px] text-gray-500">Ruta {a.ruta} · {MOTIVO_LABEL[a.motivo] || "Prioridad del supervisor"}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${ESTADO_BADGE[a.estado] ?? "bg-white/10 text-gray-300"}`}>
                {a.estado === "vendido" && a.valor_pedido
                  ? `Vendido · $${Math.round(Number(a.valor_pedido)).toLocaleString("es-CO")}`
                  : a.estado.replace("_", " ")}
              </span>
            </div>

            {a.direccion && (
              <p className="flex items-center gap-1 text-[10px] text-gray-500">
                <MapPin className="h-3 w-3 shrink-0" /> {a.direccion}
                {mapsUrl && (
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-navy-accent font-semibold ml-1">
                    cómo llegar
                  </a>
                )}
              </p>
            )}

            {enFormularioVenta ? (
              <div className="space-y-2 rounded-lg bg-white/5 border border-white/10 p-3">
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
                  <input
                    type="number"
                    inputMode="decimal"
                    autoFocus
                    value={valorVenta}
                    onChange={e => { setValorVenta(e.target.value); setErrorVenta(null) }}
                    placeholder="Valor del pedido"
                    className="w-full rounded-lg border border-white/10 bg-dark-bg pl-8 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-navy-accent"
                  />
                </div>
                {errorVenta && <p className="text-[11px] text-danger">{errorVenta}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => confirmarVenta(a)}
                    disabled={actualizando === a.id}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-success/20 border border-success/30 py-2 text-xs font-semibold text-success disabled:opacity-50"
                  >
                    {actualizando === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Confirmar venta"}
                  </button>
                  <button
                    onClick={() => setVentaEnCurso(null)}
                    disabled={actualizando === a.id}
                    className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs font-semibold text-gray-400"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-1.5 flex-wrap">
                <button
                  onClick={() => abrirFormularioVenta(a.id)}
                  disabled={actualizando === a.id}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold border transition-colors disabled:opacity-50 ${
                    a.estado === "vendido"
                      ? "bg-success border-success text-white"
                      : "bg-success/10 border-success/30 text-success hover:bg-success/20"
                  }`}
                >
                  <DollarSign className="h-3 w-3" /> Vendido
                </button>
                {ESTADOS_SIMPLES.map(e => (
                  <button
                    key={e.id}
                    onClick={() => cambiarEstadoSimple(a.id, e.id)}
                    disabled={actualizando === a.id}
                    className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold border transition-colors disabled:opacity-50 ${
                      a.estado === e.id
                        ? "bg-navy-accent border-navy-accent text-white"
                        : "bg-white/5 border-white/10 text-gray-400 hover:text-white"
                    }`}
                  >
                    {actualizando === a.id && a.estado !== e.id ? <Loader2 className="h-3 w-3 animate-spin" /> : e.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
