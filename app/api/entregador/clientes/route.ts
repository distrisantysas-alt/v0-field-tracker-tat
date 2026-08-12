// ============================================================================
// app/api/entregador/clientes/route.ts
// GET — todos los clientes activos agrupados por asesor y ruta
// Sin filtro de rol — incluye todos los asesores activos
// ============================================================================

import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireSesion } from '@/lib/auth'

function fechaColombia(): string {
  return new Date().toLocaleString('en-CA', { timeZone: 'America/Bogota' }).split(',')[0]
}

function getRuta(nombre: string): string {
  if (!nombre) return 'SIN RUTA'
  const match = nombre.match(/^([A-Z0-9]+)\s/i)
  return match ? match[1].toUpperCase() : 'SIN RUTA'
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSesion(req)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(req.url)
    const fecha    = searchParams.get('fecha')    || fechaColombia()
    const asesorId = searchParams.get('asesor_id') || null
    const ruta     = searchParams.get('ruta')      || null

    // Todos los clientes activos con info del asesor y visita de hoy
    // SIN filtro de rol — no todos los proyectos tienen esa columna
    const clientes = asesorId
      ? await sql`
          SELECT
            c.id,
            c.nombre        AS cliente_nombre,
            c.direccion,
            c.lat,
            c.lng,
            c.telefono,
            a.id            AS asesor_id,
            a.nombre        AS asesor_nombre,
            a.zona,
            v.hubo_pedido,
            v.valor_pedido,
            v.timestamp     AS visitado_en,
            v.validada
          FROM clientes c
          JOIN asesores a ON a.id = c.asesor_id
          LEFT JOIN visitas v
            ON v.cliente_id = c.id
            AND v.asesor_id = c.asesor_id
            AND (v.timestamp AT TIME ZONE 'America/Bogota')::date = ${fecha}::date
          WHERE c.activo = true
            AND a.activo = true
            AND c.asesor_id = ${asesorId}::uuid
          ORDER BY c.nombre ASC
        `
      : await sql`
          SELECT
            c.id,
            c.nombre        AS cliente_nombre,
            c.direccion,
            c.lat,
            c.lng,
            c.telefono,
            a.id            AS asesor_id,
            a.nombre        AS asesor_nombre,
            a.zona,
            v.hubo_pedido,
            v.valor_pedido,
            v.timestamp     AS visitado_en,
            v.validada
          FROM clientes c
          JOIN asesores a ON a.id = c.asesor_id
          LEFT JOIN visitas v
            ON v.cliente_id = c.id
            AND v.asesor_id = c.asesor_id
            AND (v.timestamp AT TIME ZONE 'America/Bogota')::date = ${fecha}::date
          WHERE c.activo = true
            AND a.activo = true
          ORDER BY a.nombre ASC, c.nombre ASC
        `

    // Agrupar por asesor → ruta → clientes
    const porAsesor: Record<string, any> = {}

    for (const c of clientes) {
      const asesorKey = c.asesor_nombre
      if (!porAsesor[asesorKey]) {
        porAsesor[asesorKey] = {
          asesor_id:  c.asesor_id,
          asesor:     c.asesor_nombre,
          zona:       c.zona,
          rutas:      {} as Record<string, any[]>,
          total:      0,
          con_pedido: 0,
          visitados:  0,
        }
      }

      const rutaCliente = getRuta(c.cliente_nombre)

      // Filtro opcional por ruta
      if (ruta && rutaCliente !== ruta.toUpperCase()) continue

      if (!porAsesor[asesorKey].rutas[rutaCliente]) {
        porAsesor[asesorKey].rutas[rutaCliente] = []
      }

      const cliente = {
        id:           c.id,
        nombre:       c.cliente_nombre,
        direccion:    c.direccion,
        lat:          c.lat  ? parseFloat(c.lat)  : null,
        lng:          c.lng  ? parseFloat(c.lng)  : null,
        telefono:     c.telefono,
        visitado:     !!c.visitado_en,
        hubo_pedido:  c.hubo_pedido  ?? false,
        valor_pedido: parseFloat(c.valor_pedido)  || 0,
        valor_formato: c.valor_pedido
          ? `$${parseFloat(c.valor_pedido).toLocaleString('es-CO')}`
          : null,
        validada: c.validada,
      }

      porAsesor[asesorKey].rutas[rutaCliente].push(cliente)
      porAsesor[asesorKey].total++
      if (cliente.visitado)    porAsesor[asesorKey].visitados++
      if (cliente.hubo_pedido) porAsesor[asesorKey].con_pedido++
    }

    // Limpiar asesores sin clientes (por filtro de ruta)
    const resultado = Object.values(porAsesor)
      .filter((a: any) => Object.keys(a.rutas).length > 0)
      .map((a: any) => ({
        ...a,
        rutas: Object.entries(a.rutas)
          .sort(([ra], [rb]) =>
            ra.localeCompare(rb, undefined, { numeric: true })
          )
          .map(([r, cls]) => ({
            ruta:     r,
            clientes: cls,
            total:    (cls as any[]).length,
          })),
      }))

    // Lista plana de rutas únicas (para el filtro del frontend)
    const rutasUnicas = Array.from(
      new Set(clientes.map(c => getRuta(c.cliente_nombre)))
    ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

    return NextResponse.json({
      fecha,
      total_clientes: clientes.length,
      rutas_unicas:   rutasUnicas,
      por_asesor:     resultado,
    })

  } catch (error) {
    console.error('Error en entregador/clientes:', error)
    const msg = error instanceof Error ? error.message : 'Unknown'
    return NextResponse.json(
      { error: 'Error obteniendo clientes', details: msg },
      { status: 500 }
    )
  }
}
