// ============================================================================
// app/api/checkin/visita-hoy/route.ts
// GET — devuelve el id de la visita de hoy para un asesor+cliente
// ============================================================================
import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireSesion } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSesion(req)
    if (auth instanceof NextResponse) return auth
    const asesor_id = auth.asesorId

    const { searchParams } = new URL(req.url)
    const cliente_id = searchParams.get('cliente_id')
    const fecha       = searchParams.get('fecha')

    if (!asesor_id || !cliente_id || !fecha) {
      return NextResponse.json({ error: 'cliente_id y fecha son requeridos' }, { status: 400 })
    }

    const visitas = await sql`
      SELECT id, hubo_pedido, valor_pedido
      FROM visitas
      WHERE asesor_id  = ${asesor_id}
        AND cliente_id = ${cliente_id}
        AND (timestamp AT TIME ZONE 'America/Bogota')::date = ${fecha}::date
      ORDER BY timestamp DESC
      LIMIT 1
    `

    if (visitas.length === 0) {
      return NextResponse.json({ visita_id: null })
    }

    return NextResponse.json({
      visita_id:   visitas[0].id,
      hubo_pedido: visitas[0].hubo_pedido,
      valor_pedido: visitas[0].valor_pedido,
    })

  } catch (error) {
    console.error('❌ Error en GET /api/checkin/visita-hoy:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
