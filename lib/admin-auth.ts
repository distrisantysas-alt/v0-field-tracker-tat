// ============================================================================
// lib/admin-auth.ts - Permisos del panel de administracion y bitacora de cambios
// El admin maestro es el unico usuario con es_admin_maestro = true (rol gerencia).
// ============================================================================
import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireSesion } from '@/lib/auth'

export type Maestro = { asesorId: string; nombre: string }

/** Exige sesion de gerencia Y que ese usuario siga siendo el admin maestro en la base. */
export async function exigirMaestro(req: NextRequest): Promise<Maestro | NextResponse> {
  const auth = await requireSesion(req, ['gerencia'])
  if (auth instanceof NextResponse) return auth
  const f = await sql`SELECT nombre FROM asesores WHERE id = ${auth.asesorId}::uuid AND es_admin_maestro = true AND activo = true`
  if (f.length === 0) {
    return NextResponse.json({ error: 'Solo el administrador maestro puede hacer esta acción' }, { status: 403 })
  }
  return { asesorId: auth.asesorId, nombre: f[0].nombre }
}

export async function auditar(actor: Maestro, accion: string, objetivoId: string | null, detalle: object) {
  await sql`
    INSERT INTO auditoria_admin (actor_id, actor_nombre, accion, objetivo_id, detalle)
    VALUES (${actor.asesorId}::uuid, ${actor.nombre}, ${accion}, ${objetivoId}::uuid, ${JSON.stringify(detalle)}::jsonb)
  `
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
