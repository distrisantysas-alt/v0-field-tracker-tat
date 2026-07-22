// ============================================================================
// app/api/admin/reasignar/route.ts
// ✅ Reasigna clientes entre asesores
// ✅ Al reasignar, copia automáticamente las coordenadas de la última visita
//    a los clientes que tengan lat=0 o null — para que el nuevo asesor
//    pueda verlos en el mapa y el checkin funcione correctamente
// ============================================================================
import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { asesor_origen_id, asesor_destino_id, rutas, desactivar_origen } = body;

    if (!asesor_origen_id || !asesor_destino_id) {
      return NextResponse.json(
        { error: 'asesor_origen_id y asesor_destino_id son requeridos' },
        { status: 400 }
      );
    }

    if (asesor_origen_id === asesor_destino_id) {
      return NextResponse.json(
        { error: 'El asesor origen y destino no pueden ser el mismo' },
        { status: 400 }
      );
    }

    // ── Clientes propios (clientes.asesor_id) ───────────────────────────────
    const propios = await sql`
      SELECT id, nombre FROM clientes
      WHERE asesor_id = ${asesor_origen_id}
        AND activo = true
    `

    // ── Clientes compartidos (asesor_clientes) ───────────────────────────────
    const compartidos = await sql`
      SELECT c.id, c.nombre FROM asesor_clientes ac
      JOIN clientes c ON c.id = ac.cliente_id
      WHERE ac.asesor_id = ${asesor_origen_id}
        AND c.activo = true
    `

    // Combinar ambas listas sin duplicados
    const todosMap = new Map()
    for (const c of [...propios, ...compartidos]) {
      todosMap.set(c.id, c)
    }
    let todosClientes = Array.from(todosMap.values())

    // Si hay rutas específicas, filtrar por prefijo
    let clientesAMover = todosClientes
    if (rutas && rutas.length > 0) {
      clientesAMover = todosClientes.filter((c: any) => {
        const match = c.nombre?.match(/^([A-Z0-9]+)\s/i)
        const ruta = match ? match[1].toUpperCase() : null
        return ruta && rutas.map((r: string) => r.toUpperCase()).includes(ruta)
      })
    }

    if (clientesAMover.length === 0) {
      const origen  = await sql`SELECT nombre FROM asesores WHERE id = ${asesor_origen_id}`
      const destino = await sql`SELECT nombre FROM asesores WHERE id = ${asesor_destino_id}`
      return NextResponse.json({
        success: true,
        mensaje: '0 clientes reasignados — verifica las rutas seleccionadas',
        detalle: {
          de: origen[0]?.nombre,
          a: destino[0]?.nombre,
          clientes_movidos: 0,
          rutas_reasignadas: rutas ?? 'todas',
          asesor_desactivado: false,
        }
      })
    }

    const ids = clientesAMover.map((c: any) => c.id)

    // ── Actualizar clientes propios ─────────────────────────────────────────
    const idsPropios = clientesAMover
      .filter((c: any) => propios.some((p: any) => p.id === c.id))
      .map((c: any) => c.id)

    if (idsPropios.length > 0) {
      await sql`
        UPDATE clientes
        SET asesor_id = ${asesor_destino_id}
        WHERE id = ANY(${idsPropios}::uuid[])
      `
    }

    // ── Actualizar clientes compartidos ─────────────────────────────────────
    const idsCompartidos = clientesAMover
      .filter((c: any) => compartidos.some((s: any) => s.id === c.id))
      .map((c: any) => c.id)

    if (idsCompartidos.length > 0) {
      await sql`
        DELETE FROM asesor_clientes
        WHERE asesor_id = ${asesor_origen_id}
          AND cliente_id = ANY(${idsCompartidos}::uuid[])
      `
      for (const id of idsCompartidos) {
        await sql`
          INSERT INTO asesor_clientes (asesor_id, cliente_id)
          VALUES (${asesor_destino_id}, ${id})
          ON CONFLICT (asesor_id, cliente_id) DO NOTHING
        `
      }
    }

    // ── Copiar coordenadas de visitas a clientes sin GPS ────────────────────
    // Para cada cliente reasignado que tenga lat=0 o null,
    // toma el promedio de coordenadas capturadas en sus visitas históricas
    let coordenadasActualizadas = 0
    try {
      const resultado = await sql`
        UPDATE clientes c
        SET
          lat = subq.lat_prom,
          lng = subq.lng_prom
        FROM (
          SELECT
            cliente_id,
            AVG(lat_capturada) as lat_prom,
            AVG(lng_capturada) as lng_prom
          FROM visitas
          WHERE cliente_id = ANY(${ids}::uuid[])
            AND lat_capturada IS NOT NULL
            AND lat_capturada != 0
            AND lng_capturada IS NOT NULL
            AND lng_capturada != 0
          GROUP BY cliente_id
        ) subq
        WHERE c.id = subq.cliente_id
          AND (c.lat IS NULL OR c.lat = 0)
      `
      coordenadasActualizadas = resultado.count ?? 0
      console.log(`📍 Coordenadas actualizadas en ${coordenadasActualizadas} clientes reasignados`)
    } catch (e) {
      console.error('⚠️ Error actualizando coordenadas tras reasignación:', e)
    }

    const clientesMovidos = ids.length

    if (desactivar_origen) {
      await sql`UPDATE asesores SET activo = false WHERE id = ${asesor_origen_id}`
    }

    const origen  = await sql`SELECT nombre FROM asesores WHERE id = ${asesor_origen_id}`
    const destino = await sql`SELECT nombre FROM asesores WHERE id = ${asesor_destino_id}`

    console.log(`✅ Reasignados ${clientesMovidos} clientes de ${origen[0]?.nombre} → ${destino[0]?.nombre}`)

    return NextResponse.json({
      success: true,
      mensaje: `${clientesMovidos} clientes reasignados correctamente`,
      detalle: {
        de:                       origen[0]?.nombre,
        a:                        destino[0]?.nombre,
        clientes_movidos:         clientesMovidos,
        coordenadas_actualizadas: coordenadasActualizadas,
        rutas_reasignadas:        rutas?.length > 0 ? rutas : 'todas',
        asesor_desactivado:       desactivar_origen ?? false,
      }
    });

  } catch (error) {
    console.error('Error reasignando clientes:', error);
    return NextResponse.json(
      { error: 'Error reasignando clientes', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
