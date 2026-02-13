"use client"

import { Flame, Trophy } from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Cell,
} from "recharts"

const weeklyData = [
  { day: "Lun", visitas: 18 },
  { day: "Mar", visitas: 20 },
  { day: "Mié", visitas: 15 },
  { day: "Jue", visitas: 19 },
  { day: "Vie", visitas: 14 },
  { day: "Sáb", visitas: 0 },
]

const leaderboard = [
  { pos: 1, name: "Ana Gutiérrez", visitas: 18 },
  { pos: 2, name: "Carlos Méndez (tú)", visitas: 14 },
  { pos: 3, name: "Patricia López", visitas: 13 },
]

export function MisStats() {
  const completed = 14
  const total = 20
  const pct = (completed / total) * 100
  // SVG ring chart params
  const radius = 60
  const circumference = 2 * Math.PI * radius
  const strokeDash = (pct / 100) * circumference

  return (
    <div className="flex flex-col px-4 pb-4 pt-4">
      <h2 className="text-lg font-bold text-white">Mis Estadísticas</h2>
      <p className="mb-4 text-xs text-gray-400">Rendimiento personal del día y la semana</p>

      {/* Completion Ring */}
      <div className="mx-auto mb-6 flex flex-col items-center">
        <div className="relative">
          <svg width="160" height="160" viewBox="0 0 160 160">
            {/* Background ring */}
            <circle
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="12"
            />
            {/* Progress ring */}
            <circle
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke="#1A7A4A"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference - strokeDash}
              transform="rotate(-90 80 80)"
              className="transition-all duration-700"
              style={{ filter: "drop-shadow(0 0 6px rgba(26,122,74,0.4))" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-white">{completed}/{total}</span>
            <span className="text-xs text-gray-400">hoy</span>
          </div>
        </div>
        <p className="mt-2 text-sm text-success font-medium">{pct.toFixed(0)}% completado</p>
      </div>

      {/* Weekly Bar Chart */}
      <div className="mb-4 rounded-xl border border-white/5 bg-dark-surface p-4">
        <h3 className="mb-3 text-sm font-semibold text-white">Visitas esta semana</h3>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyData} barCategoryGap="25%">
              <XAxis
                dataKey="day"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: "#6B7280" }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: "#4B5563" }}
                width={24}
              />
              <Bar dataKey="visitas" radius={[4, 4, 0, 0]}>
                {weeklyData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={index === 4 ? "#1A7A4A" : "#1E3A5F"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-dark-surface p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/15">
            <Flame className="h-5 w-5 text-warning" />
          </div>
          <div>
            <p className="text-lg font-bold text-white">3 días</p>
            <p className="text-xs text-gray-400">Racha actual</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-dark-surface p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy-accent/15">
            <Trophy className="h-5 w-5 text-navy-accent" />
          </div>
          <div>
            <p className="text-lg font-bold text-white">112</p>
            <p className="text-xs text-gray-400">Mejor semana</p>
          </div>
        </div>
      </div>

      {/* Ranking Card */}
      <div className="rounded-xl border border-white/5 bg-dark-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Tu posición hoy</h3>
          <span className="rounded-full bg-navy-accent/15 px-2.5 py-0.5 text-xs font-bold text-navy-accent">
            #2 de 10
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {leaderboard.map((entry) => (
            <div
              key={entry.pos}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
                entry.pos === 2 ? "bg-navy-accent/10 border border-navy-accent/20" : "bg-white/[0.03]"
              }`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                  entry.pos === 1
                    ? "bg-warning/20 text-warning"
                    : entry.pos === 2
                      ? "bg-navy-accent/20 text-navy-accent"
                      : "bg-white/10 text-gray-400"
                }`}
              >
                {entry.pos}
              </span>
              <span className={`flex-1 text-sm ${entry.pos === 2 ? "font-semibold text-white" : "text-gray-300"}`}>
                {entry.name}
              </span>
              <span className="font-mono text-sm font-medium text-gray-400">{entry.visitas}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
