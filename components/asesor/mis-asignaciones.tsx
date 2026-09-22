"use client"

// ============================================================================
// components/asesor/mis-asignaciones.tsx
// Clientes que el supervisor priorizó y te asignó a ti. Actualiza el estado
// a medida que los trabajas: en gestión, ubicado, activado, vendido o
// depurado (si ya no existe o no compra hace mucho).
// ============================================================================

import { useState } from "react"
import useSWR from "swr"
import { Loader2, MapPin, Navigation } from "lucide-react"
import { fetcher } from "@/lib/fetcher"
import type { AsesorSession } from "./login-asesor"

const ESTADOS = [
  { id: "en_gestion", label: "En gestión" },
  { id: "ubicado",    label: "Ubicado" },
  { id: "activado",   label: "Activado" },
  { id: "vendido",    label: "Vendido" },
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

  const asignaciones = data?.asignaciones ?? []

  async function cambiarEstado(id: string, estado: string) {
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
        Clientes que tu supervisor priorizó para ti. Marca el estado a medida que avances.
      </p>
      {asignaciones.map((a: any) => {
        const mapsUrl = a.lat && a.lng
          ? `https://www.google.com/maps/search/?api=1&query=${a.lat},${a.lng}`
          : null
        return (
          <div key={a.id} className="rounded-xl bg-dark-surface border border-white/10 p-4 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{shortName(a.cliente_nombre)}</p>
                <p className="text-[10px] text-gray-500">Ruta {a.ruta} · {MOTIVO_LABEL[a.motivo] || "Prioridad del supervisor"}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${ESTADO_BADGE[a.estado] ?? "bg-white/10 text-gray-300"}`}>
                {a.estado.replace("_", " ")}
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

            <div className="flex gap-1.5 flex-wrap">
              {ESTADOS.map(e => (
                <button
                  key={e.id}
                  onClick={() => cambiarEstado(a.id, e.id)}
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
          </div>
        )
      })}
    </div>
  )
}
