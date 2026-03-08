// ============================================================================
// app/api/admin/asesores/route.ts
// ============================================================================
import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

// ── GET: listar asesores ─────────────────────────────────────────────────────
export async function GET() {
  try {
    const asesores = await sql`
      SELECT
        a.id, a.nombre, a.email, a.zona, a.activo, a.rol,
        (
          SELECT COUNT(DISTINCT c.id)
          FROM (
            SELECT id FROM clientes WHERE asesor_id = a.id AND activo = true
            UNION
            SELECT ac.cliente_id FROM asesor_clientes ac
            INNER JOIN clientes c2 ON c2.id = ac.cliente_id AND c2.activo = true
            WHERE ac.asesor_id = a.id
          ) c
        ) as total_clientes
      FROM asesores a
      ORDER BY a.nombre ASC
    `;
    return NextResponse.json({
      success: true,
      asesores: asesores.map(a => ({
        id:             a.id,
        nombre:         a.nombre,
        email:          a.email,
        zona:           a.zona,
        activo:         a.activo,
        rol:            a.rol,
        total_clientes: parseInt(a.total_clientes || '0'),
      }))
    });
  } catch (error) {
    console.error('Error listando asesores:', error);
    return NextResponse.json({ error: 'Error listando asesores' }, { status: 500 });
  }
}

// ── PATCH: editar nombre / zona / desactivar ─────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { asesor_id, nombre, zona, activo } = body;

    if (!asesor_id) {
      return NextResponse.json({ error: 'asesor_id requerido' }, { status: 400 });
    }

    const campos: Record<string, any> = {};
    if (nombre !== undefined) campos.nombre = nombre.trim();
    if (zona   !== undefined) campos.zona   = zona?.trim() || null;
    if (activo !== undefined) campos.activo = activo;

    if (Object.keys(campos).length === 0) {
      return NextResponse.json({ error: 'No hay campos para actualizar' }, { status: 400 });
    }

    if (campos.nombre !== undefined) {
      await sql`UPDATE asesores SET nombre = ${campos.nombre} WHERE id = ${asesor_id}`;
    }
    if (campos.zona !== undefined) {
      await sql`UPDATE asesores SET zona = ${campos.zona} WHERE id = ${asesor_id}`;
    }
    if (campos.activo !== undefined) {
      await sql`UPDATE asesores SET activo = ${campos.activo} WHERE id = ${asesor_id}`;
    }

    const updated = await sql`
      SELECT id, nombre, email, zona, activo, rol FROM asesores WHERE id = ${asesor_id}
    `;

    return NextResponse.json({
      success: true,
      mensaje: 'Asesor actualizado correctamente',
      asesor:  updated[0],
    });
  } catch (error) {
    console.error('Error actualizando asesor:', error);
    return NextResponse.json({ error: 'Error actualizando asesor' }, { status: 500 });
  }
}
