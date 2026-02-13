"use client"

import { useState } from "react"
import { Users, Map, AlertTriangle, FileText, ChevronLeft } from "lucide-react"

const sidebarItems = [
  { id: "equipo", label: "Mi Equipo", icon: Users },
  { id: "mapa", label: "Mapa en Vivo", icon: Map },
  { id: "alertas", label: "Alertas", icon: AlertTriangle, badge: 3 },
  { id: "reportes", label: "Reportes", icon: FileText },
] as const

type TabId = (typeof sidebarItems)[number]["id"]

interface SupervisorLayoutProps {
  onBack: () => void
}

export function SupervisorLayout({ onBack }: SupervisorLayoutProps) {
  const [activeTab, setActiveTab] = useState<TabId>("equipo")

  return (
    <div className="flex min-h-screen bg-light-bg">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r border-gray-200 bg-navy">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
          <button
            onClick={onBack}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <h2 className="text-sm font-bold text-white">Field Tracker TAT</h2>
            <p className="text-xs text-white/50">Panel Supervisor</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3">
          {sidebarItems.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.id
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-white/15 text-white"
                    : "text-white/60 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={1.8} />
                <span>{item.label}</span>
                {item.badge && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">
                    {item.badge}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-accent text-xs font-bold text-white">
              MR
            </div>
            <div>
              <p className="text-sm font-medium text-white">María Rodríguez</p>
              <p className="text-xs text-white/50">Supervisor Zona Norte</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8">
        {activeTab === "equipo" && <EquipoView />}
        {activeTab === "mapa" && <MapaVivoView />}
        {activeTab === "alertas" && <AlertasView />}
        {activeTab === "reportes" && <ReportesView />}
      </main>
    </div>
  )
}

function EquipoView() {
  const asesores = [
    { name: "Carlos Méndez", zona: "Centro", visitas: "14/20", status: "activo", pct: 70 },
    { name: "Ana Gutiérrez", zona: "Norte", visitas: "18/20", status: "activo", pct: 90 },
    { name: "Luis Ramírez", zona: "Sur", visitas: "10/22", status: "activo", pct: 45 },
    { name: "Patricia López", zona: "Este", visitas: "16/18", status: "activo", pct: 89 },
    { name: "Jorge Herrera", zona: "Oeste", visitas: "0/15", status: "inactivo", pct: 0 },
  ]

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-gray-900">Mi Equipo</h1>
      <p className="mb-6 text-sm text-gray-500">5 asesores asignados a tu zona</p>

      <div className="grid gap-4">
        {asesores.map((a) => (
          <div key={a.name} className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">
              {a.name.split(" ").map((n) => n[0]).join("")}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-900">{a.name}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    a.status === "activo"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {a.status}
                </span>
              </div>
              <p className="text-xs text-gray-500">Zona {a.zona}</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-gray-900">{a.visitas}</p>
              <div className="mt-1 h-1.5 w-20 overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full transition-all ${a.pct >= 80 ? "bg-success" : a.pct >= 50 ? "bg-warning" : "bg-danger"}`}
                  style={{ width: `${a.pct}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MapaVivoView() {
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-gray-900">Mapa en Vivo</h1>
      <p className="mb-6 text-sm text-gray-500">Ubicación en tiempo real de tu equipo</p>
      <div className="flex h-[500px] items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50">
        <div className="text-center">
          <Map className="mx-auto mb-3 h-12 w-12 text-gray-300" />
          <p className="text-sm text-gray-400">Mapa en tiempo real</p>
          <p className="text-xs text-gray-300">Conecta un proveedor de mapas para visualizar</p>
        </div>
      </div>
    </div>
  )
}

function AlertasView() {
  const alertas = [
    { tipo: "sospechosa", msg: "Visita de Luis Ramírez a 340m del punto registrado", hora: "10:34 AM", tienda: "Supermercado El Progreso" },
    { tipo: "inactividad", msg: "Jorge Herrera sin actividad desde las 8:00 AM", hora: "11:15 AM", tienda: "" },
    { tipo: "omision", msg: "Carlos Méndez omitió 'Tienda Familiar' sin justificación", hora: "09:22 AM", tienda: "Tienda Familiar" },
  ]

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-gray-900">Alertas</h1>
      <p className="mb-6 text-sm text-gray-500">3 alertas requieren tu atención</p>

      <div className="grid gap-3">
        {alertas.map((a, i) => (
          <div key={i} className="flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div
              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                a.tipo === "sospechosa" ? "bg-amber-100 text-amber-600" : a.tipo === "inactividad" ? "bg-red-100 text-red-600" : "bg-orange-100 text-orange-600"
              }`}
            >
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">{a.msg}</p>
              {a.tienda && <p className="text-xs text-gray-500">{a.tienda}</p>}
            </div>
            <span className="shrink-0 text-xs text-gray-400 font-mono">{a.hora}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ReportesView() {
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-gray-900">Reportes</h1>
      <p className="mb-6 text-sm text-gray-500">Genera y descarga reportes de tu equipo</p>

      <div className="grid grid-cols-2 gap-4">
        {[
          { title: "Reporte Diario", desc: "Resumen de visitas del día" },
          { title: "Reporte Semanal", desc: "Rendimiento acumulado semanal" },
          { title: "Cumplimiento TAT", desc: "% de clientes visitados vs plan" },
          { title: "Incidencias", desc: "Visitas sospechosas y omisiones" },
        ].map((r) => (
          <div key={r.title} className="flex flex-col items-start rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <FileText className="mb-3 h-8 w-8 text-navy" />
            <h3 className="font-semibold text-gray-900">{r.title}</h3>
            <p className="mb-4 text-xs text-gray-500">{r.desc}</p>
            <button className="mt-auto rounded-lg bg-navy px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-navy-accent">
              Generar
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
