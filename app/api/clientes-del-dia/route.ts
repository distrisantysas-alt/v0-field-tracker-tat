// ============================================================================
// app/api/clientes-del-dia/route.ts (ACTUALIZADO)
// ============================================================================
// Si hay rutas asignadas en rutas_dia → las usa (con orden)
// Si NO hay rutas → devuelve TODOS los clientes asignados al asesor
// ✅ Incluye foto_url de la visita del día
// ✅ Incluye clientes compartidos vía asesor_clientes
// ✅ Incluye ultima_foto_url — foto de la última visita (persiste entre días)
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
        v.foto_url,
        uv.foto_url AS ultima_foto_url,
        uv.timestamp AS ultima_visita_en
      FROM rutas_dia r
      JOIN clientes c ON c.id = r.cliente_id
      LEFT JOIN visitas v
        ON v.cliente_id = c.id
        AND v.asesor_id = ${asesorId}
        AND (v.timestamp AT TIME ZONE 'America/Bogota')::date = ${fecha}::date
      LEFT JOIN LATERAL (
        SELECT foto_url, timestamp
        FROM visitas
        WHERE cliente_id = c.id
          AND asesor_id = ${asesorId}
          AND foto_url IS NOT NULL
        ORDER BY timestamp DESC
        LIMIT 1
      ) uv ON true
      WHERE r.asesor_id = ${asesorId}
        AND r.fecha = ${fecha}::date
      ORDER BY r.orden ASC
    `;
  } else {
    // ── Sin rutas_dia: clientes propios + clientes compartidos ───────────
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
        v.foto_url,
        uv.foto_url AS ultima_foto_url,
        uv.timestamp AS ultima_visita_en
      FROM clientes c
      LEFT JOIN visitas v
        ON v.cliente_id = c.id
        AND v.asesor_id = ${asesorId}
        AND (v.timestamp AT TIME ZONE 'America/Bogota')::date = ${fecha}::date
      LEFT JOIN LATERAL (
        SELECT foto_url, timestamp
        FROM visitas
        WHERE cliente_id = c.id
          AND asesor_id = ${asesorId}
          AND foto_url IS NOT NULL
        ORDER BY timestamp DESC
        LIMIT 1
      ) uv ON true
      WHERE c.asesor_id = ${asesorId}
        AND c.activo = true

      UNION

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
        v.foto_url,
        uv.foto_url AS ultima_foto_url,
        uv.timestamp AS ultima_visita_en
      FROM asesor_clientes ac
      JOIN clientes c ON c.id = ac.cliente_id
      LEFT JOIN visitas v
        ON v.cliente_id = c.id
        AND v.asesor_id = ${asesorId}
        AND (v.timestamp AT TIME ZONE 'America/Bogota')::date = ${fecha}::date
      LEFT JOIN LATERAL (
        SELECT foto_url, timestamp
        FROM visitas
        WHERE cliente_id = c.id
          AND asesor_id = ${asesorId}
          AND foto_url IS NOT NULL
        ORDER BY timestamp DESC
        LIMIT 1
      ) uv ON true
      WHERE ac.asesor_id = ${asesorId}
        AND c.activo = true
      ORDER BY nombre ASC
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
