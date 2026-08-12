// ============================================================================
// app/api/admin/informes/route.ts
// GET → informe de visitas para el panel admin
// ============================================================================
// Parámetros:
//   tipo         = resumen | clientes_visitados | no_visitados
//   fecha_inicio = YYYY-MM-DD  (default: inicio del mes actual)
//   fecha_fin    = YYYY-MM-DD  (default: hoy)
//   asesor_id    = number (opcional)
// ============================================================================

import { sql } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { requireSesion } from "@/lib/auth"

function hoy(): string {
  return new Date().toLocaleString("en-CA", { timeZone: "America/Bogota" }).split(",")[0]
}
function inicioMes(): string {
  return hoy().slice(0, 7) + "-01"
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSesion(req, ['supervisor', 'gerencia'])
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(req.url)
    const tipo        = searchParams.get("tipo") || "resumen"
    const fechaInicio = searchParams.get("fecha_inicio") || inicioMes()
    const fechaFin    = searchParams.get("fecha_fin")    || hoy()
    const asesorId    = searchParams.get("asesor_id")

    // ──────────────────────────────────────────────────────────────────────────
    // TIPO: resumen — métricas por asesor en el periodo
    // ──────────────────────────────────────────────────────────────────────────
    if (tipo === "resumen") {
      const rows = asesorId
        ? await sql`
            SELECT
              a.id                                                              AS asesor_id,
              a.nombre                                                          AS asesor_nombre,
              a.zona,
              COUNT(v.id)                                                       AS total_visitas,
              COUNT(DISTINCT v.cliente_id)                                      AS clientes_unicos,
              COUNT(v.id) FILTER (WHERE v.validada = true)                      AS visitas_validadas,
              COUNT(v.id) FILTER (WHERE v.hubo_pedido = true)                   AS pedidos,
              COALESCE(SUM(v.valor_pedido), 0)                                  AS total_vendido,
              COALESCE(AVG(v.valor_pedido) FILTER (WHERE v.hubo_pedido = true), 0) AS promedio_pedido,
              ROUND(
                COUNT(v.id) FILTER (WHERE v.hubo_pedido = true)::numeric
                / NULLIF(COUNT(v.id), 0) * 100, 1
              )                                                                 AS tasa_conversion_pct
            FROM asesores a
            LEFT JOIN visitas v
              ON a.id = v.asesor_id
              AND DATE(v.timestamp AT TIME ZONE 'America/Bogota')
                  BETWEEN ${fechaInicio}::date AND ${fechaFin}::date
            WHERE a.activo = true AND a.id = ${asesorId}
            GROUP BY a.id, a.nombre, a.zona
            ORDER BY total_vendido DESC
          `
        : await sql`
            SELECT
              a.id                                                              AS asesor_id,
              a.nombre                                                          AS asesor_nombre,
              a.zona,
              COUNT(v.id)                                                       AS total_visitas,
              COUNT(DISTINCT v.cliente_id)                                      AS clientes_unicos,
              COUNT(v.id) FILTER (WHERE v.validada = true)                      AS visitas_validadas,
              COUNT(v.id) FILTER (WHERE v.hubo_pedido = true)                   AS pedidos,
              COALESCE(SUM(v.valor_pedido), 0)                                  AS total_vendido,
              COALESCE(AVG(v.valor_pedido) FILTER (WHERE v.hubo_pedido = true), 0) AS promedio_pedido,
              ROUND(
                COUNT(v.id) FILTER (WHERE v.hubo_pedido = true)::numeric
                / NULLIF(COUNT(v.id), 0) * 100, 1
              )                                                                 AS tasa_conversion_pct
            FROM asesores a
            LEFT JOIN visitas v
              ON a.id = v.asesor_id
              AND DATE(v.timestamp AT TIME ZONE 'America/Bogota')
                  BETWEEN ${fechaInicio}::date AND ${fechaFin}::date
            WHERE a.activo = true
            GROUP BY a.id, a.nombre, a.zona
            ORDER BY total_vendido DESC
          `

      return NextResponse.json({
        success: true,
        tipo,
        periodo: { inicio: fechaInicio, fin: fechaFin },
        data: rows.map(r => ({
          asesor_id:         Number(r.asesor_id),
          asesor_nombre:     r.asesor_nombre,
          zona:              r.zona,
          total_visitas:     Number(r.total_visitas),
          clientes_unicos:   Number(r.clientes_unicos),
          visitas_validadas: Number(r.visitas_validadas),
          pedidos:           Number(r.pedidos),
          total_vendido:     Number(r.total_vendido),
          promedio_pedido:   Math.round(Number(r.promedio_pedido)),
          tasa_conversion:   Number(r.tasa_conversion_pct ?? 0),
        })),
      })
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TIPO: clientes_visitados
    // ──────────────────────────────────────────────────────────────────────────
    if (tipo === "clientes_visitados") {
      const rows = asesorId
        ? await sql`
            SELECT
              c.id, c.codigo, c.nombre AS cliente_nombre, c.direccion,
              a.id AS asesor_id, a.nombre AS asesor_nombre, a.zona,
              COUNT(v.id)                                                 AS veces_visitado,
              COUNT(v.id) FILTER (WHERE v.hubo_pedido = true)             AS veces_con_pedido,
              COALESCE(SUM(v.valor_pedido), 0)                            AS valor_total,
              MAX(DATE(v.timestamp AT TIME ZONE 'America/Bogota'))        AS ultima_visita,
              CASE
                WHEN COUNT(v.id) FILTER (WHERE v.hubo_pedido = true) > 0 THEN 'comprador'
                ELSE 'visitado_sin_compra'
              END AS estado
            FROM clientes c
            LEFT JOIN asesores a ON c.asesor_id = a.id
            JOIN visitas v
              ON c.id = v.cliente_id
              AND DATE(v.timestamp AT TIME ZONE 'America/Bogota')
                  BETWEEN ${fechaInicio}::date AND ${fechaFin}::date
            WHERE c.activo = true AND c.asesor_id = ${asesorId}
            GROUP BY c.id, c.codigo, c.nombre, c.direccion, a.id, a.nombre, a.zona
            ORDER BY valor_total DESC, veces_visitado DESC
          `
        : await sql`
            SELECT
              c.id, c.codigo, c.nombre AS cliente_nombre, c.direccion,
              a.id AS asesor_id, a.nombre AS asesor_nombre, a.zona,
              COUNT(v.id)                                                 AS veces_visitado,
              COUNT(v.id) FILTER (WHERE v.hubo_pedido = true)             AS veces_con_pedido,
              COALESCE(SUM(v.valor_pedido), 0)                            AS valor_total,
              MAX(DATE(v.timestamp AT TIME ZONE 'America/Bogota'))        AS ultima_visita,
              CASE
                WHEN COUNT(v.id) FILTER (WHERE v.hubo_pedido = true) > 0 THEN 'comprador'
                ELSE 'visitado_sin_compra'
              END AS estado
            FROM clientes c
            LEFT JOIN asesores a ON c.asesor_id = a.id
            JOIN visitas v
              ON c.id = v.cliente_id
              AND DATE(v.timestamp AT TIME ZONE 'America/Bogota')
                  BETWEEN ${fechaInicio}::date AND ${fechaFin}::date
            WHERE c.activo = true
            GROUP BY c.id, c.codigo, c.nombre, c.direccion, a.id, a.nombre, a.zona
            ORDER BY valor_total DESC, veces_visitado DESC
          `

      return NextResponse.json({
        success: true,
        tipo,
        periodo: { inicio: fechaInicio, fin: fechaFin },
        data: rows.map(r => ({
          cliente_id:       Number(r.id),
          codigo:           r.codigo,
          cliente_nombre:   r.cliente_nombre,
          direccion:        r.direccion,
          asesor_id:        Number(r.asesor_id),
          asesor_nombre:    r.asesor_nombre,
          zona:             r.zona,
          veces_visitado:   Number(r.veces_visitado),
          veces_con_pedido: Number(r.veces_con_pedido),
          valor_total:      Number(r.valor_total),
          ultima_visita:    r.ultima_visita,
          estado:           r.estado,
        })),
      })
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TIPO: no_visitados — clientes sin visita en el periodo
    // ──────────────────────────────────────────────────────────────────────────
    if (tipo === "no_visitados") {
      const rows = asesorId
        ? await sql`
            SELECT
              c.id, c.codigo, c.nombre AS cliente_nombre, c.direccion,
              a.id AS asesor_id, a.nombre AS asesor_nombre, a.zona,
              c.created_at AS cliente_desde,
              (SELECT MAX(DATE(v2.timestamp AT TIME ZONE 'America/Bogota'))
               FROM visitas v2 WHERE v2.cliente_id = c.id) AS ultima_visita_historica,
              CURRENT_DATE - (
                SELECT MAX(DATE(v2.timestamp AT TIME ZONE 'America/Bogota'))
                FROM visitas v2 WHERE v2.cliente_id = c.id
              ) AS dias_sin_visita
            FROM clientes c
            LEFT JOIN asesores a ON c.asesor_id = a.id
            WHERE c.activo = true
              AND c.asesor_id = ${asesorId}
              AND c.id NOT IN (
                SELECT DISTINCT v.cliente_id FROM visitas v
                WHERE DATE(v.timestamp AT TIME ZONE 'America/Bogota')
                      BETWEEN ${fechaInicio}::date AND ${fechaFin}::date
              )
            ORDER BY dias_sin_visita DESC NULLS LAST
          `
        : await sql`
            SELECT
              c.id, c.codigo, c.nombre AS cliente_nombre, c.direccion,
              a.id AS asesor_id, a.nombre AS asesor_nombre, a.zona,
              c.created_at AS cliente_desde,
              (SELECT MAX(DATE(v2.timestamp AT TIME ZONE 'America/Bogota'))
               FROM visitas v2 WHERE v2.cliente_id = c.id) AS ultima_visita_historica,
              CURRENT_DATE - (
                SELECT MAX(DATE(v2.timestamp AT TIME ZONE 'America/Bogota'))
                FROM visitas v2 WHERE v2.cliente_id = c.id
              ) AS dias_sin_visita
            FROM clientes c
            LEFT JOIN asesores a ON c.asesor_id = a.id
            WHERE c.activo = true
              AND c.id NOT IN (
                SELECT DISTINCT v.cliente_id FROM visitas v
                WHERE DATE(v.timestamp AT TIME ZONE 'America/Bogota')
                      BETWEEN ${fechaInicio}::date AND ${fechaFin}::date
              )
            ORDER BY dias_sin_visita DESC NULLS LAST
          `

      return NextResponse.json({
        success: true,
        tipo,
        periodo: { inicio: fechaInicio, fin: fechaFin },
        data: rows.map(r => ({
          cliente_id:              Number(r.id),
          codigo:                  r.codigo,
          cliente_nombre:          r.cliente_nombre,
          direccion:               r.direccion,
          asesor_id:               Number(r.asesor_id),
          asesor_nombre:           r.asesor_nombre,
          zona:                    r.zona,
          ultima_visita_historica: r.ultima_visita_historica ?? null,
          dias_sin_visita:         r.dias_sin_visita !== null ? Number(r.dias_sin_visita) : null,
        })),
      })
    }

    return NextResponse.json({ error: `tipo '${tipo}' no reconocido` }, { status: 400 })

  } catch (error) {
    console.error("❌ Error en GET /api/admin/informes:", error)
    const msg = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: "Error interno", details: msg }, { status: 500 })
  }
}
