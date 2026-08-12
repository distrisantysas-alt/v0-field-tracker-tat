// ============================================================================
// app/api/ranking-dia/route.ts — Ranking real de asesores activos del día
// ✅ Solo asesores activos (activo = true)
// ✅ Ordenado por visitas de mayor a menor
// ✅ Incluye pedidos y monto vendido
// ============================================================================

import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireSesion } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSesion(req);
    if (auth instanceof NextResponse) return auth;

    const fecha = req.nextUrl.searchParams.get('fecha')
      ?? new Date().toLocaleString('en-CA', { timeZone: 'America/Bogota' }).split(',')[0];

    const ranking = await sql`
      SELECT
        a.id,
        a.nombre,
        a.zona,
        COUNT(v.id) AS visitas,
        COUNT(v.id) FILTER (WHERE v.hubo_pedido = true) AS pedidos,
        COALESCE(SUM(v.valor_pedido), 0) AS vendido
      FROM asesores a
      LEFT JOIN visitas v
        ON v.asesor_id = a.id
        AND DATE(v.timestamp AT TIME ZONE 'America/Bogota') = ${fecha}::date
      WHERE a.activo = true
        AND a.rol = 'asesor'
      GROUP BY a.id, a.nombre, a.zona
      ORDER BY COUNT(v.id) DESC, a.nombre ASC
    `;

    return NextResponse.json({
      success: true,
      fecha,
      ranking: ranking.map(r => ({
        id:             r.id,
        nombre:         r.nombre,
        zona:           r.zona,
        visitas:        parseInt(r.visitas),
        pedidos:        parseInt(r.pedidos),
        vendido:        parseFloat(r.vendido),
        vendido_formato: `$${parseFloat(r.vendido).toLocaleString('es-CO')}`,
      }))
    });

  } catch (error) {
    console.error('❌ Error en /api/ranking-dia:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
