// ============================================================================
// app/api/checkin/route.ts - API endpoint para registro de visitas
// ============================================================================
// Mejoras aplicadas:
// ✅ Soporte para visitas offline (offline_id)
// ✅ Validación de datos de entrada
// ✅ Manejo robusto de errores con detalles para debugging
// ✅ Logs detallados
// ✅ Prevención de duplicados
// ✅ GPS timeout mejorado (manejado en cliente)
// ✅ Verificación de función haversine_metros con mensaje claro
// ============================================================================

import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { asesor_id, cliente_id, lat, lng, notas, offline_id } = body;

    console.log('📍 Checkin request recibido:', { 
      asesor_id, 
      cliente_id, 
      lat, 
      lng, 
      offline_id: offline_id || 'ninguno' 
    });

    // Validación de campos requeridos
    if (!asesor_id || !cliente_id || lat == null || lng == null) {
      console.error('❌ Campos requeridos faltantes:', { asesor_id, cliente_id, lat, lng });
      return NextResponse.json(
        { 
          error: 'Faltan campos requeridos',
          details: { 
            asesor_id: !!asesor_id, 
            cliente_id: !!cliente_id, 
            lat: lat != null, 
            lng: lng != null 
          }
        },
        { status: 400 }
      );
    }

    // Convertir a números y validar
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);

    if (isNaN(latNum) || isNaN(lngNum)) {
      console.error('❌ Coordenadas no son números válidos:', { lat, lng });
      return NextResponse.json(
        { error: 'Las coordenadas deben ser números válidos' },
        { status: 400 }
      );
    }

    // Validación de rango de coordenadas
    if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      console.error('❌ Coordenadas fuera de rango:', { lat: latNum, lng: lngNum });
      return NextResponse.json(
        { error: 'Coordenadas fuera de rango válido' },
        { status: 400 }
      );
    }

    // Si viene con offline_id, verificar que no se haya sincronizado antes
    if (offline_id) {
      try {
        const existe = await sql`
          SELECT id FROM visitas 
          WHERE offline_id = ${offline_id}
          LIMIT 1
        `;
        
        if (existe.length > 0) {
          console.log(`⚠️ Visita ${offline_id} ya fue sincronizada, ignorando duplicado`);
          return NextResponse.json({
            mensaje: 'Visita ya registrada previamente',
            visita: existe[0],
          });
        }
      } catch (error) {
        console.error('⚠️ Error verificando offline_id:', error);
        // Continuar con la inserción de todos modos
      }
    }

    // Obtener datos del cliente
    const clientes = await sql`
      SELECT id, codigo, nombre, lat, lng, radio_metros
      FROM clientes 
      WHERE id = ${cliente_id} AND activo = true
    `;

    if (clientes.length === 0) {
      console.error(`❌ Cliente ${cliente_id} no encontrado o inactivo`);
      return NextResponse.json(
        { error: 'Cliente no encontrado o inactivo' },
        { status: 404 }
      );
    }

    const cliente = clientes[0];
    console.log('✅ Cliente encontrado:', { 
      codigo: cliente.codigo, 
      nombre: cliente.nombre,
      radio_metros: cliente.radio_metros 
    });

    // Calcular distancia usando la función Haversine en PostgreSQL
    let distanciaMetros = 0;
    try {
      const distanciaResult = await sql`
        SELECT haversine_metros(
          ${latNum}::double precision, 
          ${lngNum}::double precision,
          ${cliente.lat}::double precision, 
          ${cliente.lng}::double precision
        ) AS distancia
      `;

      if (distanciaResult.length === 0) {
        throw new Error('La función haversine_metros no retornó resultados');
      }

      distanciaMetros = parseFloat(distanciaResult[0].distancia);
      console.log('📏 Distancia calculada:', distanciaMetros, 'metros');

    } catch (error) {
      console.error('❌ Error calculando distancia con haversine_metros:', error);
      
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      
      // Mensaje específico si la función no existe
      if (errorMsg.includes('does not exist') || errorMsg.includes('function')) {
        return NextResponse.json(
          { 
            error: 'Error calculando distancia',
            details: 'La función haversine_metros() no existe en la base de datos.',
            solucion: 'Ejecuta el siguiente SQL en Neon:\n\n' +
                     'CREATE OR REPLACE FUNCTION haversine_metros(\n' +
                     '  lat1 DOUBLE PRECISION, lon1 DOUBLE PRECISION,\n' +
                     '  lat2 DOUBLE PRECISION, lon2 DOUBLE PRECISION\n' +
                     ') RETURNS DOUBLE PRECISION AS $$\n' +
                     'DECLARE\n' +
                     '  R CONSTANT DOUBLE PRECISION := 6371000;\n' +
                     '  dLat DOUBLE PRECISION; dLon DOUBLE PRECISION;\n' +
                     '  a DOUBLE PRECISION; c DOUBLE PRECISION;\n' +
                     'BEGIN\n' +
                     '  dLat := radians(lat2 - lat1);\n' +
                     '  dLon := radians(lon2 - lon1);\n' +
                     '  a := sin(dLat/2) * sin(dLat/2) +\n' +
                     '       cos(radians(lat1)) * cos(radians(lat2)) *\n' +
                     '       sin(dLon/2) * sin(dLon/2);\n' +
                     '  c := 2 * atan2(sqrt(a), sqrt(1-a));\n' +
                     '  RETURN R * c;\n' +
                     'END;\n' +
                     '$$ LANGUAGE plpgsql IMMUTABLE;'
          },
          { status: 500 }
        );
      }

      // Otros errores de base de datos
      return NextResponse.json(
        { 
          error: 'Error calculando distancia',
          details: errorMsg
        },
        { status: 500 }
      );
    }

    const validada = distanciaMetros <= cliente.radio_metros;

    // Registrar la visita
    const visitas = await sql`
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
        ${latNum}, 
        ${lngNum},
        ${distanciaMetros}, 
        ${validada}, 
        ${notas ?? null},
        ${offline_id ?? null},
        ${offline_id ? false : true}
      )
      RETURNING *
    `;

    const visita = visitas[0];
    console.log('💾 Visita registrada con ID:', visita.id);

    // Marcar como completada en la ruta del día
    try {
      const rutasActualizadas = await sql`
        UPDATE rutas_dia 
        SET completada = true
        WHERE asesor_id = ${asesor_id}
          AND cliente_id = ${cliente_id}
          AND fecha = CURRENT_DATE
        RETURNING id
      `;

      if (rutasActualizadas.length > 0) {
        console.log('✅ Ruta del día marcada como completada');
      } else {
        console.log('⚠️ No se encontró ruta del día para actualizar (puede ser normal)');
      }
    } catch (error) {
      console.error('⚠️ Error actualizando ruta del día (continuando de todos modos):', error);
      // No fallar toda la operación por esto
    }

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
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    return NextResponse.json(
      { 
        error: 'Error interno del servidor',
        message: errorMessage,
        stack: process.env.NODE_ENV === 'development' ? errorStack : undefined
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

    console.log('🔄 PATCH /api/checkin - Sincronizando offline_id:', offline_id);

    if (!offline_id) {
      return NextResponse.json(
        { error: 'offline_id requerido' },
        { status: 400 }
      );
    }

    const visitas = await sql`
      UPDATE visitas
      SET synced = true
      WHERE offline_id = ${offline_id}
      RETURNING *
    `;

    if (visitas.length === 0) {
      console.error('❌ Visita con offline_id no encontrada:', offline_id);
      return NextResponse.json(
        { error: 'Visita no encontrada' },
        { status: 404 }
      );
    }

    const visita = visitas[0];
    console.log('✅ Visita marcada como sincronizada:', visita.id);

    return NextResponse.json({
      success: true,
      mensaje: 'Visita marcada como sincronizada',
      visita,
    });

  } catch (error) {
    console.error('❌ Error en PATCH /api/checkin:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { 
        error: 'Error interno del servidor',
        details: errorMessage
      },
      { status: 500 }
    );
  }
}

// Método GET para health check del endpoint
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/checkin',
    methods: ['POST', 'PATCH'],
    version: '2.0'
  });
}
