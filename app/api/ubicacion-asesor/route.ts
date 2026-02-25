// app/api/ubicacion-asesor/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'

// Guardar ubicación del asesor
export async function POST(req: NextRequest) {
  try {
    const { asesor_id, lat, lng } = await req.json()
    if (!asesor_id || !lat || !lng) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
    }
    await sql`
      INSERT INTO ubicaciones_asesores (asesor_id, lat, lng, actualizado_en)
      VALUES (${asesor_id}, ${lat}, ${lng}, NOW())
      ON CONFLICT (asesor_id)
      DO UPDATE SET lat = ${lat}, lng = ${lng}, actualizado_en = NOW()
    `
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: 'Error guardando ubicación' }, { status: 500 })
  }
}

// Obtener ubicaciones de todos los asesores
export async function GET() {
  try {
    const rows = await sql`
      SELECT 
        u.asesor_id,
        a.nombre,
        a.zona,
        u.lat,
        u.lng,
        u.actualizado_en,
        EXTRACT(EPOCH FROM (NOW() - u.actualizado_en)) / 60 AS minutos_atras
      FROM ubicaciones_asesores u
      JOIN asesores a ON a.id = u.asesor_id
      WHERE a.activo = true
      AND u.actualizado_en > NOW() - INTERVAL '8 hours'
      ORDER BY u.actualizado_en DESC
    `
    return NextResponse.json({ ubicaciones: rows })
  } catch (e) {
    return NextResponse.json({ error: 'Error obteniendo ubicaciones' }, { status: 500 })
  }
}
