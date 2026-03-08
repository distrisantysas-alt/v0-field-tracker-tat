// ============================================================================
// app/api/clientes/route.ts
// ============================================================================
// POST  → crear cliente nuevo desde el móvil del asesor
// PATCH → actualizar coordenadas GPS y/o dirección de un cliente existente
// ============================================================================
import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

// ── Crear cliente nuevo ──────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { nombre, direccion, telefono, lat, lng, asesor_id, codigo } = body

    if (!nombre || !asesor_id) {
      return NextResponse.json(
        { error: 'nombre y asesor_id son requeridos' },
        { status: 400 }
      )
    }

    const codigoFinal = codigo?.trim() || `NEW-${Date.now()}`

    const result = await sql`
      INSERT INTO clientes (
        codigo, nombre, direccion, telefono,
        lat, lng, radio_metros,
        asesor_id, activo
      ) VALUES (
        ${codigoFinal},
        ${nombre.trim()},
        ${direccion?.trim() || null},
        ${telefono?.trim() || null},
        ${lat || null},
        ${lng || null},
        50,
        ${asesor_id},
        true
      )
      RETURNING id, codigo, nombre, direccion, telefono, lat, lng, asesor_id, activo
    `

    return NextResponse.json({
      success: true,
      mensaje: 'Cliente creado correctamente',
      cliente: result[0],
    })
  } catch (error) {
    console.error('Error creando cliente:', error)
    const msg = error instanceof Error ? error.message : 'Unknown'
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return NextResponse.json(
        { error: 'Ya existe un cliente con ese código' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: 'Error creando cliente', details: msg }, { status: 500 })
  }
}

// ── Actualizar GPS y/o dirección de cliente existente ────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { cliente_id, lat, lng, direccion } = body

    if (!cliente_id) {
      return NextResponse.json(
        { error: 'cliente_id es requerido' },
        { status: 400 }
      )
    }

    // Actualizar solo los campos que vienen en el body
    if (lat != null && lng != null && direccion != null) {
      // Ambos — GPS + dirección
      await sql`
        UPDATE clientes
        SET lat = ${lat}, lng = ${lng}, direccion = ${direccion}
        WHERE id = ${cliente_id}
      `
    } else if (lat != null && lng != null) {
      // Solo GPS
      await sql`
        UPDATE clientes
        SET lat = ${lat}, lng = ${lng}
        WHERE id = ${cliente_id}
      `
    } else if (direccion != null) {
      // Solo dirección
      await sql`
        UPDATE clientes
        SET direccion = ${direccion}
        WHERE id = ${cliente_id}
      `
    } else {
      return NextResponse.json(
        { error: 'Debes enviar lat/lng o direccion para actualizar' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      mensaje: 'Cliente actualizado correctamente',
    })
  } catch (error) {
    console.error('Error actualizando cliente:', error)
    return NextResponse.json({ error: 'Error actualizando cliente' }, { status: 500 })
  }
}
