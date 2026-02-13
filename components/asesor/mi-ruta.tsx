"use client"

import { useState } from "react"
import { Bell, MapPin, Check, AlertTriangle, Clock, X } from "lucide-react"

type ClientStatus = "validada" | "sospechosa" | "en-progreso" | "pendiente" | "omitida"

interface Client {
  name: string
  address: string
  distance: string
  status: ClientStatus
}

const clients: Client[] = [
  { name: "Tienda Don Carlos", address: "Calle 45 #23-10", distance: "~45m", status: "validada" },
  { name: "Minimercado La Esperanza", address: "Av. Principal #8-90", distance: "~62m", status: "validada" },
  { name: "Supermercado El Progreso", address: "Cra 12 #34-56", distance: "~340m", status: "sospechosa" },
  { name: "Tienda La Esquina", address: "Calle 8 #12-34", distance: "~38m", status: "validada" },
  { name: "Droguería Central", address: "Carrera 5 #67-89", distance: "~15m", status: "en-progreso" },
  { name: "Distribuidora Hermanos García", address: "Calle 23 #45-67", distance: "~280m", status: "pendiente" },
  { name: "Minimarket Los Pinos", address: "Av. 30 de Agosto #10-20", distance: "~520m", status: "pendiente" },
  { name: "Tienda Familiar", address: "Cra 18 #90-12", distance: "--", status: "omitida" },
]

const statusConfig: Record<ClientStatus, { color: string; barColor: string; label: string; bgOpacity: string; textColor: string }> = {
  validada: { color: "bg-success", barColor: "bg-success", label: "VALIDADA", bgOpacity: "bg-success/15", textColor: "text-success" },
  sospechosa: { color: "bg-warning", barColor: "bg-warning", label: "SOSPECHOSA", bgOpacity: "bg-warning/15", textColor: "text-warning" },
  "en-progreso": { color: "bg-navy-accent", barColor: "bg-navy-accent", label: "EN PROGRESO", bgOpacity: "bg-navy-accent/15", textColor: "text-navy-accent" },
  pendiente: { color: "bg-gray-500", barColor: "bg-gray-500", label: "PENDIENTE", bgOpacity: "bg-gray-500/15", textColor: "text-gray-400" },
  omitida: { color: "bg-danger", barColor: "bg-danger", label: "OMITIDA", bgOpacity: "bg-danger/15", textColor: "text-danger" },
}

function getCurrentTime() {
  const now = new Date()
  return now.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

export function MiRuta() {
  const [showNoteField, setShowNoteField] = useState(false)
  const [currentTime] = useState(getCurrentTime())
  const validated = clients.filter((c) => c.status === "validada").length
  const suspicious = clients.filter((c) => c.status === "sospechosa").length
  const pending = clients.filter((c) => c.status === "pendiente").length
  const total = clients.length
  const hasActiveCheckin = clients.some((c) => c.status === "en-progreso")

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-navy-accent text-sm font-bold text-white">
            CM
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Carlos Méndez</p>
            <p className="text-xs text-gray-400">Asesor Comercial — Zona Centro</p>
          </div>
        </div>
        <button className="relative flex h-10 w-10 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-white/10 hover:text-white">
          <Bell className="h-5 w-5" />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-danger" />
        </button>
      </div>

      {/* Progress Hero Card */}
      <div className="mx-4 mt-3 overflow-hidden rounded-xl bg-navy p-5">
        {/* Grid pattern overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />

        <div className="relative">
          <div className="flex items-baseline gap-1">
            <span className="text-5xl font-bold tracking-tight text-white">14</span>
            <span className="text-2xl font-medium text-white/50">/ {total}</span>
          </div>
          <p className="mt-0.5 text-sm text-white/60">visitas completadas hoy</p>

          {/* Progress Bar */}
          <div className="relative mt-4 h-3 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-success transition-all duration-500"
              style={{ width: `${(validated / total) * 100}%` }}
            >
              {/* Shimmer */}
              <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            </div>
          </div>

          {/* Mini Stats */}
          <div className="mt-4 flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-success" />
              <span className="text-xs font-medium text-success">{validated} Validadas</span>
            </div>
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
              <span className="text-xs font-medium text-warning">{suspicious} Sospechosas</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-xs font-medium text-gray-400">{pending} Pendientes</span>
            </div>
          </div>

          {/* Current time */}
          <div className="mt-3 text-right">
            <span className="font-mono text-xs text-white/40">{currentTime}</span>
          </div>
        </div>
      </div>

      {/* Client List */}
      <div className="mt-4 flex flex-col gap-2.5 px-4">
        {clients.map((client, idx) => {
          const config = statusConfig[client.status]
          return (
            <div
              key={idx}
              className="flex overflow-hidden rounded-xl border border-white/5 bg-dark-surface transition-all duration-200 active:scale-[0.98]"
            >
              {/* Status Bar */}
              <div className={`w-1 shrink-0 ${config.barColor} ${client.status === "en-progreso" ? "animate-pulse-dot" : ""}`} />

              <div className="flex flex-1 items-center gap-3 px-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">{client.name}</p>
                  <p className="truncate text-xs text-gray-500">{client.address}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-mono text-[11px] text-gray-400">{client.distance}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${config.bgOpacity} ${config.textColor}`}>
                    {config.label}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Check-in FAB */}
      {hasActiveCheckin && (
        <div className="fixed inset-x-0 bottom-16 z-40 px-4 pb-3">
          <button className="flex w-full animate-pulse-glow flex-col items-center justify-center rounded-xl bg-success px-4 py-3.5 text-white shadow-lg shadow-success/25 transition-all active:scale-[0.97]">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              <span className="text-base font-bold">REGISTRAR VISITA</span>
            </div>
            <span className="mt-0.5 text-xs text-white/70">{"Distancia: ~15m"}</span>
          </button>

          {!showNoteField ? (
            <button
              onClick={() => setShowNoteField(true)}
              className="mt-2 w-full text-center text-xs text-gray-500 transition-colors hover:text-gray-300"
            >
              Agregar nota opcional +
            </button>
          ) : (
            <div className="mt-2 flex items-start gap-2">
              <textarea
                className="flex-1 resize-none rounded-lg border border-white/10 bg-dark-surface px-3 py-2 text-xs text-white placeholder:text-gray-500 focus:border-navy-accent focus:outline-none"
                placeholder="Escribe una nota..."
                rows={2}
              />
              <button
                onClick={() => setShowNoteField(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <p className="mt-1.5 text-center font-mono text-[10px] text-gray-600">
            {"GPS activo · Precisión: ±8m"}
          </p>
        </div>
      )}
    </div>
  )
}
