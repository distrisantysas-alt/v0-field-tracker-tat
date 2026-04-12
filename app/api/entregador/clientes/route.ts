// ============================================================================
// app/api/entregador/clientes/route.ts
// GET — todos los clientes activos agrupados por asesor y ruta
// ============================================================================
import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

function fechaColombia(): string {
  return new Date().toLocaleString('en-CA', { timeZone: 'America/Bogota' }).split(',')[0]
}

function getRuta(nombre: string): string {
  if (!nombre) return '—'
  const match = nombre.match(/^([A-Z0-9]+)\s/i)
  return match ? match[1].toUpperCase() : '—'
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const fecha = searchParams.get('fecha') || fechaColombia()

    // Todos los clientes activos con info del asesor y visita de hoy
    const clientes = await sql`
      SELECT
        c.id,
        c.nombre       as cliente_nombre,
        c.direccion,
        c.lat,
        c.lng,
        c.telefono,
        a.id           as asesor_id,
        a.nombre       as asesor_nombre,
        a.zona,
        v.hubo_pedido,
        v.valor_pedido,
        v.timestamp    as visitado_en,
        v.validada
      FROM clientes c
      JOIN asesores a ON a.id = c.asesor_id
      LEFT JOIN visitas v
        ON v.cliente_id = c.id
        AND v.asesor_id = c.asesor_id
        AND (v.timestamp AT TIME ZONE 'America/Bogota')::date = ${fecha}::date
      WHERE c.activo = true
        AND a.activo = true
        AND a.rol = 'asesor'
      ORDER BY a.nombre ASC, c.nombre ASC
    `

    // Agrupar por asesor → ruta → clientes
    const porAsesor: Record<string, any> = {}

    for (const c of clientes) {
      const asesorKey = c.asesor_nombre
      if (!porAsesor[asesorKey]) {
        porAsesor[asesorKey] = {
          asesor_id:    c.asesor_id,
          asesor:       c.asesor_nombre,
          zona:         c.zona,
          rutas:        {} as Record<string, any[]>,
          total:        0,
          con_pedido:   0,
          visitados:    0,
        }
      }

      const ruta = getRuta(c.cliente_nombre)
      if (!porAsesor[asesorKey].rutas[ruta]) {
        porAsesor[asesorKey].rutas[ruta] = []
      }

      const cliente = {
        id:           c.id,
        nombre:       c.cliente_nombre,
        direccion:    c.direccion,
        lat:          c.lat ? parseFloat(c.lat) : null,
        lng:          c.lng ? parseFloat(c.lng) : null,
        telefono:     c.telefono,
        visitado:     !!c.visitado_en,
        hubo_pedido:  c.hubo_pedido ?? false,
        valor_pedido: parseFloat(c.valor_pedido) || 0,
        valor_formato: c.valor_pedido ? `$${(parseFloat(c.valor_pedido)).toLocaleString('es-CO')}` : null,
        validada:     c.validada,
      }

      porAsesor[asesorKey].rutas[ruta].push(cliente)
      porAsesor[asesorKey].total++
      if (cliente.visitado) porAsesor[asesorKey].visitados++
      if (cliente.hubo_pedido) porAsesor[asesorKey].con_pedido++
    }

    // Convertir rutas de objeto a array ordenado
    const resultado = Object.values(porAsesor).map((a: any) => ({
      ...a,
      rutas: Object.entries(a.rutas)
        .sort(([ra], [rb]) => ra.localeCompare(rb, undefined, { numeric: true }))
        .map(([ruta, clientes]) => ({ ruta, clientes, total: (clientes as any[]).length }))
    }))

    return NextResponse.json({
      fecha,
      total_clientes: clientes.length,
      por_asesor:     resultado,
    })

  } catch (error) {
    console.error('Error en entregador/clientes:', error)
    return NextResponse.json({ error: 'Error obteniendo clientes' }, { status: 500 })
  }
}
