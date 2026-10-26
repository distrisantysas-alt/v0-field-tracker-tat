// ============================================================================
// app/api/clientes-del-dia/route.ts (ACTUALIZADO)
// ============================================================================
// Si hay rutas asignadas en rutas_dia → las usa (con orden)
// Si NO hay rutas → devuelve TODOS los clientes asignados al asesor
// ✅ Incluye foto_url de la visita del día
// ✅ Incluye clientes compartidos vía asesor_clientes
// ✅ Incluye ultima_foto_url — foto de la última visita (persiste entre días)
// ✅ Incluye clientes nuevos creados por el asesor aunque no estén en rutas_dia
// ✅ PUT guarda el orden de visita que el asesor planeó ("Planear mi ruta"), en rutas_dia.orden
// ✅ La gestión del día de un cliente se muestra sin importar qué asesor la hizo:
//    si la ruta se traspasa a mitad de día, lo ya visitado sigue marcado como visitado.
// ✅ Cada gestión del historial trae quién la hizo y su nota, aunque la haya
//    hecho otro asesor (clientes traspasados): la información no se pierde.
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
  notas?: string | null;
  asesor_nombre?: string | null;
  otro_asesor?: boolean;
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
      SELECT * FROM (
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
      LEFT JOIN LATERAL (
        SELECT vv.validada, vv.distancia_metros, vv.timestamp, vv.foto_url, vv.hubo_pedido, vv.valor_pedido
        FROM visitas vv
        WHERE vv.cliente_id = c.id
          AND (vv.timestamp AT TIME ZONE 'America/Bogota')::date = ${fecha}::date
        ORDER BY (vv.asesor_id = ${asesorId}::uuid) DESC, vv.timestamp DESC
        LIMIT 1
      ) v ON true
      LEFT JOIN LATERAL (
        SELECT foto_url, timestamp
        FROM visitas
        WHERE cliente_id = c.id
          AND foto_url IS NOT NULL
        ORDER BY timestamp DESC
        LIMIT 1
      ) uv ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(h ORDER BY h.timestamp DESC) AS historial
        FROM (
          SELECT vh.timestamp, vh.hubo_pedido, vh.valor_pedido, vh.notas,
                 ah.nombre AS asesor_nombre, (vh.asesor_id <> ${asesorId}::uuid) AS otro_asesor
          FROM visitas vh
          LEFT JOIN asesores ah ON ah.id = vh.asesor_id
          WHERE vh.cliente_id = c.id
          ORDER BY vh.timestamp DESC
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
      LEFT JOIN LATERAL (
        SELECT vv.validada, vv.distancia_metros, vv.timestamp, vv.foto_url, vv.hubo_pedido, vv.valor_pedido
        FROM visitas vv
        WHERE vv.cliente_id = c.id
          AND (vv.timestamp AT TIME ZONE 'America/Bogota')::date = ${fecha}::date
        ORDER BY (vv.asesor_id = ${asesorId}::uuid) DESC, vv.timestamp DESC
        LIMIT 1
      ) v ON true
      LEFT JOIN LATERAL (
        SELECT foto_url, timestamp
        FROM visitas
        WHERE cliente_id = c.id
          AND foto_url IS NOT NULL
        ORDER BY timestamp DESC
        LIMIT 1
      ) uv ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(h ORDER BY h.timestamp DESC) AS historial
        FROM (
          SELECT vh.timestamp, vh.hubo_pedido, vh.valor_pedido, vh.notas,
                 ah.nombre AS asesor_nombre, (vh.asesor_id <> ${asesorId}::uuid) AS otro_asesor
          FROM visitas vh
          LEFT JOIN asesores ah ON ah.id = vh.asesor_id
          WHERE vh.cliente_id = c.id
          ORDER BY vh.timestamp DESC
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
      LEFT JOIN LATERAL (
        SELECT vv.validada, vv.distancia_metros, vv.timestamp, vv.foto_url, vv.hubo_pedido, vv.valor_pedido
        FROM visitas vv
        WHERE vv.cliente_id = c.id
          AND (vv.timestamp AT TIME ZONE 'America/Bogota')::date = ${fecha}::date
        ORDER BY (vv.asesor_id = ${asesorId}::uuid) DESC, vv.timestamp DESC
        LIMIT 1
      ) v ON true
      LEFT JOIN LATERAL (
        SELECT foto_url, timestamp
        FROM visitas
        WHERE cliente_id = c.id
          AND foto_url IS NOT NULL
        ORDER BY timestamp DESC
        LIMIT 1
      ) uv ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(h ORDER BY h.timestamp DESC) AS historial
        FROM (
          SELECT vh.timestamp, vh.hubo_pedido, vh.valor_pedido, vh.notas,
                 ah.nombre AS asesor_nombre, (vh.asesor_id <> ${asesorId}::uuid) AS otro_asesor
          FROM visitas vh
          LEFT JOIN asesores ah ON ah.id = vh.asesor_id
          WHERE vh.cliente_id = c.id
          ORDER BY vh.timestamp DESC
          LIMIT 5
        ) h
      ) hist ON true
      WHERE ac.asesor_id = ${asesorId}
        AND c.activo = true
        AND c.id NOT IN (
          SELECT cliente_id FROM rutas_dia
          WHERE asesor_id = ${asesorId} AND fecha = ${fecha}::date
        )

      ) t
      -- los clientes con orden planeado (>0) van primero, en ese orden; el resto detrás, por nombre
      ORDER BY (CASE WHEN COALESCE(t.orden, 0) = 0 THEN 1 ELSE 0 END), t.orden ASC, t.nombre ASC
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
      LEFT JOIN LATERAL (
        SELECT vv.validada, vv.distancia_metros, vv.timestamp, vv.foto_url, vv.hubo_pedido, vv.valor_pedido
        FROM visitas vv
        WHERE vv.cliente_id = c.id
          AND (vv.timestamp AT TIME ZONE 'America/Bogota')::date = ${fecha}::date
        ORDER BY (vv.asesor_id = ${asesorId}::uuid) DESC, vv.timestamp DESC
        LIMIT 1
      ) v ON true
      LEFT JOIN LATERAL (
        SELECT foto_url, timestamp
        FROM visitas
        WHERE cliente_id = c.id
          AND foto_url IS NOT NULL
        ORDER BY timestamp DESC
        LIMIT 1
      ) uv ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(h ORDER BY h.timestamp DESC) AS historial
        FROM (
          SELECT vh.timestamp, vh.hubo_pedido, vh.valor_pedido, vh.notas,
                 ah.nombre AS asesor_nombre, (vh.asesor_id <> ${asesorId}::uuid) AS otro_asesor
          FROM visitas vh
          LEFT JOIN asesores ah ON ah.id = vh.asesor_id
          WHERE vh.cliente_id = c.id
          ORDER BY vh.timestamp DESC
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
      LEFT JOIN LATERAL (
        SELECT vv.validada, vv.distancia_metros, vv.timestamp, vv.foto_url, vv.hubo_pedido, vv.valor_pedido
        FROM visitas vv
        WHERE vv.cliente_id = c.id
          AND (vv.timestamp AT TIME ZONE 'America/Bogota')::date = ${fecha}::date
        ORDER BY (vv.asesor_id = ${asesorId}::uuid) DESC, vv.timestamp DESC
        LIMIT 1
      ) v ON true
      LEFT JOIN LATERAL (
        SELECT foto_url, timestamp
        FROM visitas
        WHERE cliente_id = c.id
          AND foto_url IS NOT NULL
        ORDER BY timestamp DESC
        LIMIT 1
      ) uv ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(h ORDER BY h.timestamp DESC) AS historial
        FROM (
          SELECT vh.timestamp, vh.hubo_pedido, vh.valor_pedido, vh.notas,
                 ah.nombre AS asesor_nombre, (vh.asesor_id <> ${asesorId}::uuid) AS otro_asesor
          FROM visitas vh
          LEFT JOIN asesores ah ON ah.id = vh.asesor_id
          WHERE vh.cliente_id = c.id
          ORDER BY vh.timestamp DESC
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
        notas: h.notas ?? null,
        asesor_nombre: h.asesor_nombre ?? null,
        otro_asesor: !!h.otro_asesor,
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


// ── PUT { fecha?, orden: [cliente_id, ...] } → guarda el orden de visita que el asesor planeó ───────────
// Los clientes de la lista van primero, en ese orden; el resto de su ruta del día conserva su orden detrás.
// Solo toca la ruta del asesor logueado y solo clientes suyos o que tiene compartidos.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireSesion(req);
    if (auth instanceof NextResponse) return auth;
    const b = await req.json();
    const hoy = new Date().toLocaleString('en-CA', { timeZone: 'America/Bogota' }).split(',')[0];
    const fecha = typeof b.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.fecha) ? b.fecha : hoy;
    if (!Array.isArray(b.orden) || b.orden.length === 0 || b.orden.length > 300 || !b.orden.every((x: unknown) => typeof x === 'string' && UUID_RE.test(x))) {
      return NextResponse.json({ error: 'El orden debe ser una lista de clientes' }, { status: 400 });
    }
    const ids: string[] = Array.from(new Set<string>(b.orden));

    // 1) Los clientes planeados entran a rutas_dia (si no estaban) con su posición
    const nuevos = await sql`
      WITH nuevo AS (
        SELECT x.id::uuid AS cliente_id, x.pos::int AS pos FROM unnest(${ids}::text[]) WITH ORDINALITY AS x(id, pos)
      ), validos AS (
        SELECT n.cliente_id, n.pos FROM nuevo n
        JOIN clientes c ON c.id = n.cliente_id AND c.activo = true
        WHERE c.asesor_id = ${auth.asesorId}::uuid
           OR EXISTS (SELECT 1 FROM asesor_clientes ac WHERE ac.asesor_id = ${auth.asesorId}::uuid AND ac.cliente_id = c.id)
      )
      INSERT INTO rutas_dia (asesor_id, cliente_id, fecha, orden)
      SELECT ${auth.asesorId}::uuid, v.cliente_id, ${fecha}::date, v.pos FROM validos v
      ON CONFLICT (asesor_id, cliente_id, fecha) DO UPDATE SET orden = EXCLUDED.orden
      RETURNING cliente_id`;

    // 2) El resto de la ruta del día se corre detrás, conservando su orden relativo
    await sql`
      WITH planeados AS (
        SELECT cliente_id FROM rutas_dia
        WHERE asesor_id = ${auth.asesorId}::uuid AND fecha = ${fecha}::date AND cliente_id = ANY(${ids}::uuid[])
      ), resto AS (
        SELECT r.cliente_id,
               ((SELECT COUNT(*) FROM planeados) + row_number() OVER (ORDER BY r.orden NULLS LAST, r.cliente_id))::int AS pos
        FROM rutas_dia r
        WHERE r.asesor_id = ${auth.asesorId}::uuid AND r.fecha = ${fecha}::date AND r.cliente_id <> ALL(${ids}::uuid[])
      )
      UPDATE rutas_dia r SET orden = resto.pos FROM resto
      WHERE r.asesor_id = ${auth.asesorId}::uuid AND r.fecha = ${fecha}::date AND r.cliente_id = resto.cliente_id`;

    return NextResponse.json({ success: true, reordenados: nuevos.length });
  } catch (e) {
    console.error('❌ PUT /api/clientes-del-dia:', e);
    return NextResponse.json({ error: 'No se pudo guardar el orden' }, { status: 500 });
  }
}
