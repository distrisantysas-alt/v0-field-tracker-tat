"use client"

import { Briefcase, Users, Building2 } from "lucide-react"

type Role = "asesor" | "supervisor" | "gerencia"

interface RoleSelectorProps {
  onSelectRole: (role: Role) => void
}

const roles = [
  {
    id: "asesor" as Role,
    title: "Asesor Comercial",
    description: "Gestiona tus visitas del día en campo",
    icon: Briefcase,
    gradient: "from-navy to-navy-accent",
  },
  {
    id: "supervisor" as Role,
    title: "Supervisor",
    description: "Monitorea tu equipo en tiempo real",
    icon: Users,
    gradient: "from-navy-accent to-[#3B82F6]",
  },
  {
    id: "gerencia" as Role,
    title: "Dirección / RRHH",
    description: "Métricas, cumplimiento y nómina",
    icon: Building2,
    gradient: "from-[#1A7A4A] to-[#2E9D5E]",
  },
]

export function RoleSelector({ onSelectRole }: RoleSelectorProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-dark-bg px-6 py-12">
      <div className="mb-12 text-center">
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-white">
          Field Tracker TAT
        </h1>
        <p className="text-sm text-gray-400">
          Sistema de gestión de visitas en campo
        </p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-4">
        {roles.map((role) => {
          const Icon = role.icon
          return (
            <button
              key={role.id}
              onClick={() => onSelectRole(role.id)}
              className="group relative flex items-center gap-5 overflow-hidden rounded-xl border border-white/10 bg-dark-surface p-5 text-left transition-all duration-200 hover:border-navy-accent/50 hover:shadow-[0_0_24px_rgba(46,109,164,0.15)] active:scale-[0.97]"
            >
              <div
                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${role.gradient}`}
              >
                <Icon className="h-7 w-7 text-white" strokeWidth={1.8} />
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-semibold text-white">
                  {role.title}
                </span>
                <span className="text-sm text-gray-400">
                  {role.description}
                </span>
              </div>
              <div className="ml-auto text-gray-500 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-white">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M7.5 5L12.5 10L7.5 15"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </button>
          )
        })}
      </div>

      <p className="mt-12 text-xs text-gray-600">
        v1.0 — Selecciona tu rol para continuar
      </p>
    </div>
  )
}
