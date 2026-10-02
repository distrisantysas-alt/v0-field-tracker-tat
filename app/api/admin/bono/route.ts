// ============================================================================
// app/api/admin/bono/route.ts
// GET → por asesor y periodo: visitas y pedidos (de esta app) + devoluciones
// (del POS, cargadas con /api/admin/devoluciones). La efectividad neta que
// activa el bono es: (pedidos - devoluciones) / visitas.
// Parametros: fecha_inicio, fecha_fin (AAAA-MM-DD)
// ============================================================================
import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireSesion } from '@/lib/auth'

const FECHA = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSesion(req, ['supervisor', 'gerencia'])
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(req.url)
    const inicio = searchParams.get('fecha_inicio') ?? ''
    const fin = searchParams.get('fecha_fin') ?? ''
    if (!FECHA.test(inicio) || !FECHA.test(fin) || inicio > fin) {
      return NextResponse.json({ error: 'fecha_inicio y fecha_fin (AAAA-MM-DD) válidas son requeridas' }, { status: 400 })
    }

    const actividad = await sql`
      SELECT
        a.id AS asesor_id,
        a.nombre AS asesor_nombre,
        COUNT(v.id)::int AS visitas,
        COUNT(v.id) FILTER (WHERE v.hubo_pedido = true)::int AS pedidos
      FROM asesores a
      LEFT JOIN visitas v
        ON v.asesor_id = a.id
        AND DATE(v.timestamp AT TIME ZONE 'America/Bogota') BETWEEN ${inicio}::date AND ${fin}::date
      WHERE a.activo = true
      GROUP BY a.id, a.nombre
    `

    const devoluciones = await sql`
      SELECT asesor_id, COUNT(*)::int AS devoluciones
      FROM devoluciones_pos
      WHERE fecha BETWEEN ${inicio}::date AND ${fin}::date AND asesor_id IS NOT NULL
      GROUP BY asesor_id
    `
    const devPorAsesor = new Map<string, number>(devoluciones.map((d: any) => [d.asesor_id, d.devoluciones]))

    const sinAsesor = await sql`
      SELECT COALESCE(NULLIF(asesor_pos, ''), '(vacío)') AS asesor, COUNT(*)::int AS cantidad
      FROM devoluciones_pos
      WHERE fecha BETWEEN ${inicio}::date AND ${fin}::date AND asesor_id IS NULL
      GROUP BY 1
      ORDER BY cantidad DESC
    `

    const cobertura = await sql`
      SELECT COUNT(*)::int AS total, MIN(fecha) AS desde, MAX(fecha) AS hasta
      FROM devoluciones_pos
      WHERE fecha BETWEEN ${inicio}::date AND ${fin}::date
    `

    return NextResponse.json({
      success: true,
      periodo: { inicio, fin },
      asesores: (actividad as any[]).map(a => ({
        asesor_id: a.asesor_id,
        asesor_nombre: a.asesor_nombre,
        visitas: a.visitas,
        pedidos: a.pedidos,
        devoluciones: devPorAsesor.get(a.asesor_id) ?? 0,
      })),
      devolucionesSinAsesor: sinAsesor,
      devolucionesCargadas: (cobertura[0] as any).total,
      devolucionesDesde: (cobertura[0] as any).desde,
      devolucionesHasta: (cobertura[0] as any).hasta,
    })
  } catch (error) {
    console.error('❌ Error en GET /api/admin/bono:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: 'Error interno', details: msg }, { status: 500 })
  }
}
