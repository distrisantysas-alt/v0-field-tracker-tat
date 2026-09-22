"use client"
// ============================================================================
// components/asesor/asesor-layout.tsx (CORREGIDO — incluye PWAInstaller)
// ============================================================================
import { useState, useEffect } from "react"
import useSWR from "swr"
import { MapPin, Map, BarChart2, ChevronLeft, ClipboardList } from "lucide-react"
import { MiRuta } from "./mi-ruta"
import { MapaTab } from "./mapa-tab"
import { MisStats } from "./mis-stats"
import { MisAsignaciones } from "./mis-asignaciones"
import { LoginAsesor, clearAsesorSession, type AsesorSession } from "./login-asesor"
import { PWAInstaller } from "@/components/pwa-installer"
import { fetcher } from "@/lib/fetcher"

const tabs = [
  { id: "ruta", label: "Mi Ruta", icon: MapPin },
  { id: "asignado", label: "Asignado", icon: ClipboardList },
  { id: "mapa", label: "Mapa", icon: Map },
  { id: "stats", label: "Mis Stats", icon: BarChart2 },
] as const

type TabId = (typeof tabs)[number]["id"]

interface AsesorLayoutProps {
  onBack: () => void
}

function getSessionFromStorage(): AsesorSession | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem("asesor_session")
    if (!raw) return null
    return JSON.parse(raw) as AsesorSession
  } catch {
    return null
  }
}

export function AsesorLayout({ onBack }: AsesorLayoutProps) {
  const [activeTab, setActiveTab] = useState<TabId>("ruta")
  const [asesor, setAsesor] = useState<AsesorSession | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    const session = getSessionFromStorage()
    if (session) setAsesor(session)
    setCheckingSession(false)
  }, [])

  const handleLogin = (asesorData: AsesorSession) => setAsesor(asesorData)

  const handleLogout = () => {
    clearAsesorSession()
    setAsesor(null)
    onBack()
  }

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dark-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-navy-accent border-t-transparent" />
      </div>
    )
  }

  if (!asesor) {
    return <LoginAsesor onLogin={handleLogin} onBack={onBack} />
  }

  return <AsesorLayoutConSesion asesor={asesor} activeTab={activeTab} setActiveTab={setActiveTab} onLogout={handleLogout} />
}

function AsesorLayoutConSesion({
  asesor, activeTab, setActiveTab, onLogout,
}: {
  asesor: AsesorSession
  activeTab: TabId
  setActiveTab: (t: TabId) => void
  onLogout: () => void
}) {
  const { data: asigData } = useSWR<{ asignaciones: any[] }>("/api/asignaciones", fetcher, { refreshInterval: 30000 })
  const pendientesCount = (asigData?.asignaciones ?? []).filter(
    (a: any) => a.estado === "pendiente" || a.estado === "en_gestion"
  ).length

  return (
    <div className="flex min-h-screen flex-col bg-dark-bg">
      {/* ✅ PWA Installer — banner de actualización + prompt de instalación */}
      <PWAInstaller />

      <main className="flex-1 overflow-y-auto pb-20">
        {activeTab === "ruta"     && <MiRuta  asesor={asesor} />}
        {activeTab === "asignado" && <MisAsignaciones asesor={asesor} />}
        {activeTab === "mapa"     && <MapaTab asesor={asesor} />}
        {activeTab === "stats"    && <MisStats asesor={asesor} />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-dark-bg/95 backdrop-blur-md">
        <div className="flex items-center justify-around py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <button
            onClick={onLogout}
            className="flex flex-col items-center gap-0.5 px-3 py-1.5 text-gray-500 transition-colors hover:text-gray-300"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={1.8} />
            <span className="text-[11px] font-medium">Salir</span>
          </button>

          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex flex-col items-center gap-0.5 px-4 py-1.5 transition-colors duration-200 ${
                  isActive ? "text-navy-accent" : "text-gray-500 hover:text-gray-300"
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={isActive ? 2.2 : 1.8} />
                <span className="text-[11px] font-medium">{tab.label}</span>
                {tab.id === "asignado" && pendientesCount > 0 && (
                  <span className="absolute right-1 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
                    {pendientesCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
