// ============================================================================
// app/api/asignaciones/route.ts
// GET → las asignaciones que le llegaron al asesor logueado HOY (las que su
// supervisor le envió desde /admin). Solo del día de hoy: el asesor cambia
// de ruta/zona cada día, así que lo de días anteriores ya no lo puede
// gestionar y no debe quedarle acumulado. Lo de días previos que quedó sin
// resolver se sigue viendo en el panel del supervisor como "sin gestionar"
// (ver /api/admin/asignaciones), nunca se pierde — solo deja de mostrársele
// al asesor.
// ============================================================================
import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireSesion } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSesion(req)
    if (auth instanceof NextResponse) return auth

    // "gestion_previa": si otro asesor ya hizo algo con este cliente antes
    // (por ejemplo, lo tuvo asignado en una ruta anterior), ese rastro viaja
    // con el cliente y se lo mostramos a quien lo tenga ahora, sin importar
    // quién lo haya hecho.
    const rows = await sql`
      SELECT
        ag.id, ag.ruta, ag.motivo, ag.estado, ag.nota, ag.valor_pedido, ag.created_at, ag.updated_at,
        c.id AS cliente_id, c.nombre AS cliente_nombre, c.direccion, c.lat, c.lng,
        gp.estado AS gestion_previa_estado,
        gp.asesor_nombre AS gestion_previa_asesor,
        gp.updated_at AS gestion_previa_fecha
      FROM asignaciones ag
      JOIN clientes c ON c.id = ag.cliente_id
      LEFT JOIN LATERAL (
        SELECT ag2.estado, ag2.updated_at, a2.nombre AS asesor_nombre
        FROM asignaciones ag2
        JOIN asesores a2 ON a2.id = ag2.asesor_id
        WHERE ag2.cliente_id = ag.cliente_id
          AND ag2.id != ag.id
          AND ag2.asesor_id != ag.asesor_id
        ORDER BY ag2.updated_at DESC
        LIMIT 1
      ) gp ON true
      WHERE ag.asesor_id = ${auth.asesorId}
        AND ag.estado != 'depurado'
        AND (ag.created_at AT TIME ZONE 'America/Bogota')::date = (NOW() AT TIME ZONE 'America/Bogota')::date
      ORDER BY
        CASE ag.estado WHEN 'pendiente' THEN 0 WHEN 'en_gestion' THEN 1 ELSE 2 END,
        ag.created_at DESC
      LIMIT 100
    `

    return NextResponse.json({ success: true, asignaciones: rows })
  } catch (error) {
    console.error('❌ Error en GET /api/asignaciones:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: 'Error interno', details: msg }, { status: 500 })
  }
}
