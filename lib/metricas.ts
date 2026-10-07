// ============================================================================
// lib/metricas.ts - Metricas mensuales por asesor (visitas, pedidos, activaciones,
// cobertura, presupuesto...) que alimentan los incentivos. Solo lectura.
// Si un dato no existe (presupuesto sin cargar, devoluciones del POS sin cargar)
// la metrica queda sin definir en vez de inventar un cero: asi nadie cobra ni
// pierde un incentivo por un dato que simplemente falta.
// ============================================================================
import { sql } from '@/lib/db'
import { diasLaborablesMes } from '@/lib/festivos'
import type { Metricas } from '@/lib/incentivos'

export const DIAS_SIN_COMPRAR_ACTIVACION = 60

export interface AsesorMes {
  asesor_id: string
  nombre: string
  zona: string | null
  metricas: Metricas
  presupuesto: number | null
  dias_laborables: number
  dias_definidos: boolean       // false: se uso el calendario (lun-sab sin festivos)
  dias_con_visitas: number
  devoluciones: number
  clientes_asignados: number
  clientes_visitados: number
}

export interface DatosMes {
  mes: string
  inicio: string
  fin: string
  dias_calendario: number
  festivos: { fecha: string; nombre: string }[]
  devoluciones_cargadas: boolean
  asesores: AsesorMes[]
}

export function validarMes(mes: unknown): mes is string {
  return typeof mes === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes)
}

export function mesActualBogota(): string {
  return new Date().toLocaleString('en-CA', { timeZone: 'America/Bogota' }).split(',')[0].slice(0, 7)
}

export async function datosDelMes(mes: string, diasSinComprar = DIAS_SIN_COMPRAR_ACTIVACION): Promise<DatosMes> {
  const cal = diasLaborablesMes(mes)
  const { inicio, fin } = cal

  const asesores = await sql`
    SELECT id, nombre, zona FROM asesores WHERE rol = 'asesor' AND activo = true ORDER BY nombre
  `
  const visitas = await sql`
    SELECT v.asesor_id,
           COUNT(*)::int AS visitas,
           COUNT(*) FILTER (WHERE v.hubo_pedido = true)::int AS pedidos,
           COALESCE(SUM(v.valor_pedido) FILTER (WHERE v.hubo_pedido = true), 0)::float8 AS ventas,
           COUNT(DISTINCT DATE(v.timestamp AT TIME ZONE 'America/Bogota'))::int AS dias_con_visitas,
           COUNT(DISTINCT v.cliente_id)::int AS clientes_visitados
    FROM visitas v
    WHERE DATE(v.timestamp AT TIME ZONE 'America/Bogota') BETWEEN ${inicio}::date AND ${fin}::date
    GROUP BY v.asesor_id
  `
  const devol = await sql`
    SELECT asesor_id, COUNT(*)::int AS cantidad, COALESCE(SUM(valor), 0)::float8 AS valor
    FROM devoluciones_pos
    WHERE fecha BETWEEN ${inicio}::date AND ${fin}::date AND asesor_id IS NOT NULL
    GROUP BY asesor_id
  `
  const cargadas = await sql`
    SELECT COUNT(*)::int AS n FROM devoluciones_pos WHERE fecha BETWEEN ${inicio}::date AND ${fin}::date
  `
  const presup = await sql`SELECT asesor_id, monto::float8 AS monto FROM presupuestos WHERE mes = ${mes}`
  const dias = await sql`SELECT asesor_id, dias FROM dias_laborables WHERE mes = ${mes}`
  const asignados = await sql`
    SELECT asesor_id, COUNT(*)::int AS n FROM clientes WHERE activo = true AND asesor_id IS NOT NULL GROUP BY asesor_id
  `
  const activ = await sql`
    WITH pedidos_mes AS (
      SELECT v.asesor_id, v.cliente_id, MIN(v.timestamp) AS primera
      FROM visitas v
      WHERE v.hubo_pedido = true
        AND DATE(v.timestamp AT TIME ZONE 'America/Bogota') BETWEEN ${inicio}::date AND ${fin}::date
      GROUP BY v.asesor_id, v.cliente_id
    )
    SELECT p.asesor_id, COUNT(*)::int AS n
    FROM pedidos_mes p
    WHERE NOT EXISTS (
      SELECT 1 FROM visitas x
      WHERE x.cliente_id = p.cliente_id AND x.hubo_pedido = true
        AND x.timestamp < p.primera
        AND x.timestamp >= p.primera - make_interval(days => ${diasSinComprar}::int)
    )
    GROUP BY p.asesor_id
  `

  const por = <T extends { asesor_id: string }>(filas: T[]) => new Map(filas.map(f => [f.asesor_id, f]))
  const mVis = por(visitas as any[]), mDev = por(devol as any[]), mPre = por(presup as any[])
  const mDias = por(dias as any[]), mAsig = por(asignados as any[]), mAct = por(activ as any[])
  const devCargadas = ((cargadas as any[])[0]?.n ?? 0) > 0

  const resultado: AsesorMes[] = (asesores as any[]).map(a => {
    const v: any = mVis.get(a.id) ?? { visitas: 0, pedidos: 0, ventas: 0, dias_con_visitas: 0, clientes_visitados: 0 }
    const dv: any = mDev.get(a.id) ?? { cantidad: 0, valor: 0 }
    const pre: any = mPre.get(a.id)
    const dd: any = mDias.get(a.id)
    const asig = (mAsig.get(a.id) as any)?.n ?? 0
    const diasLab = dd?.dias ?? cal.laborables
    const presupuesto = pre ? Number(pre.monto) : null

    const m: Metricas = {
      visitas: v.visitas,
      pedidos: v.pedidos,
      ventas: v.ventas,
      visitas_dia: diasLab > 0 ? v.visitas / diasLab : 0,
      efectividad_bruta: v.visitas > 0 ? (v.pedidos / v.visitas) * 100 : 0,
      ticket_promedio: v.pedidos > 0 ? v.ventas / v.pedidos : 0,
      activaciones: (mAct.get(a.id) as any)?.n ?? 0,
    }
    if (devCargadas) m.efectividad_neta = v.visitas > 0 ? (Math.max(0, v.pedidos - dv.cantidad) / v.visitas) * 100 : 0
    if (asig > 0) m.cobertura_pct = (v.clientes_visitados / asig) * 100
    if (presupuesto && presupuesto > 0) {
      const ventaNeta = devCargadas ? v.ventas + dv.valor : v.ventas   // dv.valor viene negativo del POS
      m.cumplimiento_presupuesto_pct = (ventaNeta / presupuesto) * 100
    }
    return {
      asesor_id: a.id, nombre: a.nombre, zona: a.zona, metricas: m, presupuesto,
      dias_laborables: diasLab, dias_definidos: !!dd, dias_con_visitas: v.dias_con_visitas,
      devoluciones: dv.cantidad, clientes_asignados: asig, clientes_visitados: v.clientes_visitados,
    }
  })

  return { mes, inicio, fin, dias_calendario: cal.laborables, festivos: cal.festivos, devoluciones_cargadas: devCargadas, asesores: resultado }
}
