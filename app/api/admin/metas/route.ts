// ============================================================================
// app/api/admin/metas/route.ts
// Presupuesto y dias laborables por asesor y mes.
//   GET ?mes=AAAA-MM  → supervisor y gerencia (lectura)
//   PUT               → solo admin maestro; un mes cerrado no se puede modificar
//     { asesor_id, mes, presupuesto?: number|null, dias?: number|null }
//     { accion: 'aplicar_calendario', mes }  → pone a todos los asesores activos
//       los dias del calendario (lunes a sabado sin festivos) donde no haya dato
// ============================================================================
import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireSesion } from '@/lib/auth'
import { exigirMaestro, auditar, UUID } from '@/lib/admin-auth'
import { diasLaborablesMes } from '@/lib/festivos'
import { validarMes, mesActualBogota } from '@/lib/metricas'

async function mesCerrado(mes: string): Promise<boolean> {
  const f = await sql`SELECT 1 FROM incentivo_cierres WHERE mes = ${mes}`
  return f.length > 0
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSesion(req, ['supervisor', 'gerencia'])
    if (auth instanceof NextResponse) return auth

    const mes = new URL(req.url).searchParams.get('mes') ?? mesActualBogota()
    if (!validarMes(mes)) return NextResponse.json({ error: 'mes inválido (AAAA-MM)' }, { status: 400 })

    const cal = diasLaborablesMes(mes)
    const filas = await sql`
      SELECT a.id AS asesor_id, a.nombre, a.zona,
             p.monto::float8 AS presupuesto,
             d.dias AS dias_laborables,
             (SELECT COUNT(DISTINCT DATE(v.timestamp AT TIME ZONE 'America/Bogota'))::int FROM visitas v
               WHERE v.asesor_id = a.id
                 AND DATE(v.timestamp AT TIME ZONE 'America/Bogota') BETWEEN ${cal.inicio}::date AND ${cal.fin}::date) AS dias_con_visitas
      FROM asesores a
      LEFT JOIN presupuestos p ON p.asesor_id = a.id AND p.mes = ${mes}
      LEFT JOIN dias_laborables d ON d.asesor_id = a.id AND d.mes = ${mes}
      WHERE a.rol = 'asesor' AND a.activo = true
      ORDER BY a.nombre
    `
    const total = (filas as any[]).reduce((s, f) => s + (f.presupuesto ?? 0), 0)
    return NextResponse.json({
      success: true, mes, cerrado: await mesCerrado(mes),
      calendario: { laborables: cal.laborables, festivos: cal.festivos, inicio: cal.inicio, fin: cal.fin },
      total_presupuesto: total,
      asesores: filas,
    })
  } catch (error) {
    console.error('❌ Error en GET /api/admin/metas:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const m = await exigirMaestro(req)
    if (m instanceof NextResponse) return m

    const body = await req.json()
    if (!validarMes(body.mes)) return NextResponse.json({ error: 'mes inválido (AAAA-MM)' }, { status: 400 })
    const mes: string = body.mes
    if (await mesCerrado(mes)) {
      return NextResponse.json({ error: 'Ese mes ya está cerrado. Reábrelo en Incentivos para modificarlo.' }, { status: 409 })
    }

    if (body.accion === 'aplicar_calendario') {
      const dias = diasLaborablesMes(mes).laborables
      const r = await sql`
        INSERT INTO dias_laborables (asesor_id, mes, dias, actualizado_por)
        SELECT a.id, ${mes}, ${dias}::int, ${m.asesorId}::uuid FROM asesores a
        WHERE a.rol = 'asesor' AND a.activo = true
        ON CONFLICT (asesor_id, mes) DO NOTHING
        RETURNING asesor_id
      `
      await auditar(m, 'aplicar_calendario', null, { mes, dias, asesores: r.length })
      return NextResponse.json({ success: true, dias, aplicados: r.length })
    }

    if (typeof body.asesor_id !== 'string' || !UUID.test(body.asesor_id)) {
      return NextResponse.json({ error: 'asesor_id inválido' }, { status: 400 })
    }
    const existe = await sql`SELECT 1 FROM asesores WHERE id = ${body.asesor_id}::uuid AND rol = 'asesor'`
    if (existe.length === 0) return NextResponse.json({ error: 'Asesor no encontrado' }, { status: 404 })

    const cambios: Record<string, unknown> = { mes }
    if (body.presupuesto !== undefined) {
      if (body.presupuesto === null) {
        await sql`DELETE FROM presupuestos WHERE asesor_id = ${body.asesor_id}::uuid AND mes = ${mes}`
      } else {
        const monto = Number(body.presupuesto)
        if (!Number.isFinite(monto) || monto < 0 || monto > 1e12) {
          return NextResponse.json({ error: 'El presupuesto debe ser un valor en pesos entre 0 y un billón' }, { status: 400 })
        }
        await sql`
          INSERT INTO presupuestos (asesor_id, mes, monto, actualizado_por)
          VALUES (${body.asesor_id}::uuid, ${mes}, ${monto}, ${m.asesorId}::uuid)
          ON CONFLICT (asesor_id, mes) DO UPDATE SET monto = EXCLUDED.monto, actualizado_en = now(), actualizado_por = EXCLUDED.actualizado_por
        `
      }
      cambios.presupuesto = body.presupuesto
    }
    if (body.dias !== undefined) {
      if (body.dias === null) {
        await sql`DELETE FROM dias_laborables WHERE asesor_id = ${body.asesor_id}::uuid AND mes = ${mes}`
      } else {
        const n = Number(body.dias)
        if (!Number.isInteger(n) || n < 1 || n > 31) {
          return NextResponse.json({ error: 'Los días laborables deben ser un entero entre 1 y 31' }, { status: 400 })
        }
        await sql`
          INSERT INTO dias_laborables (asesor_id, mes, dias, actualizado_por)
          VALUES (${body.asesor_id}::uuid, ${mes}, ${n}, ${m.asesorId}::uuid)
          ON CONFLICT (asesor_id, mes) DO UPDATE SET dias = EXCLUDED.dias, actualizado_en = now(), actualizado_por = EXCLUDED.actualizado_por
        `
      }
      cambios.dias = body.dias
    }
    if (Object.keys(cambios).length === 1) return NextResponse.json({ error: 'No hay cambios para guardar' }, { status: 400 })
    await auditar(m, 'editar_metas', body.asesor_id, cambios)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('❌ Error en PUT /api/admin/metas:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
