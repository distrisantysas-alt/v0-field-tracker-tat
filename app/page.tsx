"use client"

import { useState } from "react"
import { RoleSelector } from "@/components/role-selector"
import { AsesorLayout } from "@/components/asesor/asesor-layout"
import { SupervisorLayout } from "@/components/supervisor/supervisor-layout"
import { GerenciaLayout } from "@/components/gerencia/gerencia-layout"

type Role = "asesor" | "supervisor" | "gerencia" | null

export default function Page() {
  const [role, setRole] = useState<Role>(null)

  if (role === "asesor") {
    return <AsesorLayout onBack={() => setRole(null)} />
  }

  if (role === "supervisor") {
    return <SupervisorLayout onBack={() => setRole(null)} />
  }

  if (role === "gerencia") {
    return <GerenciaLayout onBack={() => setRole(null)} />
  }

  return <RoleSelector onSelectRole={setRole} />
}
