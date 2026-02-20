"use client"

// ============================================================================
// components/role-selector.tsx (ACTUALIZADO)
// - Asesor: visible y con login
// - Supervisor y Dirección: ocultos por defecto, acceso por código
// ============================================================================

import { useState } from "react"
import { Briefcase, Lock } from "lucide-react"

type Role = "asesor" | "supervisor" | "gerencia"

interface RoleSelectorProps {
  onSelectRole: (role: Role) => void
}

export function RoleSelector({ onSelectRole }: RoleSelectorProps) {
  const [showAdmin, setShowAdmin]     = useState(false)
  const [codigo, setCodigo]           = useState("")
  const [error, setError]             = useState("")
  const [tapCount, setTapCount]       = useState(0)

  // Código de acceso para roles administrativos
  // Toca el título 5 veces para revelar el campo de código
  const handleTitleTap = () => {
    const next = tapCount + 1
    setTapCount(next)
    if (next >= 5) {
      setShowAdmin(true)
      setTapCount(0)
    }
  }

  const handleCodigoSubmit = () => {
    // Códigos de acceso — cámbialos por los que quieras
    if (codigo === "SUPER2024") {
      onSelectRole("supervisor")
    } else if (codigo === "ADMIN2024") {
      onSelectRole("gerencia")
    } else {
      setError("Código incorrecto")
      setCodigo("")
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-dark-bg px-6 py-12">

      {/* Logo / Título — toca 5 veces para acceso admin */}
      <div className="mb-10 text-center" onClick={handleTitleTap}>
        <h1 className="text-3xl font-bold text-white">Field Tracker TAT</h1>
        <p className="mt-2 text-sm text-gray-400">Sistema de gestión de visitas en campo</p>
      </div>

      {/* Solo botón de Asesor visible públicamente */}
      <div className="w-full max-w-sm space-y-3">
        <button
          onClick={() => onSelectRole("asesor")}
          className="flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-dark-surface p-5 text-left transition-all active:scale-[0.97] hover:border-navy-accent/50 hover:bg-navy/30"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-navy-accent/20">
            <Briefcase className="h-6 w-6 text-navy-accent" strokeWidth={1.8} />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-white">Asesor Comercial</p>
            <p className="text-xs text-gray-400">Gestiona tus visitas del día en campo</p>
          </div>
          <span className="text-gray-600">›</span>
        </button>

        {/* Campo de código admin — solo visible tras 5 taps en el título */}
        {showAdmin && (
          <div className="rounded-2xl border border-white/10 bg-dark-surface p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Lock className="h-4 w-4 text-gray-500" />
              <p className="text-xs text-gray-400">Acceso administrativo</p>
            </div>
            <input
              type="password"
              value={codigo}
              onChange={e => { setCodigo(e.target.value); setError("") }}
              onKeyDown={e => e.key === "Enter" && handleCodigoSubmit()}
              placeholder="Código de acceso"
              autoFocus
              className="w-full rounded-xl border border-white/10 bg-dark-bg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:border-navy-accent focus:outline-none"
            />
            {error && <p className="text-xs text-danger">{error}</p>}
            <button
              onClick={handleCodigoSubmit}
              disabled={!codigo}
              className="w-full rounded-xl bg-navy-accent py-2.5 text-sm font-semibold text-white disabled:opacity-40 transition-all active:scale-[0.97]"
            >
              Ingresar
            </button>
          </div>
        )}
      </div>

      <p className="mt-8 text-xs text-gray-600">v1.0 — Selecciona tu rol para continuar</p>
    </div>
  )
}
