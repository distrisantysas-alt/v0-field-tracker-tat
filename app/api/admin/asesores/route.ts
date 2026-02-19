// ============================================================================
// app/api/admin/asesores/route.ts
// ============================================================================
// Endpoint para listar asesores (usado en filtros y selects del admin)
// ============================================================================

import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const asesores = await sql`
      SELECT 
        a.id,
        a.nombre,
        a.email,
        a.zona,
        a.activo,
        COUNT(c.id) as total_clientes
      FROM asesores a
      LEFT JOIN clientes c ON a.id = c.asesor_id AND c.activo = true
      GROUP BY a.id, a.nombre, a.email, a.zona, a.activo
      ORDER BY a.nombre ASC
    `;

    return NextResponse.json({
      success: true,
      asesores: asesores.map(a => ({
        id: a.id,
        nombre: a.nombre,
        email: a.email,
        zona: a.zona,
        activo: a.activo,
        total_clientes: parseInt(a.total_clientes || '0')
      }))
    });

  } catch (error) {
    console.error('Error listando asesores:', error);
    return NextResponse.json(
      { error: 'Error listando asesores' },
      { status: 500 }
    );
  }
}
