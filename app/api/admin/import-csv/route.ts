// ============================================================================
// app/api/admin/import-csv/route.ts
// ✅ Acepta clientes SIN GPS (lat/lng = 0,0)
// ✅ Maneja campos con saltos de línea dentro de comillas
// ✅ Parsea formato: ID;CODIGO;USUARIO;ASESOR;DIA;RUTA;CLIENTE;TEL;DIR;...;UBICACIÓN
// ✅ Importación por lotes sin timeout
// ============================================================================

import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

function limpiarEmail(email: string | null): string | null {
  if (!email) return null;
  return String(email).toLowerCase().replace(/\\n/g, '').replace(/\n/g, '').trim();
}

function parsearCoordenadas(ubicacion: string | null): { lat: number; lng: number } | null {
  if (!ubicacion || ubicacion === 'NaN' || !ubicacion.trim()) return null;
  const coords = String(ubicacion).split(',').map(s => s.trim());
  if (coords.length !== 2) return null;
  const lat = parseFloat(coords[0]);
  const lng = parseFloat(coords[1]);
  if (isNaN(lat) || isNaN(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  // Evitar coordenadas con demasiada precisión que causan overflow
  return {
    lat: Math.round(lat * 1000000) / 1000000,
    lng: Math.round(lng * 1000000) / 1000000
  };
}

function parseCSV(text: string): any[] {
  // ── Paso 1: reparar campos con saltos de línea dentro de comillas ──
  // El CSV tiene emails como: "distriasesor67@gmail.com\n" partido en dos líneas
  const fixed = text.replace(/"([^"]*)\n([^"]*?)"/g, (_, a, b) => `"${a} ${b}"`);

  const lines = fixed.split('\n');
  if (lines.length < 3) return [];

  // Fila 0: título "LIDERANDO MI ZONA..."
  // Fila 1: headers reales
  const headerLine = lines[1];
  const headers = headerLine.split(';').map(h => {
    let clean = h.trim().replace(/"/g, '');
    if (clean.includes('UBICACI')) clean = 'UBICACIÓN';
    return clean;
  });

  const data = [];

  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(';').map(v => {
      let clean = v.trim().replace(/^"|"$/g, '');
      clean = clean.replace(/\n/g, '').replace(/\\n/g, '');
      return clean || null;
    });

    if (values.length < 6) continue;

    const row: any = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || null;
    });

    // Ignorar filas sin cliente
    if (!row['CLIENTE'] && !row['CODIGO CLIENTE']) continue;

    data.push(row);
  }

  return data;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, csvText, offset = 0 } = body;

    // ── ACCIÓN: parse ──────────────────────────────────────────────
    if (action === 'parse') {
      const jsonData = parseCSV(csvText);
      const conGPS = jsonData.filter(r => {
        const c = parsearCoordenadas(r['UBICACIÓN']);
        return c !== null;
      }).length;
      return NextResponse.json({
        success: true,
        action: 'parsed',
        total: jsonData.length,
        con_gps: conGPS,
        sin_gps: jsonData.length - conGPS,
        message: `CSV parseado: ${jsonData.length} filas (${conGPS} con GPS, ${jsonData.length - conGPS} sin GPS)`
      });
    }

    // ── ACCIÓN: import-batch ───────────────────────────────────────
    if (action === 'import-batch') {
      const BATCH_SIZE = 200;
      const jsonData = parseCSV(csvText);
      const batchData = jsonData.slice(offset, offset + BATCH_SIZE);

      // Asesores únicos en este lote
      const asesoresMap = new Map<string, string>();

      for (const row of batchData) {
        const email = limpiarEmail(row['USUARIO']);
        const nombre = row['ASESOR'];
        if (!email || asesoresMap.has(email)) continue;

        // Verificar si existe
        const existe = await sql`SELECT id FROM asesores WHERE email = ${email} LIMIT 1`;
        if (existe.length > 0) {
          asesoresMap.set(email, existe[0].id);
        } else {
          // Crear asesor nuevo si no existe
          try {
            const result = await sql`
              INSERT INTO asesores (nombre, email, zona, rol, activo)
              VALUES (${nombre || email.split('@')[0]}, ${email}, 'Colombia', 'asesor', true)
              ON CONFLICT (email) DO UPDATE SET nombre = EXCLUDED.nombre
              RETURNING id
            `;
            asesoresMap.set(email, result[0].id);
          } catch (e) {
            console.error(`Error creando asesor ${email}:`, e);
          }
        }
      }

      let clientesCreados = 0;
      let clientesOmitidos = 0;

      for (const row of batchData) {
        const codigo = row['CODIGO CLIENTE'];
        const nombre = row['CLIENTE'];

        if (!codigo || !nombre) { clientesOmitidos++; continue; }

        const email      = limpiarEmail(row['USUARIO']);
        const asesor_id  = email ? (asesoresMap.get(email) ?? null) : null;
        const coordenadas = parsearCoordenadas(row['UBICACIÓN']);

        // ✅ Si no hay GPS usamos 0,0 — el asesor lo captura en campo
        const lat = coordenadas ? coordenadas.lat : 0;
        const lng = coordenadas ? coordenadas.lng : 0;

        try {
          await sql`
            INSERT INTO clientes (codigo, nombre, direccion, telefono, lat, lng, asesor_id, radio_metros, activo)
            VALUES (
              ${codigo},
              ${nombre},
              ${row['DIRECCION'] || null},
              ${row['TELEFONO'] || null},
              ${lat},
              ${lng},
              ${asesor_id},
              50,
              true
            )
            ON CONFLICT (codigo) DO UPDATE SET
              nombre     = EXCLUDED.nombre,
              direccion  = EXCLUDED.direccion,
              telefono   = EXCLUDED.telefono,
              lat        = EXCLUDED.lat,
              lng        = EXCLUDED.lng,
              asesor_id  = EXCLUDED.asesor_id,
              activo     = true
          `;
          clientesCreados++;
        } catch (e) {
          console.error(`Error con cliente ${codigo}:`, e);
          clientesOmitidos++;
        }
      }

      const nextOffset = offset + BATCH_SIZE;
      const hasMore = nextOffset < jsonData.length;

      return NextResponse.json({
        success: true,
        action: 'batch-imported',
        imported: clientesCreados,
        omitted: clientesOmitidos,
        offset: nextOffset,
        hasMore,
        progress: Math.min(100, Math.round((nextOffset / jsonData.length) * 100)),
        total: jsonData.length
      });
    }

    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });

  } catch (error) {
    console.error('❌ Error en importación:', error);
    return NextResponse.json(
      { error: 'Error procesando archivo', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/admin/import-csv',
    methods: ['POST'],
    description: 'Importar clientes desde CSV por lotes'
  });
}
