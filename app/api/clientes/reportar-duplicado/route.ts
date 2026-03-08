// ============================================================================
// app/api/clientes/reportar-duplicado/route.ts
// POST → asesor reporta un cliente como posible duplicado
// GET  → supervisor consulta los reportes pendientes
// ============================================================================
import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

// ── Asesor reporta duplicado ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { cliente_id, asesor_id, nota } = body

    if (!cliente_id || !asesor_id) {
      return NextResponse.json(
        { error: 'cliente_id y asesor_id son requeridos' },
        { status: 400 }
      )
    }

    // Evitar reportes duplicados del mismo asesor para el mismo cliente
    const existe = await sql`
      SELECT id FROM reportes_duplicado
      WHERE cliente_id = ${cliente_id}
        AND asesor_id  = ${asesor_id}
        AND estado     = 'pendiente'
      LIMIT 1
    `
    if (existe.length > 0) {
      return NextResponse.json({
        success: true,
        mensaje: 'Ya existe un reporte pendiente para este cliente',
        duplicado: true,
      })
    }

    const result = await sql`
      INSERT INTO reportes_duplicado (cliente_id, asesor_id, nota)
      VALUES (${cliente_id}, ${asesor_id}, ${nota ?? null})
      RETURNING *
    `

    return NextResponse.json({
      success: true,
      mensaje: 'Reporte enviado al supervisor',
      reporte: result[0],
    })
  } catch (error) {
    console.error('Error reportando duplicado:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// ── Supervisor consulta reportes ─────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const estado = req.nextUrl.searchParams.get('estado') ?? 'pendiente'

    const reportes = await sql`
      SELECT
        r.id,
        r.estado,
        r.nota,
        r.created_at,
        r.resuelto_en,
        c.id          AS cliente_id,
        c.codigo      AS cliente_codigo,
        c.nombre      AS cliente_nombre,
        c.direccion   AS cliente_direccion,
        a.nombre      AS asesor_nombre
      FROM reportes_duplicado r
      JOIN clientes c ON c.id = r.cliente_id
      JOIN asesores a ON a.id = r.asesor_id
      WHERE r.estado = ${estado}
      ORDER BY r.created_at DESC
    `

    return NextResponse.json({ success: true, reportes })
  } catch (error) {
    console.error('Error obteniendo reportes:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// ── Supervisor resuelve reporte ───────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { reporte_id, accion } = body
    // accion: 'confirmar_duplicado' | 'descartar' | 'es_homonimo'

    if (!reporte_id || !accion) {
      return NextResponse.json(
        { error: 'reporte_id y accion son requeridos' },
        { status: 400 }
      )
    }

    const estadoMap: Record<string, string> = {
      confirmar_duplicado: 'confirmado',
      descartar:           'descartado',
      es_homonimo:         'homonimo',
    }

    const nuevoEstado = estadoMap[accion]
    if (!nuevoEstado) {
      return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
    }

    const result = await sql`
      UPDATE reportes_duplicado
      SET estado      = ${nuevoEstado},
          resuelto_en = NOW()
      WHERE id = ${reporte_id}
      RETURNING *
    `

    if (result.length === 0) {
      return NextResponse.json({ error: 'Reporte no encontrado' }, { status: 404 })
    }

    // Si se confirma duplicado → desactivar el cliente
    if (accion === 'confirmar_duplicado') {
      await sql`
        UPDATE clientes
        SET activo = false
        WHERE id = (SELECT cliente_id FROM reportes_duplicado WHERE id = ${reporte_id})
      `
    }

    return NextResponse.json({
      success: true,
      mensaje: `Reporte ${nuevoEstado}`,
      reporte: result[0],
    })
  } catch (error) {
    console.error('Error resolviendo reporte:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
