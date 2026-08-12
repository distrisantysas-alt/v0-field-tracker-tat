// ============================================================================
// app/api/admin/seguimiento/route.ts
// GET — señales de seguimiento para supervisor/gerencia. Solo lectura,
// nada de esto bloquea ni aprueba/rechaza nada — es puro contexto para que
// el supervisor pueda conversar con el asesor si ve un patrón raro.
// ============================================================================
import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireSesion } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSesion(req, ['supervisor', 'gerencia'])
    if (auth instanceof NextResponse) return auth

    // ── 1) Visitas con distancia exacta 0.00, por asesor, últimos 30 días ──
    const distanciaCeroPorAsesor = await sql`
      SELECT
        a.id   AS asesor_id,
        a.nombre AS asesor_nombre,
        COUNT(*)::int AS total_distancia_cero,
        COUNT(*) FILTER (WHERE v.hubo_pedido = true)::int AS con_pedido
      FROM visitas v
      JOIN asesores a ON a.id = v.asesor_id
      WHERE v.distancia_metros = 0
        AND v.timestamp >= NOW() - INTERVAL '30 days'
      GROUP BY a.id, a.nombre
      ORDER BY total_distancia_cero DESC
      LIMIT 50
    `

    // ── 2) Visitas con velocidad implícita sospechosa ───────────────────────
    const velocidadSospechosa = await sql`
      SELECT
        v.id, v.timestamp, v.lat_capturada, v.lng_capturada,
        a.id AS asesor_id, a.nombre AS asesor_nombre,
        c.id AS cliente_id, c.nombre AS cliente_nombre
      FROM visitas v
      JOIN asesores a ON a.id = v.asesor_id
      JOIN clientes c ON c.id = v.cliente_id
      WHERE v.velocidad_sospechosa = true
      ORDER BY v.timestamp DESC
      LIMIT 50
    `

    // ── 3) Pedidos registrados en visitas fuera de rango (validada=false) ──
    const pedidosFueraDeRango = await sql`
      SELECT
        v.id, v.timestamp, v.distancia_metros, v.valor_pedido,
        a.id AS asesor_id, a.nombre AS asesor_nombre,
        c.id AS cliente_id, c.nombre AS cliente_nombre
      FROM visitas v
      JOIN asesores a ON a.id = v.asesor_id
      JOIN clientes c ON c.id = v.cliente_id
      WHERE v.validada = false AND v.hubo_pedido = true
      ORDER BY v.timestamp DESC
      LIMIT 50
    `

    return NextResponse.json({
      distancia_cero_por_asesor: distanciaCeroPorAsesor,
      velocidad_sospechosa: velocidadSospechosa,
      pedidos_fuera_de_rango: pedidosFueraDeRango,
    })

  } catch (error) {
    console.error('Error obteniendo señales de seguimiento:', error)
    const msg = error instanceof Error ? error.message : 'Unknown'
    return NextResponse.json({ error: 'Error obteniendo señales de seguimiento', details: msg }, { status: 500 })
  }
}
