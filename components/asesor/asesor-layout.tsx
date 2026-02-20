"use client"

// ============================================================================
// components/asesor/login-asesor.tsx
// ============================================================================
// Pantalla de login del asesor con email
// Busca en tabla asesores via /api/auth/login
// Guarda sesión en localStorage
// ============================================================================

import { useState } from "react"
import { Loader2, Mail, ArrowRight, AlertCircle } from "lucide-react"

export interface AsesorSession {
  id: string
  nombre: string
  email: string
  zona: string | null
}

interface LoginAsesorProps {
  onLogin: (asesor: AsesorSession) => void
  onBack: () => void
}

export function LoginAsesor({ onLogin, onBack }: LoginAsesorProps) {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async () => {
    const emailTrimmed = email.trim()
    if (!emailTrimmed) {
      setError("Ingresa tu email")
      return
    }

    setLoading(true)
    setError("")

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailTrimmed }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Error al iniciar sesión")
        return
      }

      // Guardar sesión en localStorage
      localStorage.setItem("asesor_session", JSON.stringify(data.asesor))

      onLogin(data.asesor)
    } catch (err) {
      setError("Error de conexión. Verifica tu internet.")
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSubmit()
  }

  // Iniciales del email para el avatar placeholder
  const initials = email.trim().slice(0, 2).toUpperCase() || "??"

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-dark-bg px-6 py-12">

      {/* Back button */}
      <button
        onClick={onBack}
        className="absolute left-4 top-4 p-2 text-gray-500 hover:text-white transition-colors"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Avatar circular animado */}
      <div className="mb-8 relative">
        <div className="h-20 w-20 rounded-full bg-gradient-to-br from-navy to-navy-accent flex items-center justify-center">
          <span className="text-2xl font-bold text-white">{initials}</span>
        </div>
        <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-success border-2 border-dark-bg" />
      </div>

      {/* Título */}
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-white mb-1">Asesor Comercial</h1>
        <p className="text-sm text-gray-400">Ingresa con tu email registrado</p>
      </div>

      {/* Campo email */}
      <div className="w-full max-w-sm space-y-4">
        <div className="relative">
          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500" />
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setError("")
            }}
            onKeyDown={handleKeyDown}
            placeholder="tu@email.com"
            autoComplete="email"
            autoFocus
            inputMode="email"
            className={`w-full rounded-xl border bg-dark-surface pl-12 pr-4 py-4 text-white placeholder-gray-500 
              focus:outline-none focus:ring-2 transition-all
              ${error
                ? "border-danger focus:ring-danger/30"
                : "border-white/10 focus:border-navy-accent focus:ring-navy-accent/30"
              }`}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-danger/10 border border-danger/20 px-3 py-2">
            <AlertCircle className="h-4 w-4 text-danger shrink-0" />
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        {/* Botón */}
        <button
          onClick={handleSubmit}
          disabled={loading || !email.trim()}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-navy-accent py-4 font-semibold text-white
            transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed
            hover:bg-navy-accent/90 shadow-lg shadow-navy-accent/20"
        >
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Verificando...</span>
            </>
          ) : (
            <>
              <span>Ingresar</span>
              <ArrowRight className="h-5 w-5" />
            </>
          )}
        </button>

        <p className="text-center text-xs text-gray-600 mt-4">
          Tu email debe estar registrado por tu supervisor
        </p>
      </div>
    </div>
  )
}

// ============================================================================
// Hook para manejar la sesión del asesor
// ============================================================================
export function useAsesorSession(): AsesorSession | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem("asesor_session")
    if (!raw) return null
    return JSON.parse(raw) as AsesorSession
  } catch {
    return null
  }
}

export function clearAsesorSession() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("asesor_session")
  }
}
