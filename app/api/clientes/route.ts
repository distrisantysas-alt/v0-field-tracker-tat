// ============================================================================
// app/api/clientes/route.ts
// ✅ POST  → crear cliente nuevo + agregarlo a rutas_dia del día actual
// ✅ PATCH → actualizar coordenadas GPS y/o dirección de un cliente existente
// ============================================================================
import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

function fechaColombia() {
  return new Date().toLocaleString('en-CA', { timeZone: 'America/Bogota' }).split(',')[0]
}

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

    // 1. Crear el cliente
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

    const nuevoCliente = result[0]
    const fecha = fechaColombia()

    // 2. Obtener el orden máximo actual para este asesor en el día
    const ordenResult = await sql`
      SELECT COALESCE(MAX(orden), 0) + 1 as siguiente_orden
      FROM rutas_dia
      WHERE asesor_id = ${asesor_id}
        AND fecha = ${fecha}
    `
    const orden = ordenResult[0]?.siguiente_orden ?? 1

    // 3. Agregar a rutas_dia para que aparezca hoy y mañana
    await sql`
      INSERT INTO rutas_dia (asesor_id, cliente_id, fecha, orden, completada)
      VALUES (${asesor_id}, ${nuevoCliente.id}, ${fecha}, ${orden}, false)
      ON CONFLICT (asesor_id, cliente_id, fecha) DO NOTHING
    `

    // 4. También agregar al día siguiente para que persista en la ruta
    const manana = new Date()
    manana.setDate(manana.getDate() + 1)
    const fechaManana = manana.toLocaleString('en-CA', { timeZone: 'America/Bogota' }).split(',')[0]

    const ordenMananaResult = await sql`
      SELECT COALESCE(MAX(orden), 0) + 1 as siguiente_orden
      FROM rutas_dia
      WHERE asesor_id = ${asesor_id}
        AND fecha = ${fechaManana}
    `
    const ordenManana = ordenMananaResult[0]?.siguiente_orden ?? 1

    await sql`
      INSERT INTO rutas_dia (asesor_id, cliente_id, fecha, orden, completada)
      VALUES (${asesor_id}, ${nuevoCliente.id}, ${fechaManana}, ${ordenManana}, false)
      ON CONFLICT (asesor_id, cliente_id, fecha) DO NOTHING
    `

    console.log(`✅ Cliente creado: ${nuevoCliente.nombre} → agregado a rutas_dia ${fecha} y ${fechaManana}`)

    return NextResponse.json({
      success: true,
      mensaje: 'Cliente creado correctamente',
      cliente: nuevoCliente,
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

    if (lat != null && lng != null && direccion != null) {
      await sql`
        UPDATE clientes
        SET lat = ${lat}, lng = ${lng}, direccion = ${direccion}
        WHERE id = ${cliente_id}
      `
    } else if (lat != null && lng != null) {
      await sql`
        UPDATE clientes
        SET lat = ${lat}, lng = ${lng}
        WHERE id = ${cliente_id}
      `
    } else if (direccion != null) {
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
