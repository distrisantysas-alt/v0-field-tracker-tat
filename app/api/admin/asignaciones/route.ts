// ============================================================================
// app/api/admin/asignaciones/route.ts
// GET  → historial de asignaciones (para el supervisor, todas)
// POST → el supervisor crea asignaciones nuevas para uno o más clientes,
//        cada uno dirigido al asesor dueño de ese cliente.
// ============================================================================
import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireSesion } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSesion(req, ['supervisor', 'gerencia'])
    if (auth instanceof NextResponse) return auth

    const rows = await sql`
      SELECT
        ag.id, ag.cliente_id, ag.asesor_id, ag.ruta, ag.motivo, ag.estado, ag.nota, ag.valor_pedido,
        ag.created_at, ag.updated_at,
        c.nombre AS cliente_nombre, c.direccion,
        a.nombre AS asesor_nombre
      FROM asignaciones ag
      JOIN clientes c ON c.id = ag.cliente_id
      JOIN asesores a ON a.id = ag.asesor_id
      ORDER BY ag.updated_at DESC
      LIMIT 300
    `

    return NextResponse.json({ success: true, asignaciones: rows })
  } catch (error) {
    console.error('❌ Error en GET /api/admin/asignaciones:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: 'Error interno', details: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSesion(req, ['supervisor', 'gerencia'])
    if (auth instanceof NextResponse) return auth

    const body = await req.json()
    const clientes: Array<{ clienteId: string; ruta?: string; motivo?: string }> = body.clientes
    if (!Array.isArray(clientes) || clientes.length === 0) {
      return NextResponse.json({ error: 'clientes (array) es requerido' }, { status: 400 })
    }
    if (clientes.length > 100) {
      return NextResponse.json({ error: 'Máximo 100 clientes por envío' }, { status: 400 })
    }

    const creadas = []
    for (const c of clientes) {
      if (!c.clienteId) continue
      const clienteRows = await sql`SELECT id, asesor_id FROM clientes WHERE id = ${c.clienteId} AND activo = true`
      const cliente = clienteRows[0]
      if (!cliente || !cliente.asesor_id) continue

      const inserted = await sql`
        INSERT INTO asignaciones (cliente_id, asesor_id, asignado_por, ruta, motivo, estado)
        VALUES (${c.clienteId}, ${cliente.asesor_id}, ${auth.asesorId}, ${c.ruta || null}, ${c.motivo || null}, 'pendiente')
        RETURNING id, cliente_id, asesor_id
      `
      creadas.push(inserted[0])
    }

    return NextResponse.json({ success: true, creadas: creadas.length, detalle: creadas })
  } catch (error) {
    console.error('❌ Error en POST /api/admin/asignaciones:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: 'Error interno', details: msg }, { status: 500 })
  }
}
