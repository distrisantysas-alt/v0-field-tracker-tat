// ============================================================================
// app/api/admin/clientes/route.ts
// ============================================================================
// Endpoints para gestión de clientes desde el panel admin
// ============================================================================

import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET - Listar todos los clientes con filtros
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    
    const buscar = searchParams.get('buscar');
    const asesor_id = searchParams.get('asesor_id');
    const activo = searchParams.get('activo');
    const con_gps = searchParams.get('con_gps');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = sql`
      SELECT 
        c.id,
        c.codigo,
        c.nombre,
        c.direccion,
        c.telefono,
        c.lat,
        c.lng,
        c.radio_metros,
        c.activo,
        c.created_at,
        a.nombre as asesor_nombre,
        a.email as asesor_email,
        a.id as asesor_id
      FROM clientes c
      LEFT JOIN asesores a ON c.asesor_id = a.id
      WHERE 1=1
    `;

    // Filtros dinámicos
    const conditions = [];
    const params: any[] = [];

    if (buscar) {
      conditions.push(`(c.nombre ILIKE $${params.length + 1} OR c.codigo ILIKE $${params.length + 1} OR c.direccion ILIKE $${params.length + 1})`);
      params.push(`%${buscar}%`);
    }

    if (asesor_id) {
      conditions.push(`c.asesor_id = $${params.length + 1}`);
      params.push(asesor_id);
    }

    if (activo !== null && activo !== undefined) {
      conditions.push(`c.activo = $${params.length + 1}`);
      params.push(activo === 'true');
    }

    if (con_gps === 'true') {
      conditions.push(`c.lat IS NOT NULL AND c.lng IS NOT NULL`);
    } else if (con_gps === 'false') {
      conditions.push(`(c.lat IS NULL OR c.lng IS NULL)`);
    }

    // Construir query final
    let finalQuery = `
      SELECT 
        c.id,
        c.codigo,
        c.nombre,
        c.direccion,
        c.telefono,
        c.lat,
        c.lng,
        c.radio_metros,
        c.activo,
        c.created_at,
        a.nombre as asesor_nombre,
        a.email as asesor_email,
        a.id as asesor_id
      FROM clientes c
      LEFT JOIN asesores a ON c.asesor_id = a.id
    `;

    if (conditions.length > 0) {
      finalQuery += ' WHERE ' + conditions.join(' AND ');
    }

    finalQuery += ` ORDER BY c.created_at DESC LIMIT ${limit} OFFSET ${offset}`;

    const clientes = await sql.unsafe(finalQuery, params);

    // Contar total
    let countQuery = 'SELECT COUNT(*) as total FROM clientes c WHERE 1=1';
    if (conditions.length > 0) {
      countQuery = `SELECT COUNT(*) as total FROM clientes c WHERE ${conditions.join(' AND ')}`;
    }
    
    const totalResult = await sql.unsafe(countQuery, params);
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
      { error: 'Error listando clientes' },
      { status: 500 }
    );
  }
}

/**
 * PATCH - Actualizar cliente (reasignar, activar/desactivar, etc)
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { cliente_id, asesor_id, activo, nombre, direccion, telefono } = body;

    if (!cliente_id) {
      return NextResponse.json(
        { error: 'cliente_id requerido' },
        { status: 400 }
      );
    }

    // Construir update dinámico
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (asesor_id !== undefined) {
      updates.push(`asesor_id = $${paramIndex++}`);
      values.push(asesor_id);
    }

    if (activo !== undefined) {
      updates.push(`activo = $${paramIndex++}`);
      values.push(activo);
    }

    if (nombre) {
      updates.push(`nombre = $${paramIndex++}`);
      values.push(nombre);
    }

    if (direccion) {
      updates.push(`direccion = $${paramIndex++}`);
      values.push(direccion);
    }

    if (telefono) {
      updates.push(`telefono = $${paramIndex++}`);
      values.push(telefono);
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: 'No hay campos para actualizar' },
        { status: 400 }
      );
    }

    values.push(cliente_id);
    
    const query = `
      UPDATE clientes 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await sql.unsafe(query, values);

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'Cliente no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      mensaje: 'Cliente actualizado',
      cliente: result[0]
    });

  } catch (error) {
    console.error('Error actualizando cliente:', error);
    return NextResponse.json(
      { error: 'Error actualizando cliente' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Eliminar cliente (solo desactivar, no eliminar físicamente)
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const cliente_id = searchParams.get('cliente_id');

    if (!cliente_id) {
      return NextResponse.json(
        { error: 'cliente_id requerido' },
        { status: 400 }
      );
    }

    // Desactivar en lugar de eliminar
    await sql`
      UPDATE clientes 
      SET activo = false
      WHERE id = ${cliente_id}
    `;

    return NextResponse.json({
      success: true,
      mensaje: 'Cliente desactivado'
    });

  } catch (error) {
    console.error('Error eliminando cliente:', error);
    return NextResponse.json(
      { error: 'Error eliminando cliente' },
      { status: 500 }
    );
  }
}
