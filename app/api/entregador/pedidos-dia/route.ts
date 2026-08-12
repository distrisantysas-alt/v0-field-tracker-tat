// ============================================================================
// app/api/entregador/pedidos-dia/route.ts
// GET — todos los clientes con pedido hoy, para el entregador
// ============================================================================
import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireSesion } from '@/lib/auth'

function fechaColombia(): string {
  return new Date().toLocaleString('en-CA', { timeZone: 'America/Bogota' }).split(',')[0]
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSesion(req)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(req.url)
    const fecha = searchParams.get('fecha') || fechaColombia()

    const pedidos = await sql`
      SELECT
        v.id           as visita_id,
        v.valor_pedido,
        v.notas,
        v.timestamp,
        c.id           as cliente_id,
        c.nombre       as cliente_nombre,
        c.direccion,
        c.lat,
        c.lng,
        c.telefono,
        a.nombre       as asesor_nombre,
        a.zona
      FROM visitas v
      JOIN clientes c ON c.id = v.cliente_id
      JOIN asesores a ON a.id = v.asesor_id
      WHERE v.hubo_pedido = true
        AND (v.timestamp AT TIME ZONE 'America/Bogota')::date = ${fecha}::date
        AND c.activo = true
      ORDER BY a.nombre, c.nombre
    `

    // Agrupar por asesor
    const porAsesor: Record<string, any> = {}
    let totalPedidos = 0
    let totalValor = 0

    for (const p of pedidos) {
      const key = p.asesor_nombre
      if (!porAsesor[key]) {
        porAsesor[key] = { asesor: p.asesor_nombre, zona: p.zona, pedidos: [] }
      }
      porAsesor[key].pedidos.push({
        visita_id:      p.visita_id,
        cliente_id:     p.cliente_id,
        cliente_nombre: p.cliente_nombre,
        direccion:      p.direccion,
        lat:            p.lat ? parseFloat(p.lat) : null,
        lng:            p.lng ? parseFloat(p.lng) : null,
        telefono:       p.telefono,
        valor_pedido:   parseFloat(p.valor_pedido) || 0,
        valor_formato:  `$${(parseFloat(p.valor_pedido) || 0).toLocaleString('es-CO')}`,
        notas:          p.notas,
        hora:           new Date(p.timestamp).toLocaleTimeString('es-CO', {
          timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit'
        }),
      })
      totalPedidos++
      totalValor += parseFloat(p.valor_pedido) || 0
    }

    return NextResponse.json({
      fecha,
      total_pedidos: totalPedidos,
      total_valor:   totalValor,
      total_formato: `$${totalValor.toLocaleString('es-CO')}`,
      por_asesor:    Object.values(porAsesor),
    })

  } catch (error) {
    console.error('Error en pedidos-dia:', error)
    return NextResponse.json({ error: 'Error obteniendo pedidos' }, { status: 500 })
  }
}
