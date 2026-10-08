// ============================================================================
// app/api/admin/reasignar-ruta/route.ts
// Reasignacion POR RUTA (no hay que ir asesor por asesor):
//   GET  → rutas con sus clientes y quien las tiene hoy + asesores activos a quienes pasarlas
//   POST → { rutas: ['84','12A'], asesor_destino_id } pasa TODOS los clientes de esas rutas
//          al asesor destino, sin importar quien los tuviera (incluso un asesor desactivado).
// Mismos efectos que /api/admin/reasignar: las asignaciones abiertas del supervisor se
// traspasan al asesor nuevo y las coordenadas se refrescan con las visitas reales.
// Deja huella en la bitacora (auditoria_admin) si la tabla existe.
// ============================================================================
import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireSesion } from '@/lib/auth'
import { UUID } from '@/lib/admin-auth'
import { rutaDe, compararRutas } from '@/lib/rutas'

const MAX_RUTAS = 60

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSesion(req, ['supervisor', 'gerencia'])
    if (auth instanceof NextResponse) return auth

    const filas = await sql`
      SELECT c.nombre, c.asesor_id, a.nombre AS asesor_nombre, a.activo AS asesor_activo
      FROM clientes c
      LEFT JOIN asesores a ON a.id = c.asesor_id
      WHERE c.activo = true
    `
    type Dueno = { asesor_id: string | null; nombre: string; activo: boolean; clientes: number }
    const mapa = new Map<string, { total: number; duenos: Map<string, Dueno> }>()
    for (const f of filas as any[]) {
      const ruta = rutaDe(f.nombre)
      const g = mapa.get(ruta) ?? { total: 0, duenos: new Map<string, Dueno>() }
      g.total++
      const activo = f.asesor_id ? f.asesor_activo === true : false
      const clave = activo ? f.asesor_id : 'sin-asesor-activo'
      const d = g.duenos.get(clave) ?? {
        asesor_id: activo ? f.asesor_id : null,
        nombre: activo ? f.asesor_nombre : 'Sin asesor activo',
        activo,
        clientes: 0,
      }
      d.clientes++
      g.duenos.set(clave, d)
      mapa.set(ruta, g)
    }
    const rutas = [...mapa.entries()]
      .sort((x, y) => compararRutas(x[0], y[0]))
      .map(([ruta, g]) => {
        const duenos = [...g.duenos.values()].sort((a, b) => b.clientes - a.clientes)
        return {
          ruta,
          total: g.total,
          duenos,
          sin_asesor_activo: duenos.filter(d => !d.activo).reduce((s, d) => s + d.clientes, 0),
        }
      })

    const asesores = await sql`
      SELECT a.id, a.nombre, a.zona, COUNT(c.id)::int AS clientes
      FROM asesores a
      LEFT JOIN clientes c ON c.asesor_id = a.id AND c.activo = true
      WHERE a.activo = true AND a.rol = 'asesor'
      GROUP BY a.id, a.nombre, a.zona
      ORDER BY a.nombre
    `
    return NextResponse.json({ success: true, rutas, asesores })
  } catch (error) {
    console.error('❌ Error en GET /api/admin/reasignar-ruta:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSesion(req, ['supervisor', 'gerencia'])
    if (auth instanceof NextResponse) return auth

    const body = await req.json()
    const destinoId = body.asesor_destino_id
    if (typeof destinoId !== 'string' || !UUID.test(destinoId)) {
      return NextResponse.json({ error: 'Elige el asesor que recibe las rutas' }, { status: 400 })
    }
    if (!Array.isArray(body.rutas) || body.rutas.length === 0) {
      return NextResponse.json({ error: 'Elige al menos una ruta' }, { status: 400 })
    }
    if (body.rutas.length > MAX_RUTAS) {
      return NextResponse.json({ error: `Máximo ${MAX_RUTAS} rutas por vez` }, { status: 400 })
    }
    const rutas = new Set<string>(body.rutas.filter((r: unknown) => typeof r === 'string').map((r: string) => r.toUpperCase()))
    if (rutas.size === 0) return NextResponse.json({ error: 'Elige al menos una ruta' }, { status: 400 })

    const destino = await sql`SELECT id, nombre FROM asesores WHERE id = ${destinoId}::uuid AND activo = true AND rol = 'asesor'`
    if (destino.length === 0) {
      return NextResponse.json({ error: 'Ese asesor no existe o está desactivado. Elige un asesor activo.' }, { status: 400 })
    }

    const todos = await sql`
      SELECT c.id, c.nombre, c.asesor_id, a.nombre AS asesor_nombre
      FROM clientes c LEFT JOIN asesores a ON a.id = c.asesor_id
      WHERE c.activo = true
    `
    const mover = (todos as any[]).filter(c => rutas.has(rutaDe(c.nombre)) && c.asesor_id !== destinoId)
    const yaSuyos = (todos as any[]).filter(c => rutas.has(rutaDe(c.nombre)) && c.asesor_id === destinoId).length
    if (mover.length === 0) {
      return NextResponse.json({
        success: true, clientes_movidos: 0, ya_eran_suyos: yaSuyos, a: destino[0].nombre,
        mensaje: yaSuyos > 0 ? `Esas rutas ya eran de ${destino[0].nombre}` : 'Esas rutas no tienen clientes activos',
      })
    }

    const ids: string[] = mover.map(c => c.id)
    const origenesIds = [...new Set(mover.map(c => c.asesor_id).filter(Boolean))] as string[]

    await sql`UPDATE clientes SET asesor_id = ${destinoId}::uuid WHERE id = ANY(${ids}::uuid[])`

    // los clientes que el asesor anterior tenia compartidos tambien pasan al nuevo
    let compartidosMovidos = 0
    if (origenesIds.length > 0) {
      const comp = await sql`
        SELECT DISTINCT cliente_id FROM asesor_clientes
        WHERE cliente_id = ANY(${ids}::uuid[]) AND asesor_id = ANY(${origenesIds}::uuid[])
      `
      compartidosMovidos = comp.length
      await sql`DELETE FROM asesor_clientes WHERE cliente_id = ANY(${ids}::uuid[]) AND asesor_id = ANY(${origenesIds}::uuid[])`
      if (comp.length > 0) {
        await sql`
          INSERT INTO asesor_clientes (asesor_id, cliente_id)
          SELECT ${destinoId}::uuid, x FROM unnest(${comp.map((r: any) => r.cliente_id)}::uuid[]) AS x
          ON CONFLICT (asesor_id, cliente_id) DO NOTHING
        `
      }
    }

    let coordenadas = 0
    try {
      const r = await sql`
        UPDATE clientes c SET lat = s.lat_prom, lng = s.lng_prom
        FROM (
          SELECT cliente_id, AVG(lat_capturada) AS lat_prom, AVG(lng_capturada) AS lng_prom
          FROM visitas
          WHERE cliente_id = ANY(${ids}::uuid[])
            AND lat_capturada IS NOT NULL AND lat_capturada != 0
            AND lng_capturada IS NOT NULL AND lng_capturada != 0
          GROUP BY cliente_id
        ) s
        WHERE c.id = s.cliente_id
      `
      coordenadas = (r as any).count ?? 0
    } catch (e) {
      console.error('⚠️ Error actualizando coordenadas tras reasignar rutas:', e)
    }

    let asignaciones = 0
    try {
      const r = await sql`
        UPDATE asignaciones SET asesor_id = ${destinoId}::uuid, updated_at = now()
        WHERE cliente_id = ANY(${ids}::uuid[])
          AND asesor_id <> ${destinoId}::uuid
          AND estado IN ('pendiente', 'en_gestion')
      `
      asignaciones = (r as any).count ?? 0
    } catch (e) {
      console.error('⚠️ Error traspasando asignaciones tras reasignar rutas:', e)
    }

    const porOrigen = new Map<string, number>()
    for (const c of mover) {
      const n = c.asesor_nombre ?? 'Sin asesor'
      porOrigen.set(n, (porOrigen.get(n) ?? 0) + 1)
    }
    const de = [...porOrigen.entries()].map(([nombre, clientes]) => ({ nombre, clientes })).sort((a, b) => b.clientes - a.clientes)

    try {
      const yo = await sql`SELECT nombre FROM asesores WHERE id = ${auth.asesorId}::uuid`
      await sql`
        INSERT INTO auditoria_admin (actor_id, actor_nombre, accion, objetivo_id, detalle)
        VALUES (${auth.asesorId}::uuid, ${yo[0]?.nombre ?? null}, 'reasignar_rutas', ${destinoId}::uuid,
                ${JSON.stringify({ rutas: [...rutas], clientes: ids.length, de, a: destino[0].nombre })}::jsonb)
      `
    } catch (e) {
      console.error('⚠️ No se pudo registrar la reasignación en la bitácora:', e)
    }

    return NextResponse.json({
      success: true,
      clientes_movidos: ids.length,
      ya_eran_suyos: yaSuyos,
      compartidos_movidos: compartidosMovidos,
      coordenadas_actualizadas: coordenadas,
      asignaciones_traspasadas: asignaciones,
      de,
      a: destino[0].nombre,
      mensaje: `${ids.length} cliente${ids.length === 1 ? '' : 's'} de ${rutas.size} ruta${rutas.size === 1 ? '' : 's'} pasaron a ${destino[0].nombre}`,
    })
  } catch (error) {
    console.error('❌ Error en POST /api/admin/reasignar-ruta:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
