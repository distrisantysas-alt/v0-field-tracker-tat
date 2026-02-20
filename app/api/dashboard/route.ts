// ============================================================================
// app/api/dashboard/route.ts
// ============================================================================
// Métricas generales del día para Gerencia y Supervisor
// GET /api/dashboard?fecha=2026-02-19
// GET /api/dashboard?zona=Centro&fecha=2026-02-19  (filtra por zona)
// ============================================================================

import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

function fechaColombia(): string {
  return new Date().toLocaleString('en-CA', {
    timeZone: 'America/Bogota'
  }).split(',')[0];
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fecha = searchParams.get('fecha') || fechaColombia();
    const zona = searchParams.get('zona') || null;

    // ── Métricas por asesor ──────────────────────────────────────────
    const equipoRows = zona
      ? await sql`
          SELECT
            a.id,
            a.nombre,
            a.zona,
            a.activo,
            COUNT(DISTINCT r.cliente_id)                                    AS clientes_asignados,
            COUNT(DISTINCT v.id)                                            AS visitas_hoy,
            COUNT(DISTINCT v.id) FILTER (WHERE v.validada = true)           AS validadas,
            COUNT(DISTINCT v.id) FILTER (WHERE v.validada = false
              AND v.id IS NOT NULL)                                         AS sospechosas,
            MAX(v.timestamp)                                                AS ultima_visita,
            COALESCE(SUM(v.valor_pedido) FILTER (WHERE v.hubo_pedido), 0)  AS vendido_hoy,
            COUNT(DISTINCT v.id) FILTER (WHERE v.hubo_pedido = true)       AS pedidos_hoy
          FROM asesores a
          LEFT JOIN rutas_dia r ON r.asesor_id = a.id AND r.fecha = ${fecha}::date
          LEFT JOIN visitas v   ON v.asesor_id = a.id
            AND DATE(v.timestamp AT TIME ZONE 'America/Bogota') = ${fecha}::date
          WHERE a.activo = true AND a.zona = ${zona}
          GROUP BY a.id, a.nombre, a.zona, a.activo
          ORDER BY visitas_hoy DESC NULLS LAST
        `
      : await sql`
          SELECT
            a.id,
            a.nombre,
            a.zona,
            a.activo,
            COUNT(DISTINCT r.cliente_id)                                    AS clientes_asignados,
            COUNT(DISTINCT v.id)                                            AS visitas_hoy,
            COUNT(DISTINCT v.id) FILTER (WHERE v.validada = true)           AS validadas,
            COUNT(DISTINCT v.id) FILTER (WHERE v.validada = false
              AND v.id IS NOT NULL)                                         AS sospechosas,
            MAX(v.timestamp)                                                AS ultima_visita,
            COALESCE(SUM(v.valor_pedido) FILTER (WHERE v.hubo_pedido), 0)  AS vendido_hoy,
            COUNT(DISTINCT v.id) FILTER (WHERE v.hubo_pedido = true)       AS pedidos_hoy
          FROM asesores a
          LEFT JOIN rutas_dia r ON r.asesor_id = a.id AND r.fecha = ${fecha}::date
          LEFT JOIN visitas v   ON v.asesor_id = a.id
            AND DATE(v.timestamp AT TIME ZONE 'America/Bogota') = ${fecha}::date
          WHERE a.activo = true
          GROUP BY a.id, a.nombre, a.zona, a.activo
          ORDER BY visitas_hoy DESC NULLS LAST
        `;

    // ── Totales generales ────────────────────────────────────────────
    const totalAsesores = equipoRows.length;
    const asesoresConActividad = equipoRows.filter(a => Number(a.visitas_hoy) > 0).length;
    const visitasTotales = equipoRows.reduce((s, a) => s + Number(a.visitas_hoy), 0);
    const validadasTotal = equipoRows.reduce((s, a) => s + Number(a.validadas), 0);
    const sospechosasTotal = equipoRows.reduce((s, a) => s + Number(a.sospechosas), 0);
    const vendidoTotal = equipoRows.reduce((s, a) => s + Number(a.vendido_hoy), 0);
    const pedidosTotal = equipoRows.reduce((s, a) => s + Number(a.pedidos_hoy), 0);
    const clientesAsignados = equipoRows.reduce((s, a) => s + Number(a.clientes_asignados), 0);
    const cumplimientoGlobal = clientesAsignados > 0
      ? Math.round((visitasTotales / clientesAsignados) * 100)
      : 0;

    // ── Alertas (visitas sospechosas del día) ────────────────────────
    const alertas = await sql`
      SELECT
        v.id,
        v.timestamp,
        v.distancia_metros,
        a.nombre AS asesor_nombre,
        c.nombre AS cliente_nombre,
        c.direccion AS cliente_direccion
      FROM visitas v
      JOIN asesores a ON v.asesor_id = a.id
      JOIN clientes c ON v.cliente_id = c.id
      WHERE v.validada = false
        AND DATE(v.timestamp AT TIME ZONE 'America/Bogota') = ${fecha}::date
        ${zona ? sql`AND a.zona = ${zona}` : sql``}
      ORDER BY v.timestamp DESC
      LIMIT 20
    `;

    // ── Por zona ─────────────────────────────────────────────────────
    const zonasMap: Record<string, {
      zona: string; asesores: number; visitas: number;
      clientes: number; cumplimiento: number;
    }> = {};

    for (const a of equipoRows) {
      const z = a.zona || 'Sin zona';
      if (!zonasMap[z]) {
        zonasMap[z] = { zona: z, asesores: 0, visitas: 0, clientes: 0, cumplimiento: 0 };
      }
      zonasMap[z].asesores++;
      zonasMap[z].visitas += Number(a.visitas_hoy);
      zonasMap[z].clientes += Number(a.clientes_asignados);
    }

    const porZona = Object.values(zonasMap).map(z => ({
      ...z,
      cumplimiento: z.clientes > 0 ? Math.round((z.visitas / z.clientes) * 100) : 0,
    })).sort((a, b) => a.cumplimiento - b.cumplimiento);

    return NextResponse.json({
      success: true,
      fecha,
      totales: {
        asesores: totalAsesores,
        asesores_activos: asesoresConActividad,
        visitas: visitasTotales,
        validadas: validadasTotal,
        sospechosas: sospechosasTotal,
        pedidos: pedidosTotal,
        vendido: vendidoTotal,
        vendido_formato: `$${Math.round(vendidoTotal).toLocaleString('es-CO')}`,
        clientes_asignados: clientesAsignados,
        cumplimiento: cumplimientoGlobal,
      },
      equipo: equipoRows.map(a => {
        const asignados = Number(a.clientes_asignados);
        const visitas = Number(a.visitas_hoy);
        return {
          id: a.id,
          nombre: a.nombre,
          zona: a.zona,
          activo: a.activo,
          clientes_asignados: asignados,
          visitas_hoy: visitas,
          validadas: Number(a.validadas),
          sospechosas: Number(a.sospechosas),
          pedidos_hoy: Number(a.pedidos_hoy),
          vendido_hoy: Number(a.vendido_hoy),
          vendido_formato: `$${Math.round(Number(a.vendido_hoy)).toLocaleString('es-CO')}`,
          ultima_visita: a.ultima_visita,
          cumplimiento: asignados > 0 ? Math.round((visitas / asignados) * 100) : 0,
        };
      }),
      alertas: alertas.map(al => ({
        id: al.id,
        hora: new Date(al.timestamp).toLocaleTimeString('es-CO', {
          hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota'
        }),
        asesor: al.asesor_nombre,
        cliente: al.cliente_nombre,
        direccion: al.cliente_direccion,
        distancia_metros: Math.round(Number(al.distancia_metros || 0)),
      })),
      por_zona: porZona,
    });

  } catch (error) {
    console.error('❌ Error en GET /api/dashboard:', error);
    return NextResponse.json(
      { error: 'Error interno', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
