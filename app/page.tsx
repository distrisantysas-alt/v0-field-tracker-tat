"use client"

// ============================================================================
// app/page.tsx — Login unificado por rol
// ============================================================================

import { useState, useEffect } from "react"
import { AsesorLayout } from "@/components/asesor/asesor-layout"
import { SupervisorLayout } from "@/components/supervisor/supervisor-layout"
import { GerenciaLayout } from "@/components/gerencia/gerencia-layout"
import { EntregadorLayout } from "@/components/entregador/entregador-layout"
import { Loader2, Mail, ArrowRight, AlertCircle, Lock } from "lucide-react"

type Role = "asesor" | "supervisor" | "gerencia" | "entregador" | null

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
  fetch("/api/auth/logout", { method: "POST" }).catch(() => {})
}

export default function Page() {
  const [session, setSession] = useState<SessionData | null>(null)
  const [ready, setReady]     = useState(false)
  const [cambiarClave, setCambiarClave] = useState(false)

  useEffect(() => {
    const s = getSession()
    if (s) setSession(s)
    try { setCambiarClave(localStorage.getItem("debe_cambiar_clave") === "1") } catch {}
    setReady(true)
  }, [])

  const handleLogin = (data: SessionData, claveTemporal = false) => {
    localStorage.setItem("app_session", JSON.stringify(data))
    try { if (claveTemporal) localStorage.setItem("debe_cambiar_clave", "1") } catch {}
    setCambiarClave(claveTemporal)
    if (data.rol === "asesor") {
      localStorage.setItem("asesor_session", JSON.stringify(data))
    }
    setSession(data)
  }

  const handleLogout = () => {
    try { localStorage.removeItem("debe_cambiar_clave") } catch {}
    setCambiarClave(false)
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

  if (session && cambiarClave) {
    return <CambiarClaveObligatorio onListo={() => { try { localStorage.removeItem("debe_cambiar_clave") } catch {}; setCambiarClave(false) }} onSalir={handleLogout} />
  }

  if (session?.rol === "asesor")      return <AsesorLayout      onBack={handleLogout} />
  if (session?.rol === "supervisor")  return <SupervisorLayout  onBack={handleLogout} />
  if (session?.rol === "gerencia")    return <GerenciaLayout    onBack={handleLogout} />
  if (session?.rol === "entregador")  return (
    <EntregadorLayout
      entregador={session}
      onLogout={handleLogout}
    />
  )

  return <LoginUnificado onLogin={handleLogin} />
}

// ============================================================================
// PANTALLA DE LOGIN UNIFICADO
// ============================================================================

function LoginUnificado({ onLogin }: { onLogin: (data: SessionData, claveTemporal?: boolean) => void }) {
  const [email, setEmail]     = useState("")
  const [clave, setClave]     = useState("")
  const [pedirClave, setPedirClave] = useState(false)
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
        body: JSON.stringify({ email: emailTrimmed, clave: pedirClave ? clave : undefined }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.requiere_clave) setPedirClave(true)
        setError(data.error || "Correo o clave incorrectos")
        return
      }

      onLogin(data.asesor, !!data.clave_temporal)

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

          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(""); setPedirClave(false); setClave("") }}
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

          {pedirClave && (
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <input
                type="password"
                value={clave}
                onChange={e => { setClave(e.target.value); setError("") }}
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
                placeholder="Tu clave"
                autoComplete="current-password"
                autoFocus
                className="w-full rounded-xl border border-white/10 bg-dark-bg pl-11 pr-4 py-3 text-sm text-white placeholder-gray-500 focus:border-navy-accent focus:outline-none focus:ring-2 focus:ring-navy-accent/30"
              />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-danger/10 border border-danger/20 px-3 py-2">
              <AlertCircle className="h-4 w-4 text-danger shrink-0" />
              <p className="text-xs text-danger">{error}</p>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading || !email.trim() || (pedirClave && !clave)}
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

// ============================================================================
// CAMBIO DE CLAVE OBLIGATORIO (tras ingresar con una clave temporal)
// ============================================================================
function CambiarClaveObligatorio({ onListo, onSalir }: { onListo: () => void; onSalir: () => void }) {
  const [actual, setActual]   = useState("")
  const [nueva, setNueva]     = useState("")
  const [repite, setRepite]   = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState("")

  const guardar = async () => {
    if (nueva.length < 6) { setError("La clave nueva debe tener al menos 6 caracteres"); return }
    if (nueva !== repite) { setError("Las claves nuevas no coinciden"); return }
    setLoading(true); setError("")
    try {
      const res = await fetch("/api/auth/cambiar-clave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave_actual: actual, clave_nueva: nueva }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || "No se pudo cambiar la clave"); return }
      onListo()
    } catch {
      setError("Error de conexión. Verifica tu internet.")
    } finally {
      setLoading(false)
    }
  }

  const campo = "w-full rounded-xl border border-white/10 bg-dark-bg px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-navy-accent focus:outline-none"
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-dark-bg px-6 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-dark-surface p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-white">Crea tu clave</h2>
          <p className="text-xs text-gray-400 mt-0.5">Entraste con una clave temporal. Define una propia para continuar.</p>
        </div>
        <input type="password" value={actual} onChange={e => { setActual(e.target.value); setError("") }} placeholder="Clave temporal" autoComplete="current-password" className={campo} />
        <input type="password" value={nueva} onChange={e => { setNueva(e.target.value); setError("") }} placeholder="Clave nueva (mínimo 6)" autoComplete="new-password" className={campo} />
        <input type="password" value={repite} onChange={e => { setRepite(e.target.value); setError("") }} onKeyDown={e => e.key === "Enter" && guardar()} placeholder="Repite la clave nueva" autoComplete="new-password" className={campo} />
        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-danger/10 border border-danger/20 px-3 py-2">
            <AlertCircle className="h-4 w-4 text-danger shrink-0" />
            <p className="text-xs text-danger">{error}</p>
          </div>
        )}
        <button onClick={guardar} disabled={loading || !actual || !nueva || !repite}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-navy-accent py-3 font-semibold text-white transition-all active:scale-[0.97] disabled:opacity-50">
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /><span>Guardando...</span></> : <span>Guardar clave</span>}
        </button>
        <button onClick={onSalir} className="w-full text-center text-xs text-gray-500 hover:text-gray-300">Cerrar sesión</button>
      </div>
    </div>
  )
}
