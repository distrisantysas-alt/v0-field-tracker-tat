"use client"

import { useState, useEffect } from "react"
import { RoleSelector } from "@/components/role-selector"
import { AsesorLayout } from "@/components/asesor/asesor-layout"
import { SupervisorLayout } from "@/components/supervisor/supervisor-layout"
import { GerenciaLayout } from "@/components/gerencia/gerencia-layout"

type Role = "asesor" | "supervisor" | "gerencia" | null

function getRoleFromStorage(): Role {
  if (typeof window === "undefined") return null
  try {
    // Si hay sesión de asesor activa, volver directo al asesor
    const session = localStorage.getItem("asesor_session")
    if (session) {
      const parsed = JSON.parse(session)
      if (parsed?.id) return "asesor"
    }
  } catch {}
  return null
}

export default function Page() {
  const [role, setRole] = useState<Role>(null)
  const [ready, setReady] = useState(false)

  // Al montar, verificar si hay sesión activa de asesor
  useEffect(() => {
    const savedRole = getRoleFromStorage()
    if (savedRole) setRole(savedRole)
    setReady(true)
  }, [])

  // Mientras verifica la sesión, pantalla en blanco breve
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dark-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-navy-accent border-t-transparent" />
      </div>
    )
  }

  if (role === "asesor") {
    return (
      <AsesorLayout
        onBack={() => {
          setRole(null)
        }}
      />
    )
  }

  if (role === "supervisor") {
    return <SupervisorLayout onBack={() => setRole(null)} />
  }

  if (role === "gerencia") {
    return <GerenciaLayout onBack={() => setRole(null)} />
  }

  return <RoleSelector onSelectRole={setRole} />
}
