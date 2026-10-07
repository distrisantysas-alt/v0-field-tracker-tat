// ============================================================================
// app/api/admin/usuarios/route.ts
// Panel de usuarios. SOLO el admin maestro (gerencia con es_admin_maestro).
//   GET   → lista de usuarios + últimos cambios
//   POST  → crear usuario (asesor / supervisor / entregador) o transferir el admin maestro
//   PATCH → editar datos, rol, activar/desactivar, asignar/restablecer/quitar clave
// No hay DELETE: el historial de visitas depende del usuario, se desactiva.
// ============================================================================
import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { exigirMaestro, auditar, UUID } from '@/lib/admin-auth'
import { claveValida, claveTemporal, hashClave, CLAVE_MIN } from '@/lib/clave'

const ROLES_CREABLES = ['asesor', 'supervisor', 'entregador'] as const
const EMAIL = /^[^s@]+@[^s@]+.[^s@]+$/

function limpiarTexto(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim().replace(/\s+/g, ' ')
  return t ? t.slice(0, max) : null
}

export async function GET(req: NextRequest) {
  try {
    const m = await exigirMaestro(req)
    if (m instanceof NextResponse) return m

    const usuarios = await sql`
      SELECT a.id, a.nombre, a.email, a.rol, a.zona, a.telefono, a.activo, a.es_admin_maestro,
             a.supervisor_id, s.nombre AS supervisor_nombre,
             (a.clave_hash IS NOT NULL) AS tiene_clave, a.clave_temporal,
             (a.bloqueado_hasta IS NOT NULL AND a.bloqueado_hasta > now()) AS bloqueado,
             a.created_at,
             (SELECT COUNT(*)::int FROM clientes c WHERE c.asesor_id = a.id AND c.activo = true) AS clientes
      FROM asesores a
      LEFT JOIN asesores s ON s.id = a.supervisor_id
      ORDER BY a.es_admin_maestro DESC,
               CASE a.rol WHEN 'gerencia' THEN 0 WHEN 'supervisor' THEN 1 WHEN 'asesor' THEN 2 ELSE 3 END,
               a.activo DESC, a.nombre
    `
    const cambios = await sql`
      SELECT id, actor_nombre, accion, detalle, creado_en,
             (SELECT nombre FROM asesores WHERE id = objetivo_id) AS objetivo_nombre
      FROM auditoria_admin ORDER BY creado_en DESC LIMIT 25
    `
    return NextResponse.json({ success: true, usuarios, cambios })
  } catch (error) {
    console.error('❌ Error en GET /api/admin/usuarios:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const m = await exigirMaestro(req)
    if (m instanceof NextResponse) return m

    const body = await req.json()

    // ── Traspaso del rol de admin maestro ───────────────────────────────────
    if (body.accion === 'transferir_maestro') {
      if (typeof body.nuevo_id !== 'string' || !UUID.test(body.nuevo_id)) {
        return NextResponse.json({ error: 'nuevo_id inválido' }, { status: 400 })
      }
      const r = await sql`SELECT transferir_admin_maestro(${body.nuevo_id}::uuid) AS ok`
      if (!r[0]?.ok) {
        return NextResponse.json({ error: 'Ese usuario no existe, está inactivo o ya es admin maestro' }, { status: 400 })
      }
      await auditar(m, 'transferir_maestro', body.nuevo_id, {})
      return NextResponse.json({ success: true })
    }

    // ── Crear usuario ───────────────────────────────────────────────────────
    const nombre = limpiarTexto(body.nombre, 100)
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const rol = body.rol
    if (!nombre || nombre.length < 2) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    if (!EMAIL.test(email) || email.length > 150) return NextResponse.json({ error: 'El correo no es válido' }, { status: 400 })
    if (!ROLES_CREABLES.includes(rol)) {
      return NextResponse.json({ error: 'Rol no permitido. Solo puede haber un admin maestro.' }, { status: 400 })
    }

    const existe = await sql`SELECT 1 FROM asesores WHERE LOWER(email) = ${email} LIMIT 1`
    if (existe.length > 0) return NextResponse.json({ error: 'Ya existe un usuario con ese correo' }, { status: 409 })

    let supervisorId: string | null = null
    if (rol === 'asesor') {
      if (body.supervisor_id) {
        if (typeof body.supervisor_id !== 'string' || !UUID.test(body.supervisor_id)) return NextResponse.json({ error: 'supervisor_id inválido' }, { status: 400 })
        const s = await sql`SELECT id FROM asesores WHERE id = ${body.supervisor_id}::uuid AND rol = 'supervisor' AND activo = true`
        if (s.length === 0) return NextResponse.json({ error: 'El supervisor indicado no existe o está inactivo' }, { status: 400 })
        supervisorId = s[0].id
      } else {
        const unicos = await sql`SELECT id FROM asesores WHERE rol = 'supervisor' AND activo = true LIMIT 2`
        if (unicos.length === 1) supervisorId = unicos[0].id
      }
    }

    // Clave: la define el admin, o se genera una temporal para entregar una sola vez
    let claveEntregada: string | null = null
    let hash: string | null = null
    if (body.generar_clave === true) {
      claveEntregada = claveTemporal()
      hash = await hashClave(claveEntregada)
    } else if (body.clave) {
      if (!claveValida(body.clave)) return NextResponse.json({ error: `La clave debe tener al menos ${CLAVE_MIN} caracteres` }, { status: 400 })
      claveEntregada = body.clave
      hash = await hashClave(body.clave)
    }

    const zona = limpiarTexto(body.zona, 50)
    const telefono = limpiarTexto(body.telefono, 50)
    const creado = await sql`
      INSERT INTO asesores (nombre, email, zona, rol, activo, supervisor_id, telefono, clave_hash, clave_temporal, clave_actualizada_en)
      VALUES (${nombre}, ${email}, ${zona}, ${rol}, true, ${supervisorId}::uuid, ${telefono}, ${hash}, ${hash !== null}, ${hash ? new Date().toISOString() : null}::timestamptz)
      RETURNING id, nombre, email, rol, zona
    `
    await auditar(m, 'crear_usuario', creado[0].id, { rol, con_clave: hash !== null })
    return NextResponse.json({ success: true, usuario: creado[0], clave_temporal: claveEntregada })
  } catch (error) {
    console.error('❌ Error en POST /api/admin/usuarios:', error)
    const msg = error instanceof Error ? error.message : ''
    if (msg.includes('duplicate') || msg.includes('unique')) {
      return NextResponse.json({ error: 'Ya existe un usuario con ese correo' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const m = await exigirMaestro(req)
    if (m instanceof NextResponse) return m

    const body = await req.json()
    if (typeof body.id !== 'string' || !UUID.test(body.id)) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 })
    }
    const f = await sql`SELECT id, nombre, rol, activo, es_admin_maestro FROM asesores WHERE id = ${body.id}::uuid`
    if (f.length === 0) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    const u = f[0]
    const cambios: Record<string, unknown> = {}
    let claveEntregada: string | null = null

    if (body.nombre !== undefined) {
      const n = limpiarTexto(body.nombre, 100)
      if (!n || n.length < 2) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
      await sql`UPDATE asesores SET nombre = ${n} WHERE id = ${u.id}::uuid`
      cambios.nombre = n
    }
    if (body.email !== undefined) {
      const e = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
      if (!EMAIL.test(e) || e.length > 150) return NextResponse.json({ error: 'El correo no es válido' }, { status: 400 })
      const dup = await sql`SELECT 1 FROM asesores WHERE LOWER(email) = ${e} AND id <> ${u.id}::uuid LIMIT 1`
      if (dup.length > 0) return NextResponse.json({ error: 'Ya existe un usuario con ese correo' }, { status: 409 })
      await sql`UPDATE asesores SET email = ${e} WHERE id = ${u.id}::uuid`
      cambios.email = e
    }
    if (body.zona !== undefined) {
      const z = limpiarTexto(body.zona, 50)
      await sql`UPDATE asesores SET zona = ${z} WHERE id = ${u.id}::uuid`
      cambios.zona = z
    }
    if (body.telefono !== undefined) {
      const t = limpiarTexto(body.telefono, 50)
      await sql`UPDATE asesores SET telefono = ${t} WHERE id = ${u.id}::uuid`
      cambios.telefono = t
    }
    if (body.supervisor_id !== undefined) {
      if (body.supervisor_id === null || body.supervisor_id === '') {
        await sql`UPDATE asesores SET supervisor_id = NULL WHERE id = ${u.id}::uuid`
      } else {
        if (typeof body.supervisor_id !== 'string' || !UUID.test(body.supervisor_id)) return NextResponse.json({ error: 'supervisor_id inválido' }, { status: 400 })
        const s = await sql`SELECT id FROM asesores WHERE id = ${body.supervisor_id}::uuid AND rol = 'supervisor' AND activo = true`
        if (s.length === 0) return NextResponse.json({ error: 'El supervisor indicado no existe o está inactivo' }, { status: 400 })
        await sql`UPDATE asesores SET supervisor_id = ${s[0].id}::uuid WHERE id = ${u.id}::uuid`
      }
      cambios.supervisor_id = body.supervisor_id || null
    }
    if (body.rol !== undefined) {
      if (u.es_admin_maestro) return NextResponse.json({ error: 'El rol del admin maestro solo cambia transfiriendo el cargo' }, { status: 400 })
      if (!ROLES_CREABLES.includes(body.rol)) return NextResponse.json({ error: 'Rol no permitido' }, { status: 400 })
      await sql`UPDATE asesores SET rol = ${body.rol} WHERE id = ${u.id}::uuid`
      cambios.rol = body.rol
    }
    if (body.activo !== undefined) {
      if (typeof body.activo !== 'boolean') return NextResponse.json({ error: 'activo debe ser verdadero o falso' }, { status: 400 })
      if (u.es_admin_maestro && body.activo === false) {
        return NextResponse.json({ error: 'El admin maestro no se puede desactivar. Transfiere el cargo primero.' }, { status: 400 })
      }
      await sql`UPDATE asesores SET activo = ${body.activo} WHERE id = ${u.id}::uuid`
      cambios.activo = body.activo
    }

    // Clave: asignar una, generar temporal o quitarla (vuelve al ingreso solo con correo)
    if (body.generar_clave === true) {
      claveEntregada = claveTemporal()
    } else if (body.clave !== undefined && body.clave !== null) {
      if (!claveValida(body.clave)) return NextResponse.json({ error: `La clave debe tener al menos ${CLAVE_MIN} caracteres` }, { status: 400 })
      claveEntregada = body.clave
    }
    if (claveEntregada) {
      await sql`
        UPDATE asesores
        SET clave_hash = ${await hashClave(claveEntregada)}, clave_temporal = true,
            clave_actualizada_en = now(), intentos_fallidos = 0, bloqueado_hasta = NULL
        WHERE id = ${u.id}::uuid
      `
      cambios.clave = 'restablecida'
    } else if (body.quitar_clave === true) {
      await sql`UPDATE asesores SET clave_hash = NULL, clave_temporal = false, intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ${u.id}::uuid`
      cambios.clave = 'quitada'
    }
    if (body.desbloquear === true) {
      await sql`UPDATE asesores SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ${u.id}::uuid`
      cambios.desbloqueado = true
    }

    if (Object.keys(cambios).length === 0) {
      return NextResponse.json({ error: 'No hay cambios para guardar' }, { status: 400 })
    }
    await auditar(m, 'editar_usuario', u.id, cambios)
    return NextResponse.json({ success: true, clave_temporal: claveEntregada })
  } catch (error) {
    console.error('❌ Error en PATCH /api/admin/usuarios:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
