// ============================================================================
// app/api/resumen-dia/route.ts - Métricas diarias del asesor
// ============================================================================
// Endpoint para obtener el resumen de gestión del día:
// - Total de visitas realizadas
// - Visitas validadas (dentro del radio permitido)
// - Pedidos efectivos
// - Monto total vendido
// - Promedio por pedido
// - Lista detallada de visitas
// ============================================================================

import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const asesor_id = searchParams.get('asesor_id');
    const fecha = searchParams.get('fecha') || new Date().toISOString().split('T')[0];

    console.log('📊 GET /api/resumen-dia:', { asesor_id, fecha });

    // Validación
    if (!asesor_id) {
      return NextResponse.json(
        { error: 'asesor_id es requerido' },
        { status: 400 }
      );
    }

    // ========================================
    // OBTENER DATOS DEL ASESOR
    // ========================================
    const asesores = await sql`
      SELECT id, nombre, email, zona
      FROM asesores
      WHERE id = ${asesor_id} AND activo = true
    `;

    if (asesores.length === 0) {
      return NextResponse.json(
        { error: 'Asesor no encontrado o inactivo' },
        { status: 404 }
      );
    }

    const asesor = asesores[0];

    // ========================================
    // RESUMEN GENERAL DEL DÍA
    // ========================================
    const resumenResult = await sql`
      SELECT 
        COUNT(*) as total_visitas,
        COUNT(*) FILTER (WHERE validada = true) as visitas_validadas,
        COUNT(*) FILTER (WHERE hubo_pedido = true) as pedidos_efectivos,
        COALESCE(SUM(valor_pedido), 0) as total_vendido,
        COALESCE(
          AVG(valor_pedido) FILTER (WHERE hubo_pedido = true), 
          0
        ) as promedio_pedido,
        MIN(timestamp) as primera_visita,
        MAX(timestamp) as ultima_visita
      FROM visitas
      WHERE asesor_id = ${asesor_id}
        AND DATE(timestamp) = ${fecha}::date
    `;

    const resumen = resumenResult[0];

    // ========================================
    // LISTA DETALLADA DE VISITAS
    // ========================================
    const visitas = await sql`
      SELECT 
        v.id,
        v.timestamp,
        c.codigo as cliente_codigo,
        c.nombre as cliente_nombre,
        c.direccion as cliente_direccion,
        v.lat_capturada,
        v.lng_capturada,
        v.distancia_metros,
        v.validada,
        v.hubo_pedido,
        v.valor_pedido,
        v.notas,
        v.offline_id,
        v.synced
      FROM visitas v
      JOIN clientes c ON v.cliente_id = c.id
      WHERE v.asesor_id = ${asesor_id}
        AND DATE(v.timestamp) = ${fecha}::date
      ORDER BY v.timestamp ASC
    `;

    // ========================================
    // RUTAS ASIGNADAS VS COMPLETADAS
    // ========================================
    const rutasResult = await sql`
      SELECT 
        COUNT(*) as rutas_asignadas,
        COUNT(*) FILTER (WHERE completada = true) as rutas_completadas,
        COUNT(*) FILTER (WHERE completada = false) as rutas_pendientes
      FROM rutas_dia
      WHERE asesor_id = ${asesor_id}
        AND fecha = ${fecha}::date
    `;

    const rutas = rutasResult[0];

    // ========================================
    // CALCULAR MÉTRICAS ADICIONALES
    // ========================================
    const totalVisitas = parseInt(resumen.total_visitas);
    const visitasValidadas = parseInt(resumen.visitas_validadas);
    const pedidosEfectivos = parseInt(resumen.pedidos_efectivos);
    const totalVendido = parseFloat(resumen.total_vendido);
    const promedioPedido = parseFloat(resumen.promedio_pedido);

    const tasaValidacion = totalVisitas > 0 
      ? ((visitasValidadas / totalVisitas) * 100).toFixed(1)
      : '0.0';

    const tasaConversion = totalVisitas > 0 
      ? ((pedidosEfectivos / totalVisitas) * 100).toFixed(1)
      : '0.0';

    const cumplimientoRutas = parseInt(rutas.rutas_asignadas) > 0
      ? ((parseInt(rutas.rutas_completadas) / parseInt(rutas.rutas_asignadas)) * 100).toFixed(1)
      : '0.0';

    // ========================================
    // LOGS
    // ========================================
    console.log('📊 Resumen generado:', {
      asesor: asesor.nombre,
      fecha,
      total_visitas: totalVisitas,
      pedidos: pedidosEfectivos,
      total: `$${totalVendido.toLocaleString('es-CO')}`
    });

    // ========================================
    // RESPUESTA
    // ========================================
    return NextResponse.json({
      success: true,
      asesor: {
        id: asesor.id,
        nombre: asesor.nombre,
        email: asesor.email,
        zona: asesor.zona
      },
      fecha,
      metricas: {
        visitas: {
          total: totalVisitas,
          validadas: visitasValidadas,
          fuera_rango: totalVisitas - visitasValidadas,
          tasa_validacion: `${tasaValidacion}%`
        },
        pedidos: {
          efectivos: pedidosEfectivos,
          tasa_conversion: `${tasaConversion}%`,
          total_vendido: totalVendido,
          total_vendido_formato: `$${totalVendido.toLocaleString('es-CO')}`,
          promedio_pedido: Math.round(promedioPedido),
          promedio_pedido_formato: `$${Math.round(promedioPedido).toLocaleString('es-CO')}`
        },
        rutas: {
          asignadas: parseInt(rutas.rutas_asignadas),
          completadas: parseInt(rutas.rutas_completadas),
          pendientes: parseInt(rutas.rutas_pendientes),
          cumplimiento: `${cumplimientoRutas}%`
        },
        horarios: {
          primera_visita: resumen.primera_visita,
          ultima_visita: resumen.ultima_visita
        }
      },
      visitas: visitas.map(v => ({
        id: v.id,
        hora: new Date(v.timestamp).toLocaleTimeString('es-CO', { 
          hour: '2-digit', 
          minute: '2-digit' 
        }),
        timestamp: v.timestamp,
        cliente: {
          codigo: v.cliente_codigo,
          nombre: v.cliente_nombre,
          direccion: v.cliente_direccion
        },
        ubicacion: {
          lat: parseFloat(v.lat_capturada),
          lng: parseFloat(v.lng_capturada),
          distancia_metros: Math.round(parseFloat(v.distancia_metros || 0)),
          validada: v.validada
        },
        pedido: {
          hubo_pedido: v.hubo_pedido,
          valor: v.hubo_pedido ? parseFloat(v.valor_pedido) : 0,
          valor_formato: v.hubo_pedido 
            ? `$${parseFloat(v.valor_pedido).toLocaleString('es-CO')}` 
            : '$0'
        },
        notas: v.notas,
        sincronizada: v.synced
      }))
    });

  } catch (error) {
    console.error('❌ Error en GET /api/resumen-dia:', error);
    
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
// POST - Resumen por rango de fechas (OPCIONAL)
// ============================================================================
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { asesor_id, fecha_inicio, fecha_fin } = body;

    console.log('📊 POST /api/resumen-dia (rango):', { 
      asesor_id, 
      fecha_inicio, 
      fecha_fin 
    });

    if (!asesor_id || !fecha_inicio || !fecha_fin) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos: asesor_id, fecha_inicio, fecha_fin' },
        { status: 400 }
      );
    }

    // Resumen por rango de fechas
    const resumen = await sql`
      SELECT 
        DATE(timestamp) as fecha,
        COUNT(*) as total_visitas,
        COUNT(*) FILTER (WHERE validada = true) as visitas_validadas,
        COUNT(*) FILTER (WHERE hubo_pedido = true) as pedidos_efectivos,
        COALESCE(SUM(valor_pedido), 0) as total_vendido
      FROM visitas
      WHERE asesor_id = ${asesor_id}
        AND DATE(timestamp) BETWEEN ${fecha_inicio}::date AND ${fecha_fin}::date
      GROUP BY DATE(timestamp)
      ORDER BY DATE(timestamp) DESC
    `;

    // Totales del periodo
    const totales = await sql`
      SELECT 
        COUNT(*) as total_visitas,
        COUNT(*) FILTER (WHERE hubo_pedido = true) as pedidos_efectivos,
        COALESCE(SUM(valor_pedido), 0) as total_vendido
      FROM visitas
      WHERE asesor_id = ${asesor_id}
        AND DATE(timestamp) BETWEEN ${fecha_inicio}::date AND ${fecha_fin}::date
    `;

    return NextResponse.json({
      success: true,
      asesor_id,
      periodo: {
        inicio: fecha_inicio,
        fin: fecha_fin
      },
      totales: {
        visitas: parseInt(totales[0].total_visitas),
        pedidos: parseInt(totales[0].pedidos_efectivos),
        vendido: parseFloat(totales[0].total_vendido),
        vendido_formato: `$${parseFloat(totales[0].total_vendido).toLocaleString('es-CO')}`
      },
      por_dia: resumen.map(r => ({
        fecha: r.fecha,
        visitas: parseInt(r.total_visitas),
        validadas: parseInt(r.visitas_validadas),
        pedidos: parseInt(r.pedidos_efectivos),
        vendido: parseFloat(r.total_vendido),
        vendido_formato: `$${parseFloat(r.total_vendido).toLocaleString('es-CO')}`
      }))
    });

  } catch (error) {
    console.error('❌ Error en POST /api/resumen-dia:', error);
    
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
