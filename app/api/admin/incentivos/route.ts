// ============================================================================
// app/api/admin/incentivos/route.ts
//   GET ?mes=AAAA-MM  → supervisor y gerencia: reglas y resultado por asesor
//                       (si el mes esta cerrado, devuelve lo congelado al cierre)
//   POST              → admin maestro:
//       { accion:'crear_regla', nombre, plantilla, modo, definicion, vigente_desde?, vigente_hasta? }
//       { accion:'cerrar_mes', mes }   congela resultados (solo meses ya terminados)
//       { accion:'reabrir_mes', mes }  descongela (queda en la bitacora)
//   PATCH             → admin maestro: { id, nombre?, definicion?, activa?, vigente_desde?, vigente_hasta? }
// No hay borrado: una regla se desactiva, y los meses cerrados guardan su propia copia.
// ============================================================================
import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireSesion } from '@/lib/auth'
import { exigirMaestro, auditar, UUID } from '@/lib/admin-auth'
import { datosDelMes, validarMes, mesActualBogota } from '@/lib/metricas'
import { evaluarRegla, validarDefinicion, type Regla } from '@/lib/incentivos'

const FECHA = /^\d{4}-\d{2}-\d{2}$/
const PLANTILLAS = ['eficiencia', 'activacion', 'presupuesto', 'cobertura', 'personalizada']

function hoyBogota(): string {
  return new Date().toLocaleString('en-CA', { timeZone: 'America/Bogota' }).split(',')[0]
}

