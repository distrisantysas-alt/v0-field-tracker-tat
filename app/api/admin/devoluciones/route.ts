// ============================================================================
// app/api/admin/devoluciones/route.ts
// POST → el supervisor carga las devoluciones (notas credito / anulaciones)
// que salieron del CSV del POS. El navegador ya filtra solo esas filas, asi
// el cuerpo es pequeno. Volver a cargar el mismo mes no duplica nada: la
// clave es el "ID de Venta" del POS.
// ============================================================================
import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireSesion } from '@/lib/auth'

const MAX_FILAS = 5000

function normalizarNombre(s: string): string {
  return (s || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

type Fila = {
  idVenta: string
  prefijo?: string
  numero?: string
  fecha: string
  asesorPos?: string
  cliente?: string
  nit?: string
  valor: number
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSesion(req, ['supervisor', 'gerencia'])
    if (auth instanceof NextResponse) return auth

    const body = await req.json()
    const entrada: Fila[] = body.devoluciones
    if (!Array.isArray(entrada) || entrada.length === 0) {
      return NextResponse.json({ error: 'devoluciones (array) es requerido' }, { status: 400 })
    }
    if (entrada.length > MAX_FILAS) {
      return NextResponse.json({ error: `Máximo ${MAX_FILAS} devoluciones por carga` }, { status: 400 })
    }

    const validas = entrada.filter(
      f => f && f.idVenta && /^\d{4}-\d{2}-\d{2}$/.test(f.fecha) && Number.isFinite(Number(f.valor))
    )
    if (validas.length === 0) {
      return NextResponse.json({ error: 'Ninguna fila tiene ID, fecha (AAAA-MM-DD) y valor válidos' }, { status: 400 })
    }

    // Alias explícitos (tabla asesor_alias) y, si no hay, nombre exacto único en asesores.
    const aliasRows = await sql`SELECT alias_norm, asesor_id FROM asesor_alias`
    const alias = new Map<string, string>(aliasRows.map((r: any) => [r.alias_norm, r.asesor_id]))

    const asesoresRows = await sql`SELECT id, nombre FROM asesores WHERE activo = true`
    const porNombre = new Map<string, string[]>()
    for (const a of asesoresRows as any[]) {
      const k = normalizarNombre(a.nombre)
      porNombre.set(k, [...(porNombre.get(k) ?? []), a.id])
    }

    function resolverAsesor(nombrePos: string): string {
      const k = normalizarNombre(nombrePos)
      if (alias.has(k)) return alias.get(k)!
      const m = porNombre.get(k)
      return m && m.length === 1 ? m[0] : ''
    }

    const ids: string[] = [], pref: string[] = [], num: string[] = [], fechas: string[] = []
    const asesoresPos: string[] = [], asesoresNorm: string[] = [], asesoresId: string[] = []
    const clientes: string[] = [], nits: string[] = [], valores: string[] = []

    for (const f of validas) {
      const nombrePos = (f.asesorPos ?? '').trim()
      ids.push(String(f.idVenta))
      pref.push(f.prefijo ?? '')
      num.push(f.numero ?? '')
      fechas.push(f.fecha)
      asesoresPos.push(nombrePos)
      asesoresNorm.push(normalizarNombre(nombrePos))
      asesoresId.push(resolverAsesor(nombrePos))
      clientes.push(f.cliente ?? '')
      nits.push(f.nit ?? '')
      valores.push(String(Number(f.valor)))
    }

    const yaExistian = await sql`SELECT COUNT(*)::int AS n FROM devoluciones_pos WHERE id_venta = ANY(${ids}::text[])`

    await sql`
      INSERT INTO devoluciones_pos
        (id_venta, prefijo, numero, fecha, asesor_pos, asesor_pos_norm, asesor_id, cliente, nit, valor, importado_por)
      SELECT t.id_venta, t.prefijo, t.numero, t.fecha::date, t.asesor_pos, t.asesor_pos_norm,
             NULLIF(t.asesor_id, '')::uuid, t.cliente, t.nit, t.valor::numeric, ${auth.asesorId}::uuid
      FROM unnest(
        ${ids}::text[], ${pref}::text[], ${num}::text[], ${fechas}::text[], ${asesoresPos}::text[],
        ${asesoresNorm}::text[], ${asesoresId}::text[], ${clientes}::text[], ${nits}::text[], ${valores}::text[]
      ) AS t(id_venta, prefijo, numero, fecha, asesor_pos, asesor_pos_norm, asesor_id, cliente, nit, valor)
      ON CONFLICT (id_venta) DO UPDATE SET
        prefijo = EXCLUDED.prefijo, numero = EXCLUDED.numero, fecha = EXCLUDED.fecha,
        asesor_pos = EXCLUDED.asesor_pos, asesor_pos_norm = EXCLUDED.asesor_pos_norm,
        asesor_id = COALESCE(EXCLUDED.asesor_id, devoluciones_pos.asesor_id),
        cliente = EXCLUDED.cliente, nit = EXCLUDED.nit, valor = EXCLUDED.valor
    `

    // Si se agregó un alias después de una carga anterior, reasigna lo que había quedado sin asesor.
    await sql`
      UPDATE devoluciones_pos d
      SET asesor_id = al.asesor_id
      FROM asesor_alias al
      WHERE d.asesor_id IS NULL AND d.asesor_pos_norm = al.alias_norm
    `

    const sinAsesor = await sql`
      SELECT asesor_pos, COUNT(*)::int AS cantidad
      FROM devoluciones_pos
      WHERE id_venta = ANY(${ids}::text[]) AND asesor_id IS NULL
      GROUP BY asesor_pos
      ORDER BY cantidad DESC
    `

    const fechasOrdenadas = [...fechas].sort()
    const nuevas = validas.length - Number((yaExistian[0] as any).n)

    return NextResponse.json({
      success: true,
      recibidas: entrada.length,
      validas: validas.length,
      nuevas,
      actualizadas: validas.length - nuevas,
      rango: { desde: fechasOrdenadas[0], hasta: fechasOrdenadas[fechasOrdenadas.length - 1] },
      sinAsesor: (sinAsesor as any[]).map(r => ({ asesor: r.asesor_pos || '(vacío)', cantidad: r.cantidad })),
    })
  } catch (error) {
    console.error('❌ Error en POST /api/admin/devoluciones:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: 'Error interno', details: msg }, { status: 500 })
  }
}
