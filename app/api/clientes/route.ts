// ============================================================================
// app/api/clientes/route.ts
// ✅ POST  → crear cliente nuevo — solo inserta en clientes, sin rutas_dia
// ✅ PATCH → actualizar nombre, dirección, teléfono, GPS
// ============================================================================
import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireSesion } from '@/lib/auth'

// ── Crear cliente nuevo ──────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const auth = await requireSesion(req)
    if (auth instanceof NextResponse) return auth
    const asesor_id = auth.asesorId

    const body = await req.json()
    const { nombre, direccion, telefono, lat, lng, codigo } = body

    if (!nombre || typeof nombre !== 'string' || !nombre.trim() || !asesor_id) {
      return NextResponse.json(
        { error: 'El nombre del cliente es requerido' },
        { status: 400 }
      )
    }
    if (nombre.trim().length > 150) {
      return NextResponse.json(
        { error: 'El nombre es demasiado largo (máximo 150 caracteres)' },
        { status: 400 }
      )
    }
    if (telefono && String(telefono).trim().length > 50) {
      return NextResponse.json(
        { error: 'El teléfono es demasiado largo (máximo 50 caracteres)' },
        { status: 400 }
      )
    }

    // lat/lng son NOT NULL en la tabla: sin GPS se guarda 0,0 (misma convención
    // que el import CSV). Se usa Number.isFinite para no perder coordenadas válidas.
    const latNum = Number(lat)
    const lngNum = Number(lng)
    const gpsValido =
      lat != null && lng != null && lat !== '' && lng !== '' &&
      Number.isFinite(latNum) && Number.isFinite(lngNum) &&
      Math.abs(latNum) <= 90 && Math.abs(lngNum) <= 180
    const latFinal = gpsValido ? latNum : 0
    const lngFinal = gpsValido ? lngNum : 0

    // codigo es varchar(20) UNIQUE: "NEW-" + timestamp + sufijo aleatorio evita colisiones
    const codigoFinal =
      codigo?.trim() ||
      `NEW-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase()
    if (codigoFinal.length > 20) {
      return NextResponse.json(
        { error: 'El código es demasiado largo (máximo 20 caracteres)' },
        { status: 400 }
      )
    }

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
        ${latFinal},
        ${lngFinal},
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
    const auth = await requireSesion(req)
    if (auth instanceof NextResponse) return auth

    const body = await req.json()
    const { cliente_id, lat, lng, direccion, telefono, nombre, motivo } = body

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

    // Si se está moviendo el GPS, deja rastro en clientes_gps_historial ANTES
    // del UPDATE (para poder guardar lat/lng anteriores). Nunca bloquea el
    // guardado — si algo falla acá, el UPDATE de abajo sigue igual.
    if (lat != null && lng != null) {
      try {
        const actual = await sql`SELECT lat, lng FROM clientes WHERE id = ${cliente_id}`
        const latAnterior = actual[0]?.lat ?? null
        const lngAnterior = actual[0]?.lng ?? null

        let distanciaMovida: number | null = null
        if (latAnterior != null && lngAnterior != null && Number(latAnterior) !== 0 && Number(lngAnterior) !== 0) {
          const d = await sql`
            SELECT haversine_metros(
              ${latAnterior}::double precision, ${lngAnterior}::double precision,
              ${lat}::double precision, ${lng}::double precision
            ) AS distancia
          `
          distanciaMovida = parseFloat(d[0].distancia)
        }

        await sql`
          INSERT INTO clientes_gps_historial (
            cliente_id, asesor_id, lat_anterior, lng_anterior,
            lat_nueva, lng_nueva, distancia_movida_metros, motivo
          ) VALUES (
            ${cliente_id}, ${auth.asesorId}, ${latAnterior}, ${lngAnterior},
            ${lat}, ${lng}, ${distanciaMovida}, ${motivo?.trim() || 'no_especificado'}
          )
        `
      } catch (histError) {
        console.error('⚠️ Error guardando historial GPS (no bloquea el guardado):', histError)
      }
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
