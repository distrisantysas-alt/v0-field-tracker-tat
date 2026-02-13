"use client"

import { MapPin } from "lucide-react"

type PinStatus = "validada" | "sospechosa" | "en-progreso" | "pendiente" | "omitida"

interface MapPin2 {
  x: number
  y: number
  label: string
  status: PinStatus
  distance?: string
}

const pins: MapPin2[] = [
  { x: 18, y: 22, label: "Don Carlos", status: "validada" },
  { x: 32, y: 35, label: "La Esperanza", status: "validada" },
  { x: 72, y: 18, label: "El Progreso", status: "sospechosa" },
  { x: 25, y: 55, label: "La Esquina", status: "validada" },
  { x: 48, y: 48, label: "Droguería Central", status: "en-progreso", distance: "~15m" },
  { x: 60, y: 65, label: "Hnos. García", status: "pendiente" },
  { x: 80, y: 72, label: "Los Pinos", status: "pendiente" },
  { x: 15, y: 80, label: "T. Familiar", status: "omitida" },
]

const pinColors: Record<PinStatus, string> = {
  validada: "#1A7A4A",
  sospechosa: "#D97706",
  "en-progreso": "#2E6DA4",
  pendiente: "#6B7280",
  omitida: "#DC2626",
}

// User current position
const userPos = { x: 46, y: 46 }

export function MapaTab() {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="px-4 pb-2 pt-4">
        <h2 className="text-lg font-bold text-white">Mapa de Ruta</h2>
        <p className="text-xs text-gray-400">8 puntos de visita asignados</p>
      </div>

      {/* Mock Map */}
      <div className="relative mx-4 flex-1 overflow-hidden rounded-xl border border-white/10 bg-[#0C1520]" style={{ minHeight: "460px" }}>
        {/* Grid pattern (simulated map) */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `
              linear-gradient(rgba(46,109,164,0.3) 1px, transparent 1px),
              linear-gradient(90deg, rgba(46,109,164,0.3) 1px, transparent 1px)
            `,
            backgroundSize: "40px 40px",
          }}
        />

        {/* Street-like lines */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {/* Horizontal streets */}
          <line x1="0" y1="30" x2="100" y2="30" stroke="rgba(46,109,164,0.2)" strokeWidth="0.5" />
          <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(46,109,164,0.25)" strokeWidth="0.7" />
          <line x1="0" y1="70" x2="100" y2="70" stroke="rgba(46,109,164,0.2)" strokeWidth="0.5" />

          {/* Vertical streets */}
          <line x1="25" y1="0" x2="25" y2="100" stroke="rgba(46,109,164,0.2)" strokeWidth="0.5" />
          <line x1="50" y1="0" x2="50" y2="100" stroke="rgba(46,109,164,0.25)" strokeWidth="0.7" />
          <line x1="75" y1="0" x2="75" y2="100" stroke="rgba(46,109,164,0.2)" strokeWidth="0.5" />

          {/* Diagonal avenue */}
          <line x1="10" y1="10" x2="90" y2="85" stroke="rgba(46,109,164,0.15)" strokeWidth="0.8" />

          {/* Route connecting pins (dashed) */}
          <polyline
            points={pins.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="0.4"
            strokeDasharray="2,1.5"
          />
        </svg>

        {/* User position (pulsing blue dot) */}
        <div
          className="absolute z-20 flex items-center justify-center"
          style={{
            left: `${userPos.x}%`,
            top: `${userPos.y}%`,
            transform: "translate(-50%, -50%)",
          }}
        >
          <div className="h-4 w-4 rounded-full border-2 border-white bg-navy-accent shadow-[0_0_12px_rgba(46,109,164,0.6)]">
            <div className="absolute inset-0 animate-ping rounded-full bg-navy-accent/40" />
          </div>
        </div>

        {/* Pin markers */}
        {pins.map((pin, i) => (
          <div
            key={i}
            className="group absolute z-10 cursor-pointer"
            style={{
              left: `${pin.x}%`,
              top: `${pin.y}%`,
              transform: "translate(-50%, -100%)",
            }}
          >
            <div className="relative">
              <MapPin
                className="h-6 w-6 drop-shadow-lg"
                fill={pinColors[pin.status]}
                color={pinColors[pin.status]}
                strokeWidth={1}
              />
              {/* Tooltip on hover */}
              <div className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded-lg bg-dark-surface px-2 py-1 text-[10px] text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                {pin.label}
              </div>
            </div>
          </div>
        ))}

        {/* Legend */}
        <div className="absolute left-3 top-3 z-30 flex flex-col gap-1 rounded-lg bg-dark-bg/90 p-2.5 backdrop-blur-sm">
          {[
            { color: "bg-success", label: "Validada" },
            { color: "bg-warning", label: "Sospechosa" },
            { color: "bg-navy-accent", label: "En Progreso" },
            { color: "bg-gray-500", label: "Pendiente" },
            { color: "bg-danger", label: "Omitida" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <div className={`h-2 w-2 rounded-full ${item.color}`} />
              <span className="text-[9px] text-gray-400">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom floating card */}
      <div className="mx-4 mb-4 mt-3 flex items-center gap-3 rounded-xl border border-white/10 bg-dark-surface p-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy-accent/20">
          <MapPin className="h-5 w-5 text-navy-accent" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">Droguería Central</p>
          <p className="font-mono text-xs text-gray-400">15m de distancia</p>
        </div>
        <button className="rounded-lg bg-success px-4 py-2 text-xs font-bold text-white shadow-lg shadow-success/20 transition-all active:scale-95">
          CHECK-IN
        </button>
      </div>
    </div>
  )
}
