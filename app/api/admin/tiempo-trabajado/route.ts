// ============================================================================
// app/api/admin/tiempo-trabajado/route.ts
// Tiempo trabajado por asesor segun la primera y la ultima gestion de cada dia.
//   GET ?periodo=dia|semana|mes&fecha=AAAA-MM-DD  → solo admin maestro
// La pausa mas larga (mayor rato entre dos gestiones seguidas) va aparte y no
// se descuenta de la jornada.
// ============================================================================
import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { exigirMaestro } from '@/lib/admin-auth'
import { rangoPeriodo, resumirPorAsesor, validarFecha, type DiaTrabajado, type Periodo } from '@/lib/tiempo-trabajado'

const PERIODOS: Periodo[] = ['dia', 'semana', 'mes']

export async function GET(req: NextRequest) {
  try {
    const maestro = await exigirMaestro(req)
    if (maestro instanceof NextResponse) return maestro

    const params = new URL(req.url).searchParams
    const periodo = (params.get('periodo') ?? 'dia') as Periodo
    const fecha = params.get('fecha') ?? new Date().toLocaleString('en-CA', { timeZone: 'America/Bogota' }).split(',')[0]
    if (!PERIODOS.includes(periodo)) return NextResponse.json({ error: 'periodo inválido (dia, semana o mes)' }, { status: 400 })
    if (!validarFecha(fecha)) return NextResponse.json({ error: 'fecha inválida (AAAA-MM-DD)' }, { status: 400 })

    const { desde, hasta } = rangoPeriodo(periodo, fecha)

    const filas = await sql`
      WITH v AS (
        SELECT v.asesor_id, v.timestamp AT TIME ZONE 'America/Bogota' AS t
        FROM visitas v
        WHERE (v.timestamp AT TIME ZONE 'America/Bogota')::date BETWEEN ${desde}::date AND ${hasta}::date
      ),
      g AS (
        SELECT asesor_id, t::date AS fecha, t,
               t - LAG(t) OVER (PARTITION BY asesor_id, t::date ORDER BY t) AS hueco
        FROM v
      )
      SELECT g.asesor_id, a.nombre, to_char(g.fecha, 'YYYY-MM-DD') AS fecha,
             (EXTRACT(EPOCH FROM MIN(g.t)::time) / 60)::float8 AS inicio_min,
             (EXTRACT(EPOCH FROM MAX(g.t)::time) / 60)::float8 AS fin_min,
             COUNT(*)::int AS visitas,
             COALESCE(EXTRACT(EPOCH FROM MAX(g.hueco)) / 60, 0)::float8 AS pausa_min,
             (EXTRACT(EPOCH FROM ((ARRAY_AGG(g.t - g.hueco ORDER BY g.hueco DESC NULLS LAST))[1])::time) / 60)::float8 AS pausa_desde_min
      FROM g JOIN asesores a ON a.id = g.asesor_id
      GROUP BY g.asesor_id, a.nombre, g.fecha
      ORDER BY a.nombre, g.fecha
    ` as DiaTrabajado[]

    return NextResponse.json({ periodo, fecha, desde, hasta, asesores: resumirPorAsesor(filas) })
  } catch (e) {
    console.error('Error en tiempo-trabajado:', e)
    return NextResponse.json({ error: 'No se pudo calcular el tiempo trabajado' }, { status: 500 })
  }
}
