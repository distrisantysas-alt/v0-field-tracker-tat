// ============================================================================
// app/api/asignaciones/[id]/route.ts
// PATCH → el asesor (dueño de la asignación) o el supervisor/gerencia
// actualiza el estado: en_gestion | ubicado | activado | vendido | depurado
// ============================================================================
import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireSesion } from '@/lib/auth'

const ESTADOS_VALIDOS = ['pendiente', 'en_gestion', 'ubicado', 'activado', 'vendido', 'depurado']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSesion(req)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const body = await req.json()
    const { estado, nota, valorPedido, visitaId } = body

    if (estado && !ESTADOS_VALIDOS.includes(estado)) {
      return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
    }

    // "Vendido" exige el valor del pedido, igual que en la gestión habitual
    // (checkin): no se puede marcar una venta sin decir cuánto fue.
    if (estado === 'vendido' && (valorPedido == null || isNaN(Number(valorPedido)) || Number(valorPedido) < 0)) {
      return NextResponse.json({ error: 'Si el cliente tomó pedido, debes indicar el valor' }, { status: 400 })
    }

    const existente = await sql`SELECT id, asesor_id FROM asignaciones WHERE id = ${id}`
    if (existente.length === 0) {
      return NextResponse.json({ error: 'Asignación no encontrada' }, { status: 404 })
    }

    const esDueno = existente[0].asesor_id === auth.asesorId
    const esSupervisor = ['supervisor', 'gerencia'].includes(auth.rol)
    if (!esDueno && !esSupervisor) {
      return NextResponse.json({ error: 'No puedes modificar esta asignación' }, { status: 403 })
    }

    const rows = await sql`
      UPDATE asignaciones
      SET
        estado = COALESCE(${estado || null}, estado),
        nota = COALESCE(${nota ?? null}, nota),
        valor_pedido = COALESCE(${valorPedido ?? null}, valor_pedido),
        visita_id = COALESCE(${visitaId ?? null}, visita_id),
        updated_at = now()
      WHERE id = ${id}
      RETURNING id, estado, nota, valor_pedido, visita_id, updated_at
    `

    return NextResponse.json({ success: true, asignacion: rows[0] })
  } catch (error) {
    console.error('❌ Error en PATCH /api/asignaciones/[id]:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: 'Error interno', details: msg }, { status: 500 })
  }
}
