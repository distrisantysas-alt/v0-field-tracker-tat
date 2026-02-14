import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const supervisorId = req.nextUrl.searchParams.get('supervisor_id');
  const fecha = req.nextUrl.searchParams.get('fecha')
                ?? new Date().toISOString().split('T')[0];

  if (!supervisorId) {
    return NextResponse.json({ error: 'supervisor_id requerido' }, { status: 400 });
  }

  const equipo = await sql`
    SELECT
      a.id,
      a.nombre,
      a.zona,
      COUNT(DISTINCT r.cliente_id)                          AS total_clientes,
      COUNT(DISTINCT v.id)                                  AS visitas_hoy,
      COUNT(DISTINCT v.id) FILTER (WHERE v.validada = true) AS validadas,
      COUNT(DISTINCT v.id) FILTER (WHERE v.validada = false
        AND v.timestamp IS NOT NULL)                        AS sospechosas,
      MAX(v.timestamp)                                      AS ultima_visita,
      ROUND(
        COUNT(DISTINCT v.id)::numeric / 
        NULLIF(COUNT(DISTINCT r.cliente_id), 0) * 100
      )                                                     AS porcentaje
    FROM asesores a
    LEFT JOIN rutas_dia r 
      ON r.asesor_id = a.id AND r.fecha = ${fecha}::date
    LEFT JOIN visitas v 
      ON v.asesor_id = a.id AND v.timestamp::date = ${fecha}::date
    WHERE a.supervisor_id = ${supervisorId}
      AND a.activo = true
    GROUP BY a.id, a.nombre, a.zona
    ORDER BY porcentaje DESC NULLS LAST
  `;

  const totales = {
    total_asesores:  equipo.length,
    visitas_totales: equipo.reduce((s, a) => s + Number(a.visitas_hoy), 0),
    validadas_total: equipo.reduce((s, a) => s + Number(a.validadas), 0),
    sospechosas_total: equipo.reduce((s, a) => s + Number(a.sospechosas), 0),
  };

  return NextResponse.json({ equipo, totales, fecha });
}
