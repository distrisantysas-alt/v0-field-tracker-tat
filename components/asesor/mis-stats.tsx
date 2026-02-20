'use client';

// ============================================================================
// components/asesor/mis-stats.tsx (ACTUALIZADO)
// ============================================================================

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { Flame, Trophy, TrendingUp, Loader2 } from 'lucide-react';
import { type AsesorSession } from './login-asesor';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface DiaStats {
  fecha: string;
  visitas: number;
  pedidos: number;
  vendido: number;
}

interface MisStatsProps {
  asesor: AsesorSession
}

export function MisStats({ asesor }: MisStatsProps) {
  const ASESOR_ID = asesor.id;

  const hoy = new Date().toLocaleString('en-CA', {
    timeZone: 'America/Bogota'
  }).split(',')[0];

  const hace7Dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toLocaleString('en-CA', { timeZone: 'America/Bogota' })
    .split(',')[0];

  const { data, error } = useSWR(
    `/api/resumen-dia?asesor_id=${ASESOR_ID}&fecha_inicio=${hace7Dias}&fecha_fin=${hoy}&rango=true`,
    fetcher,
    { refreshInterval: 60000 }
  );

  const { data: hoyData } = useSWR(
    `/api/resumen-dia?asesor_id=${ASESOR_ID}&fecha=${hoy}`,
    fetcher,
    { refreshInterval: 30000 }
  );

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-dark">
        <p className="text-red-500">Error cargando estadísticas</p>
      </div>
    );
  }

  if (!data || !hoyData) {
    return (
      <div className="flex h-screen items-center justify-center bg-dark">
        <Loader2 className="h-8 w-8 animate-spin text-navy-accent" />
      </div>
    );
  }

  const calcularRacha = () => {
    if (!data.por_dia) return 0;
    const diasOrdenados = [...data.por_dia].reverse();
    let racha = 0;
    for (const dia of diasOrdenados) {
      if (dia.visitas > 0) { racha++; } else { break; }
    }
    return racha;
  };

  const mejorDia = data.por_dia
    ? Math.max(...data.por_dia.map((d: DiaStats) => d.visitas))
    : 0;

  const racha = calcularRacha();

  const diasSemana = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const visitasPorDia = data.por_dia || [];

  const ultimos7Dias = Array.from({ length: 7 }, (_, i) => {
    const fecha = new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000);
    const fechaStr = fecha.toLocaleString('en-CA', {
      timeZone: 'America/Bogota'
    }).split(',')[0];
    const diaData = visitasPorDia.find((d: DiaStats) => d.fecha === fechaStr);
    const diaSemana = diasSemana[fecha.getDay() === 0 ? 6 : fecha.getDay() - 1];
    return {
      dia: diaSemana,
      visitas: diaData?.visitas || 0,
      esHoy: fechaStr === hoy
    };
  });

  const maxVisitas = Math.max(...ultimos7Dias.map(d => d.visitas), 1);

  // Ranking: el asesor actual más dos placeholders
  const visitasHoy = hoyData?.metricas?.visitas?.total ?? 0;
  const ranking = [
    { nombre: 'Ana Gutiérrez', visitas: 18, esUsuario: false },
    { nombre: `${asesor.nombre} (tú)`, visitas: visitasHoy, esUsuario: true },
    { nombre: 'Patricia López', visitas: 13, esUsuario: false },
  ].sort((a, b) => b.visitas - a.visitas);

  return (
    <div className="flex flex-col h-screen bg-dark overflow-y-auto pb-20">
      {/* Header */}
      <div className="px-4 py-4 bg-dark-surface border-b border-white/10">
        <h1 className="text-xl font-bold text-white">Mis Estadísticas</h1>
        <p className="text-sm text-gray-400 mt-1">
          {asesor.nombre}{asesor.zona ? ` · ${asesor.zona}` : ''} · Rendimiento esta semana
        </p>
      </div>

      {/* Gráfico de visitas */}
      <div className="px-4 py-6">
        <h2 className="text-white font-semibold mb-4">Visitas esta semana</h2>
        <div className="flex items-end justify-between h-40 gap-2">
          {ultimos7Dias.map((dia, index) => {
            const altura = (dia.visitas / maxVisitas) * 100;
            return (
              <div key={index} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full flex items-end justify-center h-32">
                  <div
                    className={`w-full rounded-t transition-all ${
                      dia.esHoy ? 'bg-success' : 'bg-navy'
                    }`}
                    style={{ height: `${altura}%`, minHeight: dia.visitas > 0 ? '8px' : '0' }}
                  />
                </div>
                <span className="text-xs text-gray-400">{dia.dia}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Cards de métricas */}
      <div className="px-4 grid grid-cols-2 gap-3 mb-6">
        <div className="bg-dark-surface rounded-xl p-4 border border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <Flame className="h-5 w-5 text-orange-500" />
            <span className="text-sm text-gray-400">Racha actual</span>
          </div>
          <p className="text-3xl font-bold text-white">{racha}</p>
          <p className="text-xs text-gray-500 mt-1">
            {racha === 1 ? 'día' : 'días'} consecutivos
          </p>
        </div>

        <div className="bg-dark-surface rounded-xl p-4 border border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            <span className="text-sm text-gray-400">Mejor día</span>
          </div>
          <p className="text-3xl font-bold text-white">{mejorDia}</p>
          <p className="text-xs text-gray-500 mt-1">visitas en un día</p>
        </div>
      </div>

      {/* Métricas de ventas */}
      <div className="px-4 mb-6">
        <div className="bg-gradient-to-br from-navy to-navy-accent rounded-xl p-4 border border-white/10">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-5 w-5 text-success" />
            <span className="text-sm text-white/80">Esta semana</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-white/60">Total visitas</p>
              <p className="text-2xl font-bold text-white">{data.totales?.visitas ?? 0}</p>
            </div>
            <div>
              <p className="text-xs text-white/60">Pedidos</p>
              <p className="text-2xl font-bold text-success">{data.totales?.pedidos ?? 0}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-white/60">Total vendido</p>
              <p className="text-2xl font-bold text-white">{data.totales?.vendido_formato ?? '$0'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Ranking */}
      <div className="px-4">
        <h2 className="text-white font-semibold mb-3">
          Tu posición hoy
        </h2>
        <div className="space-y-2">
          {ranking.map((item, index) => (
            <div
              key={index}
              className={`flex items-center gap-3 p-3 rounded-xl ${
                item.esUsuario
                  ? 'bg-navy-accent/20 border border-navy-accent'
                  : 'bg-dark-surface border border-white/10'
              }`}
            >
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                  index === 0
                    ? 'bg-yellow-500 text-dark'
                    : item.esUsuario
                    ? 'bg-navy-accent text-white'
                    : 'bg-gray-600 text-gray-300'
                }`}
              >
                {index + 1}
              </div>
              <div className="flex-1">
                <p className={`text-sm font-medium ${item.esUsuario ? 'text-white' : 'text-gray-300'}`}>
                  {item.nombre}
                </p>
              </div>
              <div className="text-right">
                <p className={`text-lg font-bold ${item.esUsuario ? 'text-white' : 'text-gray-400'}`}>
                  {item.visitas}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
