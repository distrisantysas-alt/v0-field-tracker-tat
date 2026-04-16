// ============================================================================
// app/api/clientes/eliminar/route.ts
// DELETE → el asesor elimina un cliente duplicado de su propia cartera
// Solo puede eliminar clientes que le pertenecen (asesor_id = su id)
// No elimina físicamente — hace activo = false (soft delete)
// ============================================================================

import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json()
    const { cliente_id, asesor_id, motivo } = body

    if (!cliente_id || !asesor_id) {
      return NextResponse.json(
        { error: 'cliente_id y asesor_id son requeridos' },
        { status: 400 }
      )
    }

    // Verificar que el cliente pertenece al asesor que solicita
    const verificar = await sql`
      SELECT id, nombre, asesor_id
      FROM clientes
      WHERE id = ${cliente_id}
        AND asesor_id = ${asesor_id}
        AND activo = true
    `

    if (verificar.length === 0) {
      return NextResponse.json(
        { error: 'Cliente no encontrado o no pertenece a este asesor' },
        { status: 404 }
      )
    }

    const cliente = verificar[0]

    // Verificar que no tenga visitas registradas hoy
    const fechaHoy = new Date().toLocaleString('en-CA', {
      timeZone: 'America/Bogota'
    }).split(',')[0]

    const visitasHoy = await sql`
      SELECT COUNT(*) as total
      FROM visitas
      WHERE cliente_id = ${cliente_id}
        AND DATE(timestamp AT TIME ZONE 'America/Bogota') = ${fechaHoy}::date
    `

    if (parseInt(visitasHoy[0].total) > 0) {
      return NextResponse.json(
        { error: 'No puedes eliminar un cliente que ya tiene visitas registradas hoy' },
        { status: 409 }
      )
    }

    // Soft delete — marcar como inactivo
    await sql`
      UPDATE clientes
      SET activo = false
      WHERE id = ${cliente_id}
        AND asesor_id = ${asesor_id}
    `

    // Registrar en log si existe la tabla (opcional — no bloquea si no existe)
    try {
      await sql`
        INSERT INTO clientes_eliminados (cliente_id, asesor_id, nombre_cliente, motivo, eliminado_en)
        VALUES (
          ${cliente_id},
          ${asesor_id},
          ${cliente.nombre},
          ${motivo ?? 'Duplicado reportado por asesor'},
          NOW()
        )
      `
    } catch {
      // La tabla es opcional — si no existe, continúa sin error
    }

    console.log(`🗑️ Cliente ${cliente.nombre} (${cliente_id}) eliminado por asesor ${asesor_id}`)

    return NextResponse.json({
      success: true,
      mensaje: `Cliente "${cliente.nombre}" eliminado correctamente`,
    })

  } catch (error) {
    console.error('❌ Error eliminando cliente:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: 'Error eliminando cliente', details: msg }, { status: 500 })
  }
}
