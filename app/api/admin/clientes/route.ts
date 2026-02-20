// ============================================================================
// app/api/admin/clientes/route.ts
// ============================================================================

import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const buscar = searchParams.get('buscar') || '';
    const asesor_id = searchParams.get('asesor_id') || '';
    const activo = searchParams.get('activo');
    const con_gps = searchParams.get('con_gps') || 'all';
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    let clientes: any[];
    let totalResult: any[];

    if (!buscar && !asesor_id && activo === null && con_gps === 'all') {
      clientes = await sql`
        SELECT c.id, c.codigo, c.nombre, c.direccion, c.telefono,
               c.lat, c.lng, c.radio_metros, c.activo, c.created_at,
               a.id as asesor_id, a.nombre as asesor_nombre, a.email as asesor_email
        FROM clientes c
        LEFT JOIN asesores a ON c.asesor_id = a.id
        ORDER BY c.nombre ASC
        LIMIT ${limit} OFFSET ${offset}
      `;
      totalResult = await sql`SELECT COUNT(*) as total FROM clientes`;

    } else if (buscar && !asesor_id && activo === null && con_gps === 'all') {
      const term = `%${buscar}%`;
      clientes = await sql`
        SELECT c.id, c.codigo, c.nombre, c.direccion, c.telefono,
               c.lat, c.lng, c.radio_metros, c.activo, c.created_at,
               a.id as asesor_id, a.nombre as asesor_nombre, a.email as asesor_email
        FROM clientes c
        LEFT JOIN asesores a ON c.asesor_id = a.id
        WHERE c.nombre ILIKE ${term} OR c.codigo ILIKE ${term} OR c.direccion ILIKE ${term}
        ORDER BY c.nombre ASC
        LIMIT ${limit} OFFSET ${offset}
      `;
      totalResult = await sql`
        SELECT COUNT(*) as total FROM clientes c
        WHERE c.nombre ILIKE ${term} OR c.codigo ILIKE ${term} OR c.direccion ILIKE ${term}
      `;

    } else if (!buscar && asesor_id && activo === null && con_gps === 'all') {
      clientes = await sql`
        SELECT c.id, c.codigo, c.nombre, c.direccion, c.telefono,
               c.lat, c.lng, c.radio_metros, c.activo, c.created_at,
               a.id as asesor_id, a.nombre as asesor_nombre, a.email as asesor_email
        FROM clientes c
        LEFT JOIN asesores a ON c.asesor_id = a.id
        WHERE c.asesor_id = ${asesor_id}::uuid
        ORDER BY c.nombre ASC
        LIMIT ${limit} OFFSET ${offset}
      `;
      totalResult = await sql`
        SELECT COUNT(*) as total FROM clientes WHERE asesor_id = ${asesor_id}::uuid
      `;

    } else if (con_gps === 'true') {
      clientes = await sql`
        SELECT c.id, c.codigo, c.nombre, c.direccion, c.telefono,
               c.lat, c.lng, c.radio_metros, c.activo, c.created_at,
               a.id as asesor_id, a.nombre as asesor_nombre, a.email as asesor_email
        FROM clientes c
        LEFT JOIN asesores a ON c.asesor_id = a.id
        WHERE c.lat IS NOT NULL AND c.lng IS NOT NULL
        ORDER BY c.nombre ASC
        LIMIT ${limit} OFFSET ${offset}
      `;
      totalResult = await sql`
        SELECT COUNT(*) as total FROM clientes WHERE lat IS NOT NULL AND lng IS NOT NULL
      `;

    } else if (con_gps === 'false') {
      clientes = await sql`
        SELECT c.id, c.codigo, c.nombre, c.direccion, c.telefono,
               c.lat, c.lng, c.radio_metros, c.activo, c.created_at,
               a.id as asesor_id, a.nombre as asesor_nombre, a.email as asesor_email
        FROM clientes c
        LEFT JOIN asesores a ON c.asesor_id = a.id
        WHERE c.lat IS NULL OR c.lng IS NULL
        ORDER BY c.nombre ASC
        LIMIT ${limit} OFFSET ${offset}
      `;
      totalResult = await sql`
        SELECT COUNT(*) as total FROM clientes WHERE lat IS NULL OR lng IS NULL
      `;

    } else {
      clientes = await sql`
        SELECT c.id, c.codigo, c.nombre, c.direccion, c.telefono,
               c.lat, c.lng, c.radio_metros, c.activo, c.created_at,
               a.id as asesor_id, a.nombre as asesor_nombre, a.email as asesor_email
        FROM clientes c
        LEFT JOIN asesores a ON c.asesor_id = a.id
        ORDER BY c.nombre ASC
        LIMIT ${limit} OFFSET ${offset}
      `;
      totalResult = await sql`SELECT COUNT(*) as total FROM clientes`;
    }

    const total = parseInt(totalResult[0]?.total || '0');

    return NextResponse.json({
      success: true,
      clientes: clientes.map(c => ({
        id: c.id,
        codigo: c.codigo,
        nombre: c.nombre,
        direccion: c.direccion,
        telefono: c.telefono,
        coordenadas: c.lat && c.lng ? {
          lat: parseFloat(c.lat),
          lng: parseFloat(c.lng)
        } : null,
        radio_metros: c.radio_metros,
        activo: c.activo,
        asesor: c.asesor_id ? {
          id: c.asesor_id,
          nombre: c.asesor_nombre,
          email: c.asesor_email
        } : null,
        created_at: c.created_at
      })),
      pagination: {
        total,
        limit,
        offset,
        has_more: offset + limit < total
      }
    });

  } catch (error) {
    console.error('Error listando clientes:', error);
    return NextResponse.json(
      { error: 'Error listando clientes', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { cliente_id, asesor_id, activo, nombre, direccion, telefono } = body;

    if (!cliente_id) {
      return NextResponse.json({ error: 'cliente_id requerido' }, { status: 400 });
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (asesor_id !== undefined) { updates.push(`asesor_id = $${paramIndex++}`); values.push(asesor_id); }
    if (activo !== undefined)    { updates.push(`activo = $${paramIndex++}`);    values.push(activo); }
    if (nombre)                  { updates.push(`nombre = $${paramIndex++}`);    values.push(nombre); }
    if (direccion)               { updates.push(`direccion = $${paramIndex++}`); values.push(direccion); }
    if (telefono)                { updates.push(`telefono = $${paramIndex++}`);  values.push(telefono); }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No hay campos para actualizar' }, { status: 400 });
    }

    values.push(cliente_id);
    const query = `UPDATE clientes SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
    const result = await sql.unsafe(query, values);

    if (result.length === 0) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
    }

    return NextResponse.json({ success: true, mensaje: 'Cliente actualizado', cliente: result[0] });

  } catch (error) {
    console.error('Error actualizando cliente:', error);
    return NextResponse.json({ error: 'Error actualizando cliente' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const cliente_id = searchParams.get('cliente_id');

    if (!cliente_id) {
      return NextResponse.json({ error: 'cliente_id requerido' }, { status: 400 });
    }

    await sql`UPDATE clientes SET activo = false WHERE id = ${cliente_id}`;

    return NextResponse.json({ success: true, mensaje: 'Cliente desactivado' });

  } catch (error) {
    console.error('Error eliminando cliente:', error);
    return NextResponse.json({ error: 'Error eliminando cliente' }, { status: 500 });
  }
}
