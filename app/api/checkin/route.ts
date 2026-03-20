// ============================================================================
// app/api/checkin/route.ts
// ✅ POST  — registrar visita nueva
// ✅ PATCH — marcar synced O editar hubo_pedido/valor_pedido del mismo día
// ✅ GET   — health check
// ============================================================================

import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

function obtenerFechaColombia(): string {
  return new Date().toLocaleString('en-CA', {
    timeZone: 'America/Bogota'
  }).split(',')[0];
}

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
      valor_pedido,
      foto_url,
    } = body;

    console.log('📍 Checkin request recibido:', {
      asesor_id,
      cliente_id,
      lat,
      lng,
      hubo_pedido,
      valor_pedido,
      foto_url: foto_url ? '✓ con foto' : 'sin foto',
      offline_id: offline_id || 'ninguno'
    });

    if (!asesor_id || !cliente_id || lat == null || lng == null) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos', details: { asesor_id: !!asesor_id, cliente_id: !!cliente_id, lat: lat != null, lng: lng != null } },
        { status: 400 }
      );
    }

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);

    if (isNaN(latNum) || isNaN(lngNum)) {
      return NextResponse.json({ error: 'Las coordenadas deben ser números válidos' }, { status: 400 });
    }

    if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      return NextResponse.json({ error: 'Coordenadas fuera de rango válido' }, { status: 400 });
    }

    const huboPedidoBool = hubo_pedido === true || hubo_pedido === 'true';
    let valorPedidoNum = 0;

    if (huboPedidoBool) {
      if (valor_pedido == null || valor_pedido === '') {
        return NextResponse.json({ error: 'Si hubo pedido, debes especificar el valor' }, { status: 400 });
      }
      valorPedidoNum = parseFloat(valor_pedido);
      if (isNaN(valorPedidoNum) || valorPedidoNum < 0) {
        return NextResponse.json({ error: 'El valor del pedido debe ser un número positivo' }, { status: 400 });
      }
    }

    // Prevención de duplicados
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
          return NextResponse.json({ mensaje: 'Visita ya registrada previamente', visita: existe[0], duplicado: true });
        }
      } catch (error) {
        console.error('⚠️ Error verificando offline_id:', error);
      }
    }

    const clientes = await sql`
      SELECT id, codigo, nombre, lat, lng, radio_metros
      FROM clientes
      WHERE id = ${cliente_id} AND activo = true
    `;

    if (clientes.length === 0) {
      return NextResponse.json({ error: 'Cliente no encontrado o inactivo' }, { status: 404 });
    }

    const cliente = clientes[0];

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
      distanciaMetros = parseFloat(distanciaResult[0].distancia);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      if (errorMsg.includes('does not exist') || errorMsg.includes('function')) {
        return NextResponse.json({ error: 'Error calculando distancia', details: 'La función haversine_metros() no existe.' }, { status: 500 });
      }
      return NextResponse.json({ error: 'Error calculando distancia', details: errorMsg }, { status: 500 });
    }

    const validada = distanciaMetros <= cliente.radio_metros;

    const visitas = await sql`
      INSERT INTO visitas (
        asesor_id, cliente_id, lat_capturada, lng_capturada,
        distancia_metros, validada, notas, offline_id, synced,
        hubo_pedido, valor_pedido, foto_url
      ) VALUES (
        ${asesor_id}, ${cliente_id}, ${latNum}, ${lngNum},
        ${distanciaMetros}, ${validada}, ${notas ?? null},
        ${offline_id ?? null}, ${offline_id ? false : true},
        ${huboPedidoBool}, ${valorPedidoNum}, ${foto_url ?? null}
      )
      RETURNING *
    `;

    const visita = visitas[0];

    try {
      await sql`
        UPDATE rutas_dia
        SET completada = true
        WHERE asesor_id = ${asesor_id}
          AND cliente_id = ${cliente_id}
          AND fecha = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::date
      `;
    } catch (error) {
      console.error('⚠️ Error actualizando ruta del día:', error);
    }

    const emojiDistancia = validada ? '✅' : '⚠️';
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
        cliente: { id: cliente.id, codigo: cliente.codigo, nombre: cliente.nombre },
        distancia_metros: Math.round(distanciaMetros),
        validada,
        hubo_pedido: huboPedidoBool,
        valor_pedido: valorPedidoNum,
        foto_url: foto_url ?? null,
        timestamp: visita.timestamp,
      },
      mensajes: {
        distancia: `${emojiDistancia} ${validada ? `Visita validada — ${Math.round(distanciaMetros)}m` : `Visita fuera de rango — ${Math.round(distanciaMetros)}m`}`,
        pedido: mensajePedido
      }
    });

  } catch (error) {
    console.error('❌ Error en POST /api/checkin:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Error interno del servidor', message: errorMessage }, { status: 500 });
  }
}

// ============================================================================
// PATCH — editar visita del día O marcar synced
// ============================================================================
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { offline_id, visita_id, hubo_pedido, valor_pedido, asesor_id } = body;

    // ── Modo 1: marcar synced (uso interno del SW) ──────────────────────────
    if (offline_id && !visita_id) {
      const visitas = await sql`
        UPDATE visitas SET synced = true
        WHERE offline_id = ${offline_id}
        RETURNING *
      `;
      if (visitas.length === 0) {
        return NextResponse.json({ error: 'Visita no encontrada' }, { status: 404 });
      }
      return NextResponse.json({ success: true, mensaje: 'Visita marcada como sincronizada', visita: visitas[0] });
    }

    // ── Modo 2: editar hubo_pedido / valor_pedido del mismo día ────────────
    if (visita_id && asesor_id) {
      if (hubo_pedido == null) {
        return NextResponse.json({ error: 'hubo_pedido es requerido' }, { status: 400 });
      }

      const huboPedidoBool = hubo_pedido === true || hubo_pedido === 'true'
      let valorPedidoNum = 0

      if (huboPedidoBool) {
        if (valor_pedido == null || valor_pedido === '') {
          return NextResponse.json({ error: 'Si hubo pedido debes especificar el valor' }, { status: 400 });
        }
        valorPedidoNum = parseFloat(valor_pedido)
        if (isNaN(valorPedidoNum) || valorPedidoNum < 0) {
          return NextResponse.json({ error: 'El valor del pedido debe ser un número positivo' }, { status: 400 });
        }
      }

      // Solo permite editar visitas del mismo día en Colombia
      const fechaHoy = obtenerFechaColombia()

      const visitas = await sql`
        UPDATE visitas
        SET hubo_pedido = ${huboPedidoBool}, valor_pedido = ${valorPedidoNum}
        WHERE id = ${visita_id}
          AND asesor_id = ${asesor_id}
          AND (timestamp AT TIME ZONE 'America/Bogota')::date = ${fechaHoy}::date
        RETURNING *
      `

      if (visitas.length === 0) {
        return NextResponse.json(
          { error: 'Visita no encontrada o no pertenece a hoy' },
          { status: 404 }
        );
      }

      console.log(`✏️ Visita editada: ${visita_id} — hubo_pedido: ${huboPedidoBool}, valor: $${valorPedidoNum}`)

      return NextResponse.json({
        success: true,
        mensaje: 'Visita actualizada correctamente',
        visita: visitas[0]
      });
    }

    return NextResponse.json({ error: 'Parámetros insuficientes' }, { status: 400 });

  } catch (error) {
    console.error('❌ Error en PATCH /api/checkin:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Error interno del servidor', details: errorMessage }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/checkin',
    methods: ['POST', 'PATCH'],
    version: '4.0'
  });
}
