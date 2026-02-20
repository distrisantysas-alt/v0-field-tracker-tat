// ============================================================================
// app/api/admin/reasignar/route.ts
// ============================================================================
// POST → reasignar clientes de un asesor a otro
// Puede ser por rutas específicas o todas las rutas
// ============================================================================

import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      asesor_origen_id,   // asesor que se va
      asesor_destino_id,  // asesor que recibe
      rutas,              // array de rutas ej: ["75", "23"] — si es null/vacío reasigna todo
      desactivar_origen,  // true = marcar asesor origen como inactivo
    } = body;

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

    let clientesActualizados = 0;

    if (rutas && rutas.length > 0) {
      // ── Reasignar solo las rutas seleccionadas ───────────────────────
      // Cada ruta es el prefijo del nombre del cliente (ej: "75" para "75 HENRY DIAZ")
      for (const ruta of rutas) {
        const patron = `${ruta} %`;
        const result = await sql`
          UPDATE clientes
          SET asesor_id = ${asesor_destino_id}
          WHERE asesor_id = ${asesor_origen_id}
            AND activo = true
            AND nombre ILIKE ${patron}
        `;
        clientesActualizados += result.count ?? 0;
      }
    } else {
      // ── Reasignar TODOS los clientes del asesor origen ───────────────
      const result = await sql`
        UPDATE clientes
        SET asesor_id = ${asesor_destino_id}
        WHERE asesor_id = ${asesor_origen_id}
          AND activo = true
      `;
      clientesActualizados = result.count ?? 0;
    }

    // ── Desactivar asesor origen si se pidió ─────────────────────────
    if (desactivar_origen) {
      await sql`
        UPDATE asesores SET activo = false WHERE id = ${asesor_origen_id}
      `;
    }

    // ── Info del resultado ────────────────────────────────────────────
    const origen  = await sql`SELECT nombre FROM asesores WHERE id = ${asesor_origen_id}`;
    const destino = await sql`SELECT nombre FROM asesores WHERE id = ${asesor_destino_id}`;

    return NextResponse.json({
      success: true,
      mensaje: `${clientesActualizados} clientes reasignados correctamente`,
      detalle: {
        de:                  origen[0]?.nombre,
        a:                   destino[0]?.nombre,
        clientes_movidos:    clientesActualizados,
        rutas_reasignadas:   rutas?.length > 0 ? rutas : 'todas',
        asesor_desactivado:  desactivar_origen ?? false,
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
