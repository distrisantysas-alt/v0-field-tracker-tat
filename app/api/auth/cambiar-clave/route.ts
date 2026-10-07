// ============================================================================
// app/api/auth/cambiar-clave/route.ts
// POST → el propio usuario cambia (o crea por primera vez) su clave.
// Si ya tiene clave, debe enviar la actual.
// ============================================================================
import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireSesion } from '@/lib/auth'
import { claveValida, hashClave, verificarClave, CLAVE_MIN } from '@/lib/clave'

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSesion(req)
    if (auth instanceof NextResponse) return auth

    const { clave_actual, clave_nueva } = await req.json()
    if (!claveValida(clave_nueva)) {
      return NextResponse.json({ error: `La clave nueva debe tener al menos ${CLAVE_MIN} caracteres` }, { status: 400 })
    }

    const filas = await sql`SELECT clave_hash FROM asesores WHERE id = ${auth.asesorId}::uuid AND activo = true`
    if (filas.length === 0) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

    if (filas[0].clave_hash) {
      if (typeof clave_actual !== 'string' || !(await verificarClave(clave_actual, filas[0].clave_hash))) {
        return NextResponse.json({ error: 'La clave actual no es correcta' }, { status: 401 })
      }
    }

    await sql`
      UPDATE asesores
      SET clave_hash = ${await hashClave(clave_nueva)}, clave_temporal = false,
          clave_actualizada_en = now(), intentos_fallidos = 0, bloqueado_hasta = NULL
      WHERE id = ${auth.asesorId}::uuid
    `
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error en cambiar-clave:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
