// ============================================================================
// app/api/clientes-del-dia/route.ts (ACTUALIZADO)
// ============================================================================
// Si hay rutas asignadas en rutas_dia → las usa (con orden)
// Si NO hay rutas → devuelve TODOS los clientes asignados al asesor
// ✅ Incluye foto_url de la visita del día
// ============================================================================
import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const asesorId = req.nextUrl.searchParams.get('asesor_id');
  const fecha    = req.nextUrl.searchParams.get('fecha')
                   ?? new Date().toLocaleString('en-CA', { timeZone: 'America/Bogota' }).split(',')[0];

  if (!asesorId) {
    return NextResponse.json({ error: 'asesor_id requerido' }, { status: 400 });
  }

  // ── Verificar si hay rutas asignadas para hoy ──────────────────────────
  const rutasCount = await sql`
    SELECT COUNT(*) as total
    FROM rutas_dia
    WHERE asesor_id = ${asesorId}
      AND fecha = ${fecha}::date
  `;

  const tieneRutas = parseInt(rutasCount[0]?.total ?? '0') > 0;

  let clientes;

  if (tieneRutas) {
    // ── Con rutas_dia: respeta el orden asignado ─────────────────────────
    clientes = await sql`
      SELECT
        c.id,
        c.codigo,
        c.nombre,
        c.direccion,
        c.lat,
        c.lng,
        c.radio_metros,
        r.orden,
        r.completada,
        v.validada,
        v.distancia_metros,
        v.timestamp AS visitado_en,
        v.foto_url
      FROM rutas_dia r
      JOIN clientes c ON c.id = r.cliente_id
      LEFT JOIN visitas v
        ON v.cliente_id = c.id
        AND v.asesor_id = ${asesorId}
        AND v.timestamp::date = ${fecha}::date
      WHERE r.asesor_id = ${asesorId}
        AND r.fecha = ${fecha}::date
      ORDER BY r.orden ASC
    `;
  } else {
    // ── Sin rutas_dia: todos los clientes asignados al asesor ────────────
    clientes = await sql`
      SELECT
        c.id,
        c.codigo,
        c.nombre,
        c.direccion,
        c.lat,
        c.lng,
        c.radio_metros,
        0 AS orden,
        false AS completada,
        v.validada,
        v.distancia_metros,
        v.timestamp AS visitado_en,
        v.foto_url
      FROM clientes c
      LEFT JOIN visitas v
        ON v.cliente_id = c.id
        AND v.asesor_id = ${asesorId}
        AND v.timestamp::date = ${fecha}::date
      WHERE c.asesor_id = ${asesorId}
        AND c.activo = true
      ORDER BY c.nombre ASC
    `;
  }

  const stats = {
    total:       clientes.length,
    validadas:   clientes.filter(c => c.validada === true).length,
    sospechosas: clientes.filter(c => c.validada === false && c.visitado_en).length,
    pendientes:  clientes.filter(c => !c.visitado_en).length,
    modo:        tieneRutas ? 'ruta_asignada' : 'todos_los_clientes',
  };

  return NextResponse.json({ clientes, stats, fecha });
}
