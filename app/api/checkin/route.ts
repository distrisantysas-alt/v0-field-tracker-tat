import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { asesor_id, cliente_id, lat, lng, notas } = body;

  if (!asesor_id || !cliente_id || lat == null || lng == null) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
  }

  // Obtener coordenadas y radio del cliente
  const [cliente] = await sql`
    SELECT lat, lng, radio_metros, nombre
    FROM clientes 
    WHERE id = ${cliente_id} AND activo = true
  `;

  if (!cliente) {
    return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
  }

  // Calcular distancia con Haversine (en la BD)
  const [{ distancia }] = await sql`
    SELECT haversine_metros(
      ${lat}, ${lng},
      ${cliente.lat}, ${cliente.lng}
    ) AS distancia
  `;

  const validada = distancia <= cliente.radio_metros;

  // Registrar la visita
  const [visita] = await sql`
    INSERT INTO visitas (
      asesor_id, cliente_id,
      lat_capturada, lng_capturada,
      distancia_metros, validada, notas
    ) VALUES (
      ${asesor_id}, ${cliente_id},
      ${lat}, ${lng},
      ${distancia}, ${validada}, ${notas ?? null}
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

  return NextResponse.json({
    visita,
    validada,
    distancia_metros: Math.round(distancia),
    mensaje: validada
      ? `✅ Visita validada — ${Math.round(distancia)}m del cliente`
      : `⚠️ Visita fuera de rango — ${Math.round(distancia)}m (máximo ${cliente.radio_metros}m)`,
  });
}
