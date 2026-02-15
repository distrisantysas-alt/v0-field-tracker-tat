import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const asesorId = req.nextUrl.searchParams.get('asesor_id');
  const fecha    = req.nextUrl.searchParams.get('fecha') 
                   ?? new Date().toISOString().split('T')[0];

  if (!asesorId) {
    return NextResponse.json({ error: 'asesor_id requerido' }, { status: 400 });
  }

  const clientes = await sql`
    SELECT 
      c.id,
      c.codigo,
      c.nombre,
      c.direccion,
      c.lat,
      c.lng,
      c.radio_metros,
      r.orden,
      r.completada,
      v.validada,
      v.distancia_metros,
      v.timestamp as visitado_en
    FROM rutas_dia r
    JOIN clientes c ON c.id = r.cliente_id
    LEFT JOIN visitas v 
      ON v.cliente_id = c.id 
      AND v.asesor_id = ${asesorId}
      AND v.timestamp::date = ${fecha}::date
    WHERE r.asesor_id = ${asesorId}
      AND r.fecha = ${fecha}::date
    ORDER BY r.orden ASC
  `;

  const stats = {
    total:       clientes.length,
    validadas:   clientes.filter(c => c.validada === true).length,
    sospechosas: clientes.filter(c => c.validada === false && c.visitado_en).length,
    pendientes:  clientes.filter(c => !c.visitado_en).length,
  };

  return NextResponse.json({ clientes, stats, fecha });
}

