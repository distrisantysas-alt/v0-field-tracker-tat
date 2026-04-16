// ============================================================================
// app/api/clientes/eliminar/route.ts
// DELETE → el asesor elimina un cliente duplicado de su propia cartera
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

    console.log('🗑️ Eliminar cliente request:', { cliente_id, asesor_id })

    // Verificar que el cliente existe y está activo
    // Sin filtrar por asesor_id todavía — primero veamos qué hay
    const verificar = await sql`
      SELECT id, nombre, asesor_id, activo
      FROM clientes
      WHERE id = ${cliente_id}
      LIMIT 1
    `

    console.log('🔍 Cliente encontrado:', verificar[0] ?? 'ninguno')

    if (verificar.length === 0) {
      return NextResponse.json(
        { error: 'Cliente no encontrado' },
        { status: 404 }
      )
    }

    const cliente = verificar[0]

    if (!cliente.activo) {
      return NextResponse.json(
        { error: 'El cliente ya estaba inactivo' },
        { status: 409 }
      )
    }

    // Comparar asesor_id como string en ambos lados para evitar mismatch de tipos
    const asesorIdCliente = String(cliente.asesor_id)
    const asesorIdSesion  = String(asesor_id)

    console.log('🔍 Comparando asesor_id:', { asesorIdCliente, asesorIdSesion, coinciden: asesorIdCliente === asesorIdSesion })

    if (asesorIdCliente !== asesorIdSesion) {
      return NextResponse.json(
        { error: 'Este cliente no pertenece a tu cartera' },
        { status: 403 }
      )
    }

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

    // Soft delete
    await sql`
      UPDATE clientes
      SET activo = false
      WHERE id = ${cliente_id}
    `

    // Registrar en auditoría
    try {
      // Obtener historial de visitas
      const historial = await sql`
        SELECT
          COUNT(*)                                            AS total_visitas,
          COUNT(*) FILTER (WHERE hubo_pedido = true)          AS total_pedidos,
          COALESCE(SUM(valor_pedido), 0)                      AS valor_acumulado,
          MIN(timestamp)                                      AS primera_visita,
          MAX(timestamp)                                      AS ultima_visita
        FROM visitas
        WHERE cliente_id = ${cliente_id}
      `

      const h = historial[0]

      await sql`
        INSERT INTO clientes_eliminados (
          cliente_id, asesor_id, nombre_cliente, codigo_cliente,
          direccion, telefono, lat, lng,
          motivo, total_visitas, total_pedidos, valor_acumulado,
          primera_visita, ultima_visita, eliminado_en
        ) VALUES (
          ${cliente_id},
          ${asesor_id},
          ${cliente.nombre},
          ${verificar[0].codigo ?? null},
          ${verificar[0].direccion ?? null},
          ${verificar[0].telefono ?? null},
          ${verificar[0].lat ?? null},
          ${verificar[0].lng ?? null},
          ${motivo ?? 'Duplicado eliminado por asesor'},
          ${parseInt(h.total_visitas)},
          ${parseInt(h.total_pedidos)},
          ${parseFloat(h.valor_acumulado)},
          ${h.primera_visita ?? null},
          ${h.ultima_visita  ?? null},
          NOW()
        )
      `
    } catch (auditError) {
      // El log de auditoría falla silenciosamente — la eliminación ya se hizo
      console.error('⚠️ Error guardando auditoría:', auditError)
    }

    console.log(`✅ Cliente ${cliente.nombre} (${cliente_id}) eliminado por asesor ${asesor_id}`)

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
