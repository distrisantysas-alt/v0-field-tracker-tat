// ============================================================================
// app/api/admin/gps-historial/route.ts
// GET — historial de reubicaciones GPS de clientes, para supervisor/gerencia.
// Solo lectura. Ordenado por distancia movida descendente (lo más llamativo
// primero). Filtros opcionales: asesor_id, cliente_id, desde, hasta.
// ============================================================================
import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireSesion } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSesion(req, ['supervisor', 'gerencia'])
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(req.url)
    const asesorId  = searchParams.get('asesor_id')
    const clienteId = searchParams.get('cliente_id')
    const desde     = searchParams.get('desde')
    const hasta     = searchParams.get('hasta')
    const limit      = Math.min(parseInt(searchParams.get('limit')  ?? '50', 10) || 50, 200)
    const offset      = parseInt(searchParams.get('offset') ?? '0', 10) || 0

    const historial = await sql`
      SELECT
        h.id,
        h.cliente_id,
        c.nombre        AS cliente_nombre,
        c.codigo        AS cliente_codigo,
        h.asesor_id,
        a.nombre        AS asesor_nombre,
        h.lat_anterior,
        h.lng_anterior,
        h.lat_nueva,
        h.lng_nueva,
        h.distancia_movida_metros,
        h.motivo,
        h.timestamp
      FROM clientes_gps_historial h
      JOIN clientes  c ON c.id = h.cliente_id
      JOIN asesores  a ON a.id = h.asesor_id
      WHERE (${asesorId}::uuid  IS NULL OR h.asesor_id  = ${asesorId}::uuid)
        AND (${clienteId}::uuid IS NULL OR h.cliente_id = ${clienteId}::uuid)
        AND (${desde}::date IS NULL OR h.timestamp >= ${desde}::date)
        AND (${hasta}::date IS NULL OR h.timestamp <  (${hasta}::date + INTERVAL '1 day'))
      ORDER BY h.distancia_movida_metros DESC NULLS LAST
      LIMIT ${limit} OFFSET ${offset}
    `

    return NextResponse.json({ historial, limit, offset })

  } catch (error) {
    console.error('Error obteniendo historial GPS:', error)
    const msg = error instanceof Error ? error.message : 'Unknown'
    return NextResponse.json({ error: 'Error obteniendo historial GPS', details: msg }, { status: 500 })
  }
}
