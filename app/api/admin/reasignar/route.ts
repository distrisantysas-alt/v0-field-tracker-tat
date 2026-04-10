// ============================================================================
// app/api/admin/reasignar/route.ts
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

    // Obtener TODOS los clientes del asesor origen primero
    const todosClientes = await sql`
      SELECT id, nombre FROM clientes
      WHERE asesor_id = ${asesor_origen_id}
        AND activo = true
    `

    let clientesAMover = todosClientes

    // Si hay rutas específicas, filtrar por prefijo
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

    // Reasignar uno a uno para contar correctamente
    const ids = clientesAMover.map((c: any) => c.id)

    await sql`
      UPDATE clientes
      SET asesor_id = ${asesor_destino_id}
      WHERE id = ANY(${ids}::uuid[])
    `

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
        de:                 origen[0]?.nombre,
        a:                  destino[0]?.nombre,
        clientes_movidos:   clientesMovidos,
        rutas_reasignadas:  rutas?.length > 0 ? rutas : 'todas',
        asesor_desactivado: desactivar_origen ?? false,
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
