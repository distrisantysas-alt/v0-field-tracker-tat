// ============================================================================
// app/api/checkin/route.ts - API endpoint para registro de visitas
// ============================================================================
// Mejoras:
// ✅ Soporte para visitas offline (offline_id)
// ✅ Validación de datos de entrada
// ✅ Manejo robusto de errores
// ✅ Logs detallados
// ✅ Prevención de duplicados
// ============================================================================

import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { asesor_id, cliente_id, lat, lng, notas, offline_id } = body;

    // Validación de campos requeridos
    if (!asesor_id || !cliente_id || lat == null || lng == null) {
      return NextResponse.json(
        { 
          error: 'Faltan campos requeridos',
          details: { asesor_id, cliente_id, lat, lng }
        },
        { status: 400 }
      );
    }

    // Validación de coordenadas
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json(
        { error: 'Coordenadas inválidas' },
        { status: 400 }
      );
    }

    // Si viene con offline_id, verificar que no se haya sincronizado antes
    if (offline_id) {
      const [existe] = await sql`
        SELECT id FROM visitas 
        WHERE offline_id = ${offline_id}
        LIMIT 1
      `;
      
      if (existe) {
        console.log(`⚠️ Visita ${offline_id} ya fue sincronizada, ignorando duplicado`);
        return NextResponse.json({
          mensaje: 'Visita ya registrada previamente',
          visita: existe,
        });
      }
    }

    // Obtener datos del cliente
    const [cliente] = await sql`
      SELECT id, codigo, nombre, lat, lng, radio_metros
      FROM clientes 
      WHERE id = ${cliente_id} AND activo = true
    `;

    if (!cliente) {
      return NextResponse.json(
        { error: 'Cliente no encontrado o inactivo' },
        { status: 404 }
      );
    }

    // Calcular distancia usando la función Haversine en PostgreSQL
    const [{ distancia }] = await sql`
      SELECT haversine_metros(
        ${lat}, ${lng},
        ${cliente.lat}, ${cliente.lng}
      ) AS distancia
    `;

    const distanciaMetros = parseFloat(distancia);
    const validada = distanciaMetros <= cliente.radio_metros;

    // Registrar la visita
    const [visita] = await sql`
      INSERT INTO visitas (
        asesor_id, 
        cliente_id,
        lat_capturada, 
        lng_capturada,
        distancia_metros, 
        validada, 
        notas,
        offline_id,
        synced
      ) VALUES (
        ${asesor_id}, 
        ${cliente_id},
        ${lat}, 
        ${lng},
        ${distanciaMetros}, 
        ${validada}, 
        ${notas ?? null},
        ${offline_id ?? null},
        ${offline_id ? false : true}
      )
      RETURNING *
    `;

    // Marcar como completada en la ruta del día
    await sql`
      UPDATE rutas_dia 
      SET completada = true
      WHERE asesor_id = ${asesor_id}
        AND cliente_id = ${cliente_id}
        AND fecha = CURRENT_DATE
    `;

    // Log del resultado
    const emoji = validada ? '✅' : '⚠️';
    const mensaje = validada
      ? `Visita validada — ${Math.round(distanciaMetros)}m del cliente`
      : `Visita fuera de rango — ${Math.round(distanciaMetros)}m (máximo ${cliente.radio_metros}m)`;

    console.log(
      `${emoji} Visita registrada:`,
      `Asesor ${asesor_id} → Cliente ${cliente.codigo} (${cliente.nombre})`,
      `Distancia: ${Math.round(distanciaMetros)}m`,
      offline_id ? `[OFFLINE: ${offline_id}]` : '[ONLINE]'
    );

    return NextResponse.json({
      success: true,
      visita: {
        id: visita.id,
        cliente: {
          id: cliente.id,
          codigo: cliente.codigo,
          nombre: cliente.nombre,
        },
        distancia_metros: Math.round(distanciaMetros),
        validada,
        timestamp: visita.timestamp,
      },
      mensaje: `${emoji} ${mensaje}`,
    });

  } catch (error) {
    console.error('❌ Error en POST /api/checkin:', error);
    
    return NextResponse.json(
      { 
        error: 'Error interno del servidor',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Endpoint adicional para marcar visitas offline como sincronizadas
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { offline_id } = body;

    if (!offline_id) {
      return NextResponse.json(
        { error: 'offline_id requerido' },
        { status: 400 }
      );
    }

    const [visita] = await sql`
      UPDATE visitas
      SET synced = true
      WHERE offline_id = ${offline_id}
      RETURNING *
    `;

    if (!visita) {
      return NextResponse.json(
        { error: 'Visita no encontrada' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      mensaje: 'Visita marcada como sincronizada',
      visita,
    });

  } catch (error) {
    console.error('❌ Error en PATCH /api/checkin:', error);
    
    return NextResponse.json(
      { 
        error: 'Error interno del servidor',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
