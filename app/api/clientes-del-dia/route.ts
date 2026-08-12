// ============================================================================
// app/api/clientes-del-dia/route.ts (ACTUALIZADO)
// ============================================================================
// Si hay rutas asignadas en rutas_dia → las usa (con orden)
// Si NO hay rutas → devuelve TODOS los clientes asignados al asesor
// ✅ Incluye foto_url de la visita del día
// ✅ Incluye clientes compartidos vía asesor_clientes
// ✅ Incluye ultima_foto_url — foto de la última visita (persiste entre días)
// ✅ Incluye clientes nuevos creados por el asesor aunque no estén en rutas_dia
// ✅ Incluye historial de las últimas 5 gestiones por cliente — no solo la
//    última — para que el asesor vea el patrón (quién dejó de comprarle) y
//    no solo el dato aislado de la visita más reciente.
// ============================================================================
import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireSesion } from '@/lib/auth';

const ROLES_ADMIN = ['supervisor', 'gerencia'];

interface GestionHistorial {
  timestamp: string;
  hubo_pedido: boolean;
  valor_pedido: string | number;
}

export async function GET(req: NextRequest) {
  const auth = await requireSesion(req);
  if (auth instanceof NextResponse) return auth;

  // Un asesor solo ve su propia ruta. Supervisor/gerencia puede consultar
  // la ruta de un asesor específico pasando asesor_id explícito.
  const asesorIdQuery = req.nextUrl.searchParams.get('asesor_id');
  const asesorId = ROLES_ADMIN.includes(auth.rol) && asesorIdQuery ? asesorIdQuery : auth.asesorId;
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
    // ── Con rutas_dia: respeta el orden asignado
    // ── UNION con clientes propios no incluidos en rutas_dia (ej: creados nuevos)
    clientes = await sql`
      SELECT
        c.id,
        c.codigo,
        c.nombre,
        c.direccion,
        c.telefono,
        c.lat,
        c.lng,
        c.radio_metros,
        r.orden,
        r.completada,
        v.validada,
        v.distancia_metros,
        v.timestamp AS visitado_en,
        v.foto_url,
        v.hubo_pedido,
        v.valor_pedido,
        uv.foto_url AS ultima_foto_url,
        uv.timestamp AS ultima_visita_en,
        hist.historial AS historial_reciente
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
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(h ORDER BY h.timestamp DESC) AS historial
        FROM (
          SELECT timestamp, hubo_pedido, valor_pedido
          FROM visitas
          WHERE cliente_id = c.id
            AND asesor_id = ${asesorId}
          ORDER BY timestamp DESC
          LIMIT 5
        ) h
      ) hist ON true
      WHERE r.asesor_id = ${asesorId}
        AND r.fecha = ${fecha}::date

      UNION

      SELECT
        c.id,
        c.codigo,
        c.nombre,
        c.direccion,
        c.telefono,
        c.lat,
        c.lng,
        c.radio_metros,
        0 AS orden,
        false AS completada,
        v.validada,
        v.distancia_metros,
        v.timestamp AS visitado_en,
        v.foto_url,
        v.hubo_pedido,
        v.valor_pedido,
        uv.foto_url AS ultima_foto_url,
        uv.timestamp AS ultima_visita_en,
        hist.historial AS historial_reciente
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
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(h ORDER BY h.timestamp DESC) AS historial
        FROM (
          SELECT timestamp, hubo_pedido, valor_pedido
          FROM visitas
          WHERE cliente_id = c.id
            AND asesor_id = ${asesorId}
          ORDER BY timestamp DESC
          LIMIT 5
        ) h
      ) hist ON true
      WHERE c.asesor_id = ${asesorId}
        AND c.activo = true
        AND c.id NOT IN (
          SELECT cliente_id FROM rutas_dia
          WHERE asesor_id = ${asesorId} AND fecha = ${fecha}::date
        )

      UNION

      SELECT
        c.id,
        c.codigo,
        c.nombre,
        c.direccion,
        c.telefono,
        c.lat,
        c.lng,
        c.radio_metros,
        0 AS orden,
        false AS completada,
        v.validada,
        v.distancia_metros,
        v.timestamp AS visitado_en,
        v.foto_url,
        v.hubo_pedido,
        v.valor_pedido,
        uv.foto_url AS ultima_foto_url,
        uv.timestamp AS ultima_visita_en,
        hist.historial AS historial_reciente
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
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(h ORDER BY h.timestamp DESC) AS historial
        FROM (
          SELECT timestamp, hubo_pedido, valor_pedido
          FROM visitas
          WHERE cliente_id = c.id
            AND asesor_id = ${asesorId}
          ORDER BY timestamp DESC
          LIMIT 5
        ) h
      ) hist ON true
      WHERE ac.asesor_id = ${asesorId}
        AND c.activo = true
        AND c.id NOT IN (
          SELECT cliente_id FROM rutas_dia
          WHERE asesor_id = ${asesorId} AND fecha = ${fecha}::date
        )

      ORDER BY orden ASC, nombre ASC
    `;
  } else {
    // ── Sin rutas_dia: clientes propios + clientes compartidos ───────────
    clientes = await sql`
      SELECT
        c.id,
        c.codigo,
        c.nombre,
        c.direccion,
        c.telefono,
        c.lat,
        c.lng,
        c.radio_metros,
        0 AS orden,
        false AS completada,
        v.validada,
        v.distancia_metros,
        v.timestamp AS visitado_en,
        v.foto_url,
        v.hubo_pedido,
        v.valor_pedido,
        uv.foto_url AS ultima_foto_url,
        uv.timestamp AS ultima_visita_en,
        hist.historial AS historial_reciente
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
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(h ORDER BY h.timestamp DESC) AS historial
        FROM (
          SELECT timestamp, hubo_pedido, valor_pedido
          FROM visitas
          WHERE cliente_id = c.id
            AND asesor_id = ${asesorId}
          ORDER BY timestamp DESC
          LIMIT 5
        ) h
      ) hist ON true
      WHERE c.asesor_id = ${asesorId}
        AND c.activo = true

      UNION

      SELECT
        c.id,
        c.codigo,
        c.nombre,
        c.direccion,
        c.telefono,
        c.lat,
        c.lng,
        c.radio_metros,
        0 AS orden,
        false AS completada,
        v.validada,
        v.distancia_metros,
        v.timestamp AS visitado_en,
        v.foto_url,
        v.hubo_pedido,
        v.valor_pedido,
        uv.foto_url AS ultima_foto_url,
        uv.timestamp AS ultima_visita_en,
        hist.historial AS historial_reciente
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
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(h ORDER BY h.timestamp DESC) AS historial
        FROM (
          SELECT timestamp, hubo_pedido, valor_pedido
          FROM visitas
          WHERE cliente_id = c.id
            AND asesor_id = ${asesorId}
          ORDER BY timestamp DESC
          LIMIT 5
        ) h
      ) hist ON true
      WHERE ac.asesor_id = ${asesorId}
        AND c.activo = true
      ORDER BY nombre ASC
    `;
  }

  // ── Derivar última gestión + racha sin pedido a partir del historial ────
  // Se calcula acá (no en SQL) para mantener la query legible — es un simple
  // recorrido del array de hasta 5 gestiones que ya trajo el LATERAL.
  clientes = clientes.map((c: any) => {
    const historial: GestionHistorial[] = c.historial_reciente ?? [];
    const ultima = historial[0] ?? null;

    let rachaSinPedido = 0;
    for (const h of historial) {
      if (h.hubo_pedido) break;
      rachaSinPedido++;
    }

    return {
      ...c,
      ultima_gestion_en: ultima?.timestamp ?? null,
      ultimo_hubo_pedido: ultima?.hubo_pedido ?? null,
      ultimo_valor_pedido: ultima?.valor_pedido != null ? parseFloat(String(ultima.valor_pedido)) : null,
      racha_sin_pedido: rachaSinPedido,
      historial_reciente: historial.map(h => ({
        timestamp: h.timestamp,
        hubo_pedido: h.hubo_pedido,
        valor_pedido: parseFloat(String(h.valor_pedido)),
      })),
    };
  });

  const stats = {
    total:       clientes.length,
    validadas:   clientes.filter(c => c.validada === true).length,
    sospechosas: clientes.filter(c => c.validada === false && c.visitado_en).length,
    pendientes:  clientes.filter(c => !c.visitado_en).length,
    modo:        tieneRutas ? 'ruta_asignada' : 'todos_los_clientes',
  };

  return NextResponse.json({ clientes, stats, fecha });
}
