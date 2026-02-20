"use client"

// ============================================================================
// app/page.tsx — Login unificado por rol
// ============================================================================

import { useState, useEffect } from "react"
import { AsesorLayout } from "@/components/asesor/asesor-layout"
import { SupervisorLayout } from "@/components/supervisor/supervisor-layout"
import { GerenciaLayout } from "@/components/gerencia/gerencia-layout"
import { Loader2, Mail, ArrowRight, AlertCircle } from "lucide-react"

type Role = "asesor" | "supervisor" | "gerencia" | null

interface SessionData {
  id: string
  nombre: string
  email: string
  zona: string | null
  rol: string
}

function getSession(): SessionData | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem("app_session")
    if (!raw) return null
    return JSON.parse(raw) as SessionData
  } catch { return null }
}

function clearSession() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("app_session")
    localStorage.removeItem("asesor_session")
  }
}

export default function Page() {
  const [session, setSession] = useState<SessionData | null>(null)
  const [ready, setReady]     = useState(false)

  useEffect(() => {
    const s = getSession()
    if (s) setSession(s)
    setReady(true)
  }, [])

  const handleLogin = (data: SessionData) => {
    localStorage.setItem("app_session", JSON.stringify(data))
    // Compatibilidad con asesor-layout que usa "asesor_session"
    if (data.rol === "asesor") {
      localStorage.setItem("asesor_session", JSON.stringify(data))
    }
    setSession(data)
  }

  const handleLogout = () => {
    clearSession()
    setSession(null)
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dark-bg">
        <Loader2 className="h-8 w-8 animate-spin text-navy-accent" />
      </div>
    )
  }

  if (session?.rol === "asesor")     return <AsesorLayout     onBack={handleLogout} />
  if (session?.rol === "supervisor") return <SupervisorLayout onBack={handleLogout} />
  if (session?.rol === "gerencia")   return <GerenciaLayout   onBack={handleLogout} />

  return <LoginUnificado onLogin={handleLogin} />
}

// ============================================================================
// PANTALLA DE LOGIN UNIFICADO
// ============================================================================

function LoginUnificado({ onLogin }: { onLogin: (data: SessionData) => void }) {
  const [email, setEmail]     = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState("")

  const handleSubmit = async () => {
    const emailTrimmed = email.trim().toLowerCase()
    if (!emailTrimmed) { setError("Ingresa tu email"); return }

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
        setError(data.error || "Email no encontrado")
        return
      }

      onLogin(data.asesor)

    } catch {
      setError("Error de conexión. Verifica tu internet.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-dark-bg px-6 py-12">

      {/* Logo */}
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold text-white">Field Tracker TAT</h1>
        <p className="mt-2 text-sm text-gray-400">Sistema de gestión de visitas en campo</p>
      </div>

      {/* Card login */}
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-white/10 bg-dark-surface p-6 space-y-4">
          <div>
            <h2 className="text-lg font-bold text-white">Iniciar sesión</h2>
            <p className="text-xs text-gray-400 mt-0.5">Ingresa con tu email registrado</p>
          </div>

          {/* Email */}
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError("") }}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
              placeholder="tu@email.com"
              autoComplete="email"
              autoFocus
              inputMode="email"
              className={`w-full rounded-xl border bg-dark-bg pl-11 pr-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 transition-all ${
                error
                  ? "border-danger focus:ring-danger/30"
                  : "border-white/10 focus:border-navy-accent focus:ring-navy-accent/30"
              }`}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-danger/10 border border-danger/20 px-3 py-2">
              <AlertCircle className="h-4 w-4 text-danger shrink-0" />
              <p className="text-xs text-danger">{error}</p>
            </div>
          )}

          {/* Botón */}
          <button
            onClick={handleSubmit}
            disabled={loading || !email.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-navy-accent py-3 font-semibold text-white transition-all active:scale-[0.97] disabled:opacity-50"
          >
            {loading
              ? <><Loader2 className="h-4 w-4 animate-spin" /><span>Verificando...</span></>
              : <><span>Ingresar</span><ArrowRight className="h-4 w-4" /></>
            }
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-gray-600">
          Tu email debe estar registrado por tu administrador
        </p>
      </div>
    </div>
  )
}
