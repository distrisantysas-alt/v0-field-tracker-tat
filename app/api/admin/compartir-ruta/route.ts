// app/api/admin/compartir-ruta/route.ts
// ============================================================================
// Comparte clientes de ciertas rutas de un asesor con otro asesor
// SIN mover ni duplicar — usa tabla asesor_clientes
// ============================================================================

import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireSesion } from '@/lib/auth'

const ROLES_ADMIN = ['supervisor', 'gerencia']

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSesion(req, ROLES_ADMIN)
    if (auth instanceof NextResponse) return auth

    const { asesor_origen_id, asesor_destino_id, rutas } = await req.json()

    if (!asesor_origen_id || !asesor_destino_id || !rutas?.length) {
      return NextResponse.json({ error: 'Faltan datos requeridos' }, { status: 400 })
    }

    if (asesor_origen_id === asesor_destino_id) {
      return NextResponse.json({ error: 'El asesor origen y destino no pueden ser el mismo' }, { status: 400 })
    }

    // Obtener nombres de asesores para la respuesta
    const [origen, destino] = await Promise.all([
      sql`SELECT nombre FROM asesores WHERE id = ${asesor_origen_id}::uuid LIMIT 1`,
      sql`SELECT nombre FROM asesores WHERE id = ${asesor_destino_id}::uuid LIMIT 1`,
    ])

    if (!origen.length || !destino.length) {
      return NextResponse.json({ error: 'Asesor no encontrado' }, { status: 404 })
    }

    // Obtener clientes propios + compartidos del asesor origen
    const clientes = await sql`
      SELECT id, nombre FROM clientes
      WHERE asesor_id = ${asesor_origen_id}::uuid AND activo = true
      UNION
      SELECT c.id, c.nombre FROM clientes c
      INNER JOIN asesor_clientes ac ON ac.cliente_id = c.id
      WHERE ac.asesor_id = ${asesor_origen_id}::uuid AND c.activo = true
    `

    // Filtrar por rutas seleccionadas (el prefijo antes del primer espacio)
    const clientesFiltrados = clientes.filter((c: any) => {
      const match = c.nombre?.match(/^([A-Z0-9]+)\s/)
      const ruta = match ? match[1] : null
      return ruta && rutas.includes(ruta)
    })

    if (clientesFiltrados.length === 0) {
      return NextResponse.json({ error: 'No se encontraron clientes para las rutas seleccionadas' }, { status: 404 })
    }

    // Insertar en asesor_clientes (ON CONFLICT DO NOTHING para no duplicar)
    let compartidos = 0
    for (const cliente of clientesFiltrados) {
      await sql`
        INSERT INTO asesor_clientes (asesor_id, cliente_id)
        VALUES (${asesor_destino_id}::uuid, ${cliente.id})
        ON CONFLICT (asesor_id, cliente_id) DO NOTHING
      `
      compartidos++
    }

    return NextResponse.json({
      success: true,
      compartidos,
      asesor_origen:  origen[0].nombre,
      asesor_destino: destino[0].nombre,
      rutas,
    })

  } catch (error) {
    console.error('Error compartiendo ruta:', error)
    return NextResponse.json(
      { error: 'Error al compartir ruta', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}

// GET — Ver rutas compartidas con un asesor
export async function GET(req: NextRequest) {
  try {
    const auth = await requireSesion(req, ROLES_ADMIN)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(req.url)
    const asesor_id = searchParams.get('asesor_id')

    if (!asesor_id) {
      return NextResponse.json({ error: 'Falta asesor_id' }, { status: 400 })
    }

    const compartidos = await sql`
      SELECT 
        c.id,
        c.nombre,
        c.direccion,
        c.lat,
        c.lng,
        a.nombre AS asesor_original
      FROM asesor_clientes ac
      JOIN clientes c ON c.id = ac.cliente_id
      JOIN asesores a ON a.id = c.asesor_id
      WHERE ac.asesor_id = ${asesor_id}::uuid
      AND c.activo = true
      ORDER BY c.nombre
    `

    return NextResponse.json({ compartidos, total: compartidos.length })

  } catch (error) {
    return NextResponse.json({ error: 'Error obteniendo clientes compartidos' }, { status: 500 })
  }
}

// DELETE — Quitar clientes compartidos
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireSesion(req, ROLES_ADMIN)
    if (auth instanceof NextResponse) return auth

    const { asesor_destino_id, asesor_origen_id, rutas } = await req.json()

    if (!asesor_destino_id || !asesor_origen_id) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
    }

    const clientes = await sql`
      SELECT id, nombre FROM clientes
      WHERE asesor_id = ${asesor_origen_id}::uuid AND activo = true
      UNION
      SELECT c.id, c.nombre FROM clientes c
      INNER JOIN asesor_clientes ac ON ac.cliente_id = c.id
      WHERE ac.asesor_id = ${asesor_origen_id}::uuid AND c.activo = true
    `

    const clientesFiltrados = rutas?.length
      ? clientes.filter((c: any) => {
          const match = c.nombre?.match(/^([A-Z0-9]+)\s/)
          const ruta = match ? match[1] : null
          return ruta && rutas.includes(ruta)
        })
      : clientes

    let eliminados = 0
    for (const cliente of clientesFiltrados) {
      await sql`
        DELETE FROM asesor_clientes
        WHERE asesor_id = ${asesor_destino_id}::uuid
        AND cliente_id = ${cliente.id}
      `
      eliminados++
    }

    return NextResponse.json({ success: true, eliminados })

  } catch (error) {
    return NextResponse.json({ error: 'Error eliminando clientes compartidos' }, { status: 500 })
  }
}
