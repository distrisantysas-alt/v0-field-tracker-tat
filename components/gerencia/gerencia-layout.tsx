"use client"

import { useState } from "react"
import { LayoutDashboard, Users, Globe, Download, ChevronLeft, TrendingUp, TrendingDown } from "lucide-react"

const sidebarItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "asesores", label: "Asesores", icon: Users },
  { id: "zonas", label: "Zonas", icon: Globe },
  { id: "exportar", label: "Exportar", icon: Download },
] as const

type TabId = (typeof sidebarItems)[number]["id"]

interface GerenciaLayoutProps {
  onBack: () => void
}

export function GerenciaLayout({ onBack }: GerenciaLayoutProps) {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard")

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
            <p className="text-xs text-white/50">Dirección / RRHH</p>
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
              </button>
            )
          })}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-success text-xs font-bold text-white">
              DP
            </div>
            <div>
              <p className="text-sm font-medium text-white">Diana Pineda</p>
              <p className="text-xs text-white/50">Dirección Comercial</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8">
        {activeTab === "dashboard" && <DashboardView />}
        {activeTab === "asesores" && <AsesoresView />}
        {activeTab === "zonas" && <ZonasView />}
        {activeTab === "exportar" && <ExportarView />}
      </main>
    </div>
  )
}

function DashboardView() {
  const kpis = [
    { label: "Visitas Hoy", value: "342", change: "+12%", up: true },
    { label: "Cumplimiento", value: "78%", change: "+5%", up: true },
    { label: "Asesores Activos", value: "38/42", change: "-2", up: false },
    { label: "Alertas", value: "7", change: "+3", up: false },
  ]

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-gray-900">Dashboard General</h1>
      <p className="mb-6 text-sm text-gray-500">Resumen operativo del día — 13 de febrero, 2026</p>

      <div className="mb-8 grid grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{k.label}</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">{k.value}</p>
            <div className={`mt-2 flex items-center gap-1 text-xs font-medium ${k.up ? "text-success" : "text-danger"}`}>
              {k.up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {k.change} vs ayer
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 font-semibold text-gray-900">Top Asesores Hoy</h3>
          <div className="space-y-3">
            {[
              { name: "Ana Gutiérrez", visitas: 18, zona: "Norte" },
              { name: "Patricia López", visitas: 16, zona: "Este" },
              { name: "Carlos Méndez", visitas: 14, zona: "Centro" },
            ].map((a, i) => (
              <div key={a.name} className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-navy text-[10px] font-bold text-white">
                  {i + 1}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{a.name}</p>
                  <p className="text-xs text-gray-400">Zona {a.zona}</p>
                </div>
                <span className="text-sm font-bold text-gray-900">{a.visitas}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 font-semibold text-gray-900">Zonas con Menor Cumplimiento</h3>
          <div className="space-y-3">
            {[
              { zona: "Oeste", pct: 34, asesores: 6 },
              { zona: "Sur", pct: 52, asesores: 8 },
              { zona: "Centro-Sur", pct: 61, asesores: 5 },
            ].map((z) => (
              <div key={z.zona} className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900">Zona {z.zona}</p>
                    <span className={`text-sm font-bold ${z.pct < 50 ? "text-danger" : "text-warning"}`}>{z.pct}%</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full ${z.pct < 50 ? "bg-danger" : "bg-warning"}`}
                      style={{ width: `${z.pct}%` }}
                    />
                  </div>
                  <p className="mt-0.5 text-xs text-gray-400">{z.asesores} asesores</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function AsesoresView() {
  const data = [
    { name: "Ana Gutiérrez", zona: "Norte", visitas: "18/20", pct: 90, estado: "activo" },
    { name: "Patricia López", zona: "Este", visitas: "16/18", pct: 89, estado: "activo" },
    { name: "Carlos Méndez", zona: "Centro", visitas: "14/20", pct: 70, estado: "activo" },
    { name: "Luis Ramírez", zona: "Sur", visitas: "10/22", pct: 45, estado: "activo" },
    { name: "Jorge Herrera", zona: "Oeste", visitas: "0/15", pct: 0, estado: "inactivo" },
    { name: "Sofía Martínez", zona: "Norte", visitas: "17/20", pct: 85, estado: "activo" },
  ]

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-gray-900">Asesores</h1>
      <p className="mb-6 text-sm text-gray-500">42 asesores en la operación</p>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 text-left font-medium text-gray-500">Asesor</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Zona</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Visitas</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Cumplimiento</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Estado</th>
            </tr>
          </thead>
          <tbody>
            {data.map((a) => (
              <tr key={a.name} className="border-b border-gray-50 last:border-0">
                <td className="px-4 py-3 font-medium text-gray-900">{a.name}</td>
                <td className="px-4 py-3 text-gray-600">{a.zona}</td>
                <td className="px-4 py-3 font-mono text-gray-900">{a.visitas}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={`h-full rounded-full ${a.pct >= 80 ? "bg-success" : a.pct >= 50 ? "bg-warning" : "bg-danger"}`}
                        style={{ width: `${a.pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-600">{a.pct}%</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${a.estado === "activo" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                    {a.estado}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ZonasView() {
  const zonas = [
    { name: "Norte", asesores: 8, visitas: 142, meta: 160, pct: 89 },
    { name: "Sur", asesores: 8, visitas: 98, meta: 176, pct: 56 },
    { name: "Este", asesores: 7, visitas: 112, meta: 126, pct: 89 },
    { name: "Oeste", asesores: 6, visitas: 34, meta: 108, pct: 31 },
    { name: "Centro", asesores: 10, visitas: 145, meta: 200, pct: 73 },
    { name: "Centro-Sur", asesores: 5, visitas: 61, meta: 100, pct: 61 },
  ]

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-gray-900">Zonas</h1>
      <p className="mb-6 text-sm text-gray-500">6 zonas activas en la operación</p>

      <div className="grid grid-cols-3 gap-4">
        {zonas.map((z) => (
          <div key={z.name} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Zona {z.name}</h3>
              <Globe className="h-4 w-4 text-gray-400" />
            </div>
            <p className="mt-3 text-3xl font-bold text-gray-900">{z.pct}%</p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-full rounded-full ${z.pct >= 80 ? "bg-success" : z.pct >= 50 ? "bg-warning" : "bg-danger"}`}
                style={{ width: `${z.pct}%` }}
              />
            </div>
            <div className="mt-3 flex justify-between text-xs text-gray-500">
              <span>{z.asesores} asesores</span>
              <span>{z.visitas}/{z.meta} visitas</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ExportarView() {
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-gray-900">Exportar Datos</h1>
      <p className="mb-6 text-sm text-gray-500">Descarga reportes para nómina y cumplimiento</p>

      <div className="grid grid-cols-2 gap-4">
        {[
          { title: "Reporte de Nómina", desc: "Asistencia y visitas validadas para cálculo de nómina", format: "XLSX" },
          { title: "Cumplimiento TAT", desc: "Porcentaje de cobertura por asesor y zona", format: "PDF" },
          { title: "Incidencias GPS", desc: "Visitas sospechosas con detalle de coordenadas", format: "CSV" },
          { title: "Histórico Mensual", desc: "Consolidado de visitas del mes corriente", format: "XLSX" },
        ].map((r) => (
          <div key={r.title} className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <Download className="h-6 w-6 text-navy" />
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600">{r.format}</span>
            </div>
            <h3 className="font-semibold text-gray-900">{r.title}</h3>
            <p className="mb-4 text-xs text-gray-500">{r.desc}</p>
            <button className="mt-auto rounded-lg bg-navy px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-navy-accent">
              Descargar
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
