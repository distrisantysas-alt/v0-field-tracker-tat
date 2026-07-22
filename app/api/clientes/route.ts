// ============================================================================
// app/api/clientes/route.ts
// ✅ POST  → crear cliente nuevo — solo inserta en clientes, sin rutas_dia
// ✅ PATCH → actualizar nombre, dirección, teléfono, GPS
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

    // Crear el cliente asignado al asesor — aparece automáticamente
    // en su ruta gracias al UNION en /api/clientes-del-dia
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

    console.log(`✅ Cliente creado: ${result[0].nombre} (${codigoFinal}) → asesor ${asesor_id}`)

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

// ── Actualizar nombre, dirección, teléfono y/o GPS ──────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { cliente_id, lat, lng, direccion, telefono, nombre } = body

    if (!cliente_id) {
      return NextResponse.json(
        { error: 'cliente_id es requerido' },
        { status: 400 }
      )
    }

    if (nombre != null && !nombre.trim()) {
      return NextResponse.json(
        { error: 'El nombre no puede quedar vacío' },
        { status: 400 }
      )
    }

    const campos: string[] = []
    if (lat != null)       campos.push('lat')
    if (lng != null)       campos.push('lng')
    if (direccion != null) campos.push('direccion')
    if (telefono != null)  campos.push('telefono')
    if (nombre != null)    campos.push('nombre')

    if (campos.length === 0) {
      return NextResponse.json(
        { error: 'Debes enviar al menos un campo para actualizar' },
        { status: 400 }
      )
    }

    await sql`
      UPDATE clientes
      SET
        lat       = COALESCE(${lat ?? null}, lat),
        lng       = COALESCE(${lng ?? null}, lng),
        direccion = COALESCE(${direccion ?? null}, direccion),
        telefono  = COALESCE(${telefono ?? null}, telefono),
        nombre    = COALESCE(${nombre?.trim() ?? null}, nombre)
      WHERE id = ${cliente_id}
    `

    console.log(`✏️ Cliente ${cliente_id} actualizado: ${campos.join(', ')}`)

    return NextResponse.json({
      success: true,
      mensaje: 'Cliente actualizado correctamente',
      campos_actualizados: campos,
    })

  } catch (error) {
    console.error('Error actualizando cliente:', error)
    return NextResponse.json({ error: 'Error actualizando cliente' }, { status: 500 })
  }
}
