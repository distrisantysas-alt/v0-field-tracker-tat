// ============================================================================
// app/api/admin/rutas/route.ts
// GET → universo completo de clientes agrupado por número de ruta (no solo
// el historial reciente): para que el supervisor identifique clientes sin
// visitar o con muchas visitas sin pedido, y decida a quién asignárselos.
// ============================================================================
import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireSesion } from '@/lib/auth'

function rutaDe(nombre: string): string {
  const m = (nombre || '').match(/^(\d+)([A-Za-z]?)/)
  if (!m) return 'SIN-RUTA'
  return String(parseInt(m[1], 10)) + m[2].toUpperCase()
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSesion(req, ['supervisor', 'gerencia'])
    if (auth instanceof NextResponse) return auth

    // La última gestión (de CUALQUIER asesor, no solo el actual) viaja con el
    // cliente: así quien lo reciba después ve que ya se intentó algo antes,
    // sin importar quién lo haya hecho.
    const rows = await sql`
      SELECT
        c.id, c.codigo, c.nombre, c.direccion, c.lat, c.lng,
        c.asesor_id, a.nombre AS asesor_nombre,
        COUNT(v.id) AS total_visitas,
        COUNT(v.id) FILTER (WHERE v.hubo_pedido) AS total_pedidos,
        MAX(v.timestamp) AS ultima_visita,
        ug.estado AS ultima_gestion_estado,
        ug.asesor_gestion_nombre AS ultima_gestion_asesor,
        ug.updated_at AS ultima_gestion_fecha
      FROM clientes c
      LEFT JOIN asesores a ON a.id = c.asesor_id
      LEFT JOIN visitas v ON v.cliente_id = c.id
      LEFT JOIN LATERAL (
        SELECT ag.estado, ag.updated_at, ag2.nombre AS asesor_gestion_nombre
        FROM asignaciones ag
        JOIN asesores ag2 ON ag2.id = ag.asesor_id
        WHERE ag.cliente_id = c.id
        ORDER BY ag.updated_at DESC
        LIMIT 1
      ) ug ON true
      WHERE c.activo = true
      GROUP BY c.id, c.codigo, c.nombre, c.direccion, c.lat, c.lng, c.asesor_id, a.nombre,
               ug.estado, ug.asesor_gestion_nombre, ug.updated_at
    `

    const rutas = new Map<string, any[]>()
    const ahora = Date.now()

    for (const row of rows) {
      const ruta = rutaDe(row.nombre)
      const totalVisitas = Number(row.total_visitas)
      const totalPedidos = Number(row.total_pedidos)
      const visitasSinPedido = totalVisitas - totalPedidos
      const nuncaVisitado = totalVisitas === 0
      const diasSinVisita = row.ultima_visita
        ? Math.floor((ahora - new Date(row.ultima_visita).getTime()) / 86400000)
        : null

      let motivo: string
      if (nuncaVisitado) motivo = 'sin_visitar'
      else if (visitasSinPedido > 10) motivo = 'depurar'
      else if (totalPedidos === 0) motivo = 'sin_pedido'
      else motivo = 'normal'

      if (!rutas.has(ruta)) rutas.set(ruta, [])
      rutas.get(ruta)!.push({
        id: row.id, codigo: row.codigo, nombre: row.nombre, direccion: row.direccion,
        lat: row.lat, lng: row.lng,
        asesorId: row.asesor_id, asesorNombre: row.asesor_nombre,
        totalVisitas, totalPedidos, visitasSinPedido, nuncaVisitado, diasSinVisita, motivo,
        ultimaGestion: row.ultima_gestion_estado ? {
          estado: row.ultima_gestion_estado,
          asesor: row.ultima_gestion_asesor,
          fecha: row.ultima_gestion_fecha,
        } : null,
      })
    }

    for (const clientes of rutas.values()) {
      clientes.sort((a, b) => {
        if (a.nuncaVisitado !== b.nuncaVisitado) return a.nuncaVisitado ? -1 : 1
        return b.visitasSinPedido - a.visitasSinPedido
      })
    }

    function ordenRuta(r: string): [number, string] {
      const m = r.match(/^(\d+)([A-Z]*)$/)
      if (!m) return [999999, r]
      return [parseInt(m[1], 10), m[2]]
    }

    const rutasOrdenadas = [...rutas.keys()].sort((a, b) => {
      const [na, la] = ordenRuta(a)
      const [nb, lb] = ordenRuta(b)
      if (na !== nb) return na - nb
      return la.localeCompare(lb)
    })

    const data = rutasOrdenadas.map(ruta => {
      const clientes = rutas.get(ruta)!
      return {
        ruta,
        totalClientes: clientes.length,
        sinVisitar: clientes.filter(c => c.nuncaVisitado).length,
        depurarCandidatos: clientes.filter(c => c.motivo === 'depurar').length,
        clientes: clientes.slice(0, 400), // límite de seguridad para rutas gigantes
      }
    })

    return NextResponse.json({ success: true, rutas: data })
  } catch (error) {
    console.error('❌ Error en GET /api/admin/rutas:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: 'Error interno', details: msg }, { status: 500 })
  }
}
