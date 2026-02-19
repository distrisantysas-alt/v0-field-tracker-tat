// ============================================================================
// app/api/admin/import-csv/route.ts
// ============================================================================
// Endpoint para importar clientes masivamente desde CSV
// Sin dependencias externas - parsing nativo
// ============================================================================

import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Limpiar email
 */
function limpiarEmail(email: string | null): string | null {
  if (!email) return null;
  return String(email)
    .toLowerCase()
    .replace(/\\n/g, '')
    .replace(/\n/g, '')
    .trim();
}

/**
 * Parsear coordenadas "7.087582, -73.166427"
 */
function parsearCoordenadas(ubicacion: string | null): { lat: number; lng: number } | null {
  if (!ubicacion || ubicacion === 'NaN' || !ubicacion.trim()) return null;
  
  const coords = String(ubicacion).split(',').map(s => s.trim());
  if (coords.length !== 2) return null;
  
  const lat = parseFloat(coords[0]);
  const lng = parseFloat(coords[1]);
  
  if (isNaN(lat) || isNaN(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  
  return { lat, lng };
}

/**
 * Parsear CSV a array de objetos
 */
function parseCSV(text: string): any[] {
  const lines = text.split('\n');
  if (lines.length < 3) return [];
  
  // Saltar primeras 2 filas decorativas, headers en fila 3
  const headers = lines[2].split(',').map(h => h.trim().replace(/"/g, ''));
  
  const data = [];
  
  for (let i = 3; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
    
    if (values.length < headers.length) continue;
    
    const row: any = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || null;
    });
    
    data.push(row);
  }
  
  return data;
}

/**
 * POST - Importar CSV
 */
export async function POST(req: NextRequest) {
  try {
    console.log('📤 Iniciando importación desde CSV...');

    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No se recibió archivo' },
        { status: 400 }
      );
    }

    if (!file.name.endsWith('.csv')) {
      return NextResponse.json(
        { error: 'El archivo debe ser CSV (.csv)' },
        { status: 400 }
      );
    }

    const text = await file.text();
    const jsonData = parseCSV(text);

    console.log(`📊 Encontradas ${jsonData.length} filas en CSV`);

    if (jsonData.length === 0) {
      return NextResponse.json(
        { error: 'El CSV está vacío o tiene formato incorrecto' },
        { status: 400 }
      );
    }

    // Extraer asesores únicos
    const asesoresMap = new Map<string, string>();
    const asesoresUnicos: Array<{ email: string; nombre: string }> = [];

    for (const row of jsonData) {
      const email = limpiarEmail(row.USUARIO);
      const nombre = row.ASESOR;
      
      if (email && !asesoresMap.has(email)) {
        asesoresMap.set(email, 'pending');
        asesoresUnicos.push({
          email,
          nombre: nombre || email.split('@')[0]
        });
      }
    }

    console.log(`👥 ${asesoresUnicos.length} asesores únicos encontrados`);

    // Importar asesores
    let asesoresCreados = 0;
    for (const asesor of asesoresUnicos) {
      try {
        const result = await sql`
          INSERT INTO asesores (nombre, email, zona, rol, activo)
          VALUES (
            ${asesor.nombre},
            ${asesor.email},
            'Colombia',
            'asesor',
            true
          )
          ON CONFLICT (email) DO UPDATE
          SET nombre = EXCLUDED.nombre
          RETURNING id
        `;
        
        asesoresMap.set(asesor.email, result[0].id);
        asesoresCreados++;
      } catch (error) {
        console.error(`Error creando asesor ${asesor.email}:`, error);
      }
    }

    console.log(`✅ ${asesoresCreados} asesores procesados`);

    // Importar clientes (SOLO con GPS)
    let clientesCreados = 0;
    let clientesOmitidos = 0;

    for (const row of jsonData) {
      const codigo = row['CODIGO CLIENTE'];
      const nombre = row.CLIENTE;
      const email = limpiarEmail(row.USUARIO);
      const coordenadas = parsearCoordenadas(row['UBICACIÓN']);

      // FILTRO: Solo importar con coordenadas
      if (!coordenadas) {
        clientesOmitidos++;
        continue;
      }

      if (!codigo || !nombre) continue;

      const asesor_id = email ? asesoresMap.get(email) : null;

      try {
        await sql`
          INSERT INTO clientes (
            codigo,
            nombre,
            direccion,
            telefono,
            lat,
            lng,
            asesor_id,
            radio_metros,
            activo
          ) VALUES (
            ${codigo},
            ${nombre},
            ${row.DIRECCION || null},
            ${row.TELEFONO || null},
            ${coordenadas.lat},
            ${coordenadas.lng},
            ${asesor_id},
            50,
            true
          )
          ON CONFLICT (codigo) DO UPDATE
          SET 
            nombre = EXCLUDED.nombre,
            direccion = EXCLUDED.direccion,
            lat = EXCLUDED.lat,
            lng = EXCLUDED.lng,
            asesor_id = EXCLUDED.asesor_id
        `;

        clientesCreados++;
      } catch (error) {
        console.error(`Error con cliente ${codigo}:`, error);
      }
    }

    console.log(`✅ Importación completada`);

    return NextResponse.json({
      success: true,
      mensaje: 'Importación exitosa',
      stats: {
        asesores: asesoresCreados,
        clientes_importados: clientesCreados,
        clientes_omitidos: clientesOmitidos,
        total_procesado: jsonData.length
      }
    });

  } catch (error) {
    console.error('❌ Error en importación:', error);
    
    return NextResponse.json(
      { 
        error: 'Error procesando archivo',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ 
    endpoint: '/api/admin/import-csv',
    methods: ['POST'],
    description: 'Importar clientes desde CSV'
  });
}