async function reglasDelMes(inicio: string, fin: string): Promise<Regla[]> {
  const f = await sql`
    SELECT id, nombre, plantilla, modo, definicion, activa,
           vigente_desde::text AS vigente_desde, vigente_hasta::text AS vigente_hasta
    FROM incentivo_reglas
    WHERE activa = true AND vigente_desde <= ${fin}::date AND (vigente_hasta IS NULL OR vigente_hasta >= ${inicio}::date)
    ORDER BY creado_en
  `
  return f as unknown as Regla[]
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSesion(req, ['supervisor', 'gerencia'])
    if (auth instanceof NextResponse) return auth

    const mes = new URL(req.url).searchParams.get('mes') ?? mesActualBogota()
    if (!validarMes(mes)) return NextResponse.json({ error: 'mes inválido (AAAA-MM)' }, { status: 400 })

    const todas = await sql`
      SELECT id, nombre, plantilla, modo, definicion, activa,
             vigente_desde::text AS vigente_desde, vigente_hasta::text AS vigente_hasta
      FROM incentivo_reglas ORDER BY activa DESC, creado_en
    `
    const cierre = await sql`SELECT cerrado_en, (SELECT nombre FROM asesores WHERE id = cerrado_por) AS cerrado_por FROM incentivo_cierres WHERE mes = ${mes}`
    const datos = await datosDelMes(mes)

    // Mes cerrado: se muestra lo que quedo congelado, no lo que daria hoy el calculo
    if (cierre.length > 0) {
      const congelados = await sql`
        SELECT r.regla_id, r.regla, r.asesor_id, r.metricas, r.nivel, r.monto::float8 AS monto, a.nombre, a.zona
        FROM incentivo_resultados r JOIN asesores a ON a.id = r.asesor_id
        WHERE r.mes = ${mes} ORDER BY a.nombre
      `
      const reglasCongeladas = new Map<string, any>()
      const filasMap = new Map<string, any>()
      for (const c of congelados as any[]) {
        reglasCongeladas.set(c.regla_id, c.regla)
        const fila = filasMap.get(c.asesor_id) ?? { asesor_id: c.asesor_id, nombre: c.nombre, zona: c.zona, metricas: c.metricas, resultados: [], total: 0 }
        fila.resultados.push({ regla_id: c.regla_id, monto: c.monto, nivel: c.nivel, falta: null, incompleto: false })
        fila.total += c.monto
        filasMap.set(c.asesor_id, fila)
      }
      const filas = [...filasMap.values()]
      return NextResponse.json({
        success: true, mes, cerrado: true, cierre: cierre[0], todas_las_reglas: todas,
        reglas: [...reglasCongeladas.values()], filas, total_mes: filas.reduce((s, f) => s + f.total, 0),
        datos: { inicio: datos.inicio, fin: datos.fin, dias_calendario: datos.dias_calendario, festivos: datos.festivos, devoluciones_cargadas: datos.devoluciones_cargadas },
      })
    }

    const reglas = await reglasDelMes(datos.inicio, datos.fin)
    const filas = datos.asesores.map(a => {
      const resultados = reglas.map(r => ({ regla_id: r.id, ...evaluarRegla(r, a.metricas) }))
      return {
        asesor_id: a.asesor_id, nombre: a.nombre, zona: a.zona, metricas: a.metricas,
        presupuesto: a.presupuesto, dias_laborables: a.dias_laborables, dias_definidos: a.dias_definidos,
        resultados, total: resultados.reduce((s, x) => s + x.monto, 0),
      }
    })
    return NextResponse.json({
      success: true, mes, cerrado: false, todas_las_reglas: todas, reglas, filas,
      total_mes: filas.reduce((s, f) => s + f.total, 0),
      datos: { inicio: datos.inicio, fin: datos.fin, dias_calendario: datos.dias_calendario, festivos: datos.festivos, devoluciones_cargadas: datos.devoluciones_cargadas },
    })
  } catch (error) {
    console.error('❌ Error en GET /api/admin/incentivos:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const m = await exigirMaestro(req)
    if (m instanceof NextResponse) return m
    const body = await req.json()

    if (body.accion === 'cerrar_mes' || body.accion === 'reabrir_mes') {
      if (!validarMes(body.mes)) return NextResponse.json({ error: 'mes inválido (AAAA-MM)' }, { status: 400 })
      const mes: string = body.mes
      const yaCerrado = (await sql`SELECT 1 FROM incentivo_cierres WHERE mes = ${mes}`).length > 0

      if (body.accion === 'reabrir_mes') {
        if (!yaCerrado) return NextResponse.json({ error: 'Ese mes no está cerrado' }, { status: 400 })
        await sql`DELETE FROM incentivo_cierres WHERE mes = ${mes}`   // borra los resultados congelados en cascada
        await auditar(m, 'reabrir_mes', null, { mes })
        return NextResponse.json({ success: true })
      }

      if (yaCerrado) return NextResponse.json({ error: 'Ese mes ya está cerrado' }, { status: 409 })
      const datos = await datosDelMes(mes)
      if (datos.fin >= hoyBogota()) {
        return NextResponse.json({ error: 'Solo se pueden cerrar meses que ya terminaron' }, { status: 400 })
      }
      const reglas = await reglasDelMes(datos.inicio, datos.fin)
      if (reglas.length === 0) return NextResponse.json({ error: 'No hay reglas activas en ese mes para congelar' }, { status: 400 })

      await sql`INSERT INTO incentivo_cierres (mes, cerrado_por) VALUES (${mes}, ${m.asesorId}::uuid)`
      let filas = 0, total = 0
      for (const a of datos.asesores) {
        for (const r of reglas) {
          const res = evaluarRegla(r, a.metricas)
          await sql`
            INSERT INTO incentivo_resultados (mes, regla_id, regla, asesor_id, metricas, nivel, monto)
            VALUES (${mes}, ${r.id}::uuid, ${JSON.stringify(r)}::jsonb, ${a.asesor_id}::uuid,
                    ${JSON.stringify({ ...a.metricas, dias_laborables: a.dias_laborables, presupuesto: a.presupuesto })}::jsonb,
                    ${res.nivel}, ${res.monto})
          `
          filas++; total += res.monto
        }
      }
      await auditar(m, 'cerrar_mes', null, { mes, resultados: filas, total })
      return NextResponse.json({ success: true, resultados: filas, total })
    }

    if (body.accion !== 'crear_regla') return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 })

    const nombre = typeof body.nombre === 'string' ? body.nombre.trim().slice(0, 100) : ''
    if (nombre.length < 3) return NextResponse.json({ error: 'Ponle un nombre a la regla' }, { status: 400 })
    if (!PLANTILLAS.includes(body.plantilla)) return NextResponse.json({ error: 'Plantilla desconocida' }, { status: 400 })
    const err = validarDefinicion(body.modo, body.definicion)
    if (err) return NextResponse.json({ error: err }, { status: 400 })
    const desde = typeof body.vigente_desde === 'string' && FECHA.test(body.vigente_desde) ? body.vigente_desde : hoyBogota().slice(0, 8) + '01'
    const hasta = typeof body.vigente_hasta === 'string' && FECHA.test(body.vigente_hasta) ? body.vigente_hasta : null
    if (hasta && hasta < desde) return NextResponse.json({ error: 'La fecha final es anterior a la inicial' }, { status: 400 })

    const r = await sql`
      INSERT INTO incentivo_reglas (nombre, plantilla, modo, definicion, vigente_desde, vigente_hasta, creado_por)
      VALUES (${nombre}, ${body.plantilla}, ${body.modo}, ${JSON.stringify(body.definicion)}::jsonb, ${desde}::date, ${hasta}::date, ${m.asesorId}::uuid)
      RETURNING id
    `
    await auditar(m, 'crear_regla', null, { regla: nombre, modo: body.modo })
    return NextResponse.json({ success: true, id: r[0].id })
  } catch (error) {
    console.error('❌ Error en POST /api/admin/incentivos:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const m = await exigirMaestro(req)
    if (m instanceof NextResponse) return m
    const body = await req.json()
    if (typeof body.id !== 'string' || !UUID.test(body.id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 })
    const f = await sql`SELECT modo FROM incentivo_reglas WHERE id = ${body.id}::uuid`
    if (f.length === 0) return NextResponse.json({ error: 'Regla no encontrada' }, { status: 404 })

    const cambios: Record<string, unknown> = {}
    if (body.nombre !== undefined) {
      const n = typeof body.nombre === 'string' ? body.nombre.trim().slice(0, 100) : ''
      if (n.length < 3) return NextResponse.json({ error: 'Ponle un nombre a la regla' }, { status: 400 })
      await sql`UPDATE incentivo_reglas SET nombre = ${n}, actualizado_en = now() WHERE id = ${body.id}::uuid`
      cambios.nombre = n
    }
    if (body.definicion !== undefined) {
      const err = validarDefinicion(f[0].modo, body.definicion)
      if (err) return NextResponse.json({ error: err }, { status: 400 })
      await sql`UPDATE incentivo_reglas SET definicion = ${JSON.stringify(body.definicion)}::jsonb, actualizado_en = now() WHERE id = ${body.id}::uuid`
      cambios.definicion = 'editada'
    }
    if (body.activa !== undefined) {
      if (typeof body.activa !== 'boolean') return NextResponse.json({ error: 'activa debe ser verdadero o falso' }, { status: 400 })
      await sql`UPDATE incentivo_reglas SET activa = ${body.activa}, actualizado_en = now() WHERE id = ${body.id}::uuid`
      cambios.activa = body.activa
    }
    for (const campo of ['vigente_desde', 'vigente_hasta'] as const) {
      if (body[campo] === undefined) continue
      if (body[campo] !== null && !(typeof body[campo] === 'string' && FECHA.test(body[campo]))) {
        return NextResponse.json({ error: `${campo} debe ser una fecha AAAA-MM-DD` }, { status: 400 })
      }
      if (campo === 'vigente_desde') {
        if (body.vigente_desde === null) return NextResponse.json({ error: 'La fecha inicial es obligatoria' }, { status: 400 })
        await sql`UPDATE incentivo_reglas SET vigente_desde = ${body.vigente_desde}::date, actualizado_en = now() WHERE id = ${body.id}::uuid`
      } else {
        await sql`UPDATE incentivo_reglas SET vigente_hasta = ${body.vigente_hasta}::date, actualizado_en = now() WHERE id = ${body.id}::uuid`
      }
      cambios[campo] = body[campo]
    }
    if (Object.keys(cambios).length === 0) return NextResponse.json({ error: 'No hay cambios para guardar' }, { status: 400 })
    await auditar(m, 'editar_regla', null, { id: body.id, ...cambios })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('❌ Error en PATCH /api/admin/incentivos:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
