// ============================================================================
// app/api/checkin/route.ts - API endpoint para registro de visitas
// ============================================================================
// Funcionalidades:
// ✅ Check-in con GPS y validación de distancia
// ✅ Soporte para visitas offline (offline_id)
// ✅ Registro de pedidos (hubo_pedido, valor_pedido)
// ✅ Validación de datos de entrada
// ✅ Manejo robusto de errores
// ✅ Prevención de duplicados
// ✅ Logs detallados
// ============================================================================

import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { 
      asesor_id, 
      cliente_id, 
      lat, 
      lng, 
      notas, 
      offline_id,
      hubo_pedido,
      valor_pedido 
    } = body;

    console.log('📍 Checkin request recibido:', { 
      asesor_id, 
      cliente_id, 
      lat, 
      lng, 
      hubo_pedido,
      valor_pedido,
      offline_id: offline_id || 'ninguno' 
    });

    // ========================================
    // VALIDACIÓN DE CAMPOS REQUERIDOS
    // ========================================
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

    // ========================================
    // VALIDACIÓN DE COORDENADAS
    // ========================================
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);

    if (isNaN(latNum) || isNaN(lngNum)) {
      console.error('❌ Coordenadas no son números válidos:', { lat, lng });
      return NextResponse.json(
        { error: 'Las coordenadas deben ser números válidos' },
        { status: 400 }
      );
    }

    if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      console.error('❌ Coordenadas fuera de rango:', { lat: latNum, lng: lngNum });
      return NextResponse.json(
        { error: 'Coordenadas fuera de rango válido' },
        { status: 400 }
      );
    }

    // ========================================
    // VALIDACIÓN DE PEDIDO
    // ========================================
    const huboPedidoBool = hubo_pedido === true || hubo_pedido === 'true';
    let valorPedidoNum = 0;

    if (huboPedidoBool) {
      if (valor_pedido == null || valor_pedido === '') {
        console.error('❌ Pedido marcado pero sin valor');
        return NextResponse.json(
          { error: 'Si hubo pedido, debes especificar el valor' },
          { status: 400 }
        );
      }

      valorPedidoNum = parseFloat(valor_pedido);
      
      if (isNaN(valorPedidoNum) || valorPedidoNum < 0) {
        console.error('❌ Valor de pedido inválido:', valor_pedido);
        return NextResponse.json(
          { error: 'El valor del pedido debe ser un número positivo' },
          { status: 400 }
        );
      }
    }

    // ========================================
    // PREVENCIÓN DE DUPLICADOS (offline)
    // ========================================
    if (offline_id) {
      try {
        const existe = await sql`
          SELECT id, timestamp, hubo_pedido, valor_pedido 
          FROM visitas 
          WHERE offline_id = ${offline_id}
          LIMIT 1
        `;
        
        if (existe.length > 0) {
          console.log(`⚠️ Visita ${offline_id} ya fue sincronizada, ignorando duplicado`);
          return NextResponse.json({
            mensaje: 'Visita ya registrada previamente',
            visita: existe[0],
            duplicado: true
          });
        }
      } catch (error) {
        console.error('⚠️ Error verificando offline_id:', error);
        // Continuar con la inserción de todos modos
      }
    }

    // ========================================
    // OBTENER DATOS DEL CLIENTE
    // ========================================
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

    // ========================================
    // CALCULAR DISTANCIA CON HAVERSINE
    // ========================================
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
            solucion: 'Ejecuta el script setup-database-COMPLETO.sql en Neon SQL Editor'
          },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { 
          error: 'Error calculando distancia',
          details: errorMsg
        },
        { status: 500 }
      );
    }

    const validada = distanciaMetros <= cliente.radio_metros;

    // ========================================
    // REGISTRAR LA VISITA
    // ========================================
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
        synced,
        hubo_pedido,
        valor_pedido
      ) VALUES (
        ${asesor_id}, 
        ${cliente_id},
        ${latNum}, 
        ${lngNum},
        ${distanciaMetros}, 
        ${validada}, 
        ${notas ?? null},
        ${offline_id ?? null},
        ${offline_id ? false : true},
        ${huboPedidoBool},
        ${valorPedidoNum}
      )
      RETURNING *
    `;

    const visita = visitas[0];
    console.log('💾 Visita registrada con ID:', visita.id);

    // ========================================
    // MARCAR RUTA COMO COMPLETADA
    // ========================================
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

    // ========================================
    // GENERAR MENSAJE DE RESPUESTA
    // ========================================
    const emojiDistancia = validada ? '✅' : '⚠️';
    const mensajeDistancia = validada
      ? `Visita validada — ${Math.round(distanciaMetros)}m del cliente`
      : `Visita fuera de rango — ${Math.round(distanciaMetros)}m (máximo ${cliente.radio_metros}m)`;

    const mensajePedido = huboPedidoBool 
      ? `💰 Pedido registrado: $${valorPedidoNum.toLocaleString('es-CO')}`
      : '📋 Visita sin pedido';

    console.log(
      `${emojiDistancia} Visita registrada:`,
      `Asesor ${asesor_id} → Cliente ${cliente.codigo} (${cliente.nombre})`,
      `Distancia: ${Math.round(distanciaMetros)}m`,
      mensajePedido,
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
        hubo_pedido: huboPedidoBool,
        valor_pedido: valorPedidoNum,
        timestamp: visita.timestamp,
      },
      mensajes: {
        distancia: `${emojiDistancia} ${mensajeDistancia}`,
        pedido: mensajePedido
      }
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

// ============================================================================
// PATCH - Marcar visitas offline como sincronizadas
// ============================================================================
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

// ============================================================================
// GET - Health check del endpoint
// ============================================================================
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/checkin',
    methods: ['POST', 'PATCH'],
    campos_requeridos: {
      POST: ['asesor_id', 'cliente_id', 'lat', 'lng'],
      POST_opcional: ['notas', 'offline_id', 'hubo_pedido', 'valor_pedido'],
      PATCH: ['offline_id']
    },
    version: '3.0'
  });
}
