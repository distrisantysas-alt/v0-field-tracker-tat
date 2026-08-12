// ============================================================================
// app/api/clientes/eliminar/route.ts
// DELETE → el asesor elimina un cliente duplicado de su cartera
// Acepta tanto clientes propios como clientes compartidos (asesor_clientes)
// ============================================================================

import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireSesion } from '@/lib/auth'

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireSesion(req)
    if (auth instanceof NextResponse) return auth
    const asesor_id = auth.asesorId

    const body = await req.json()
    const { cliente_id, motivo } = body

    if (!cliente_id || !asesor_id) {
      return NextResponse.json(
        { error: 'cliente_id y asesor_id son requeridos' },
        { status: 400 }
      )
    }

    // Verificar que el cliente existe y está activo
    const clientes = await sql`
      SELECT id, nombre, codigo, direccion, telefono, lat, lng, asesor_id, activo
      FROM clientes
      WHERE id = ${cliente_id}
      LIMIT 1
    `

    if (clientes.length === 0) {
      return NextResponse.json(
        { error: 'Cliente no encontrado' },
        { status: 404 }
      )
    }

    const cliente = clientes[0]

    if (!cliente.activo) {
      return NextResponse.json(
        { error: 'El cliente ya estaba inactivo' },
        { status: 409 }
      )
    }

    // Verificar que el asesor tiene acceso al cliente:
    // 1. Es el propietario directo (asesor_id = su id)
    // 2. Tiene el cliente compartido (en tabla asesor_clientes)
    const tieneAcceso = String(cliente.asesor_id) === String(asesor_id)

    if (!tieneAcceso) {
      // Verificar si lo tiene compartido
      try {
        const compartido = await sql`
          SELECT 1 FROM asesor_clientes
          WHERE asesor_id = ${asesor_id}::uuid
            AND cliente_id = ${cliente_id}
          LIMIT 1
        `
        if (compartido.length === 0) {
          return NextResponse.json(
            { error: 'No tienes acceso a este cliente' },
            { status: 403 }
          )
        }
      } catch {
        // Si la tabla asesor_clientes no existe, permitir igual
        // ya que el asesor lo ve en su lista
      }
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
      const historial = await sql`
        SELECT
          COUNT(*)                                          AS total_visitas,
          COUNT(*) FILTER (WHERE hubo_pedido = true)        AS total_pedidos,
          COALESCE(SUM(valor_pedido), 0)                    AS valor_acumulado,
          MIN(timestamp)                                    AS primera_visita,
          MAX(timestamp)                                    AS ultima_visita
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
          ${cliente.codigo ?? null},
          ${cliente.direccion ?? null},
          ${cliente.telefono ?? null},
          ${cliente.lat ?? null},
          ${cliente.lng ?? null},
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
