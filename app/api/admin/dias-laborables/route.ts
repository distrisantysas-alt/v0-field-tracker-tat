// ============================================================================
// app/api/admin/dias-laborables/route.ts
// PUT → fija los dias laborables de un asesor en un mes (AAAA-MM). Con dias = null
// borra el valor y el reporte vuelve a usar los dias con visitas.
// Lo usa el reporte de bono: promedio = visitas del mes / dias laborables.
// ============================================================================
import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireSesion } from '@/lib/auth'

const MES = /^\d{4}-(0[1-9]|1[0-2])$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireSesion(req, ['supervisor', 'gerencia'])
    if (auth instanceof NextResponse) return auth

    const { asesor_id, mes, dias } = await req.json()
    if (typeof asesor_id !== 'string' || !UUID.test(asesor_id) || typeof mes !== 'string' || !MES.test(mes)) {
      return NextResponse.json({ error: 'asesor_id y mes (AAAA-MM) válidos son requeridos' }, { status: 400 })
    }

    // Un mes cerrado en Incentivos esta congelado: sus dias no se tocan (hay que reabrirlo)
    const cerrado = await sql`SELECT 1 FROM incentivo_cierres WHERE mes = ${mes}`.catch(() => [])
    if (cerrado.length > 0) {
      return NextResponse.json({ error: 'Ese mes está cerrado en Incentivos. Reábrelo para cambiar los días laborables.' }, { status: 409 })
    }

    if (dias === null) {
      await sql`DELETE FROM dias_laborables WHERE asesor_id = ${asesor_id}::uuid AND mes = ${mes}`
      return NextResponse.json({ success: true, dias: null })
    }

    const n = Number(dias)
    if (!Number.isInteger(n) || n < 1 || n > 31) {
      return NextResponse.json({ error: 'Los días laborables deben ser un número entero entre 1 y 31' }, { status: 400 })
    }

    await sql`
      INSERT INTO dias_laborables (asesor_id, mes, dias, actualizado_por)
      VALUES (${asesor_id}::uuid, ${mes}, ${n}, ${auth.asesorId}::uuid)
      ON CONFLICT (asesor_id, mes)
      DO UPDATE SET dias = EXCLUDED.dias, actualizado_en = now(), actualizado_por = EXCLUDED.actualizado_por
    `
    return NextResponse.json({ success: true, dias: n })
  } catch (error) {
    console.error('❌ Error en PUT /api/admin/dias-laborables:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: 'Error interno', details: msg }, { status: 500 })
  }
}
