// ============================================================================
// app/api/asignaciones/route.ts
// GET → las asignaciones que le llegaron al asesor logueado (las que su
// supervisor le envió desde /admin, pendientes o en curso primero).
// ============================================================================
import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireSesion } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSesion(req)
    if (auth instanceof NextResponse) return auth

    const rows = await sql`
      SELECT
        ag.id, ag.ruta, ag.motivo, ag.estado, ag.nota, ag.created_at, ag.updated_at,
        c.id AS cliente_id, c.nombre AS cliente_nombre, c.direccion, c.lat, c.lng
      FROM asignaciones ag
      JOIN clientes c ON c.id = ag.cliente_id
      WHERE ag.asesor_id = ${auth.asesorId}
        AND ag.estado != 'depurado'
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
