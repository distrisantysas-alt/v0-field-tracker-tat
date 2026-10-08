// ============================================================================
// lib/rutas.ts - La "ruta" de un cliente sale del numero con que empieza su nombre
// (ej. "84A PANADERIA X" -> ruta "84A"). Es la misma regla en todas las pantallas.
// ============================================================================

export function rutaDe(nombre: string): string {
  const m = (nombre || '').match(/^(\d+)([A-Za-z]?)/)
  if (!m) return 'SIN-RUTA'
  return String(parseInt(m[1], 10)) + m[2].toUpperCase()
}

/** Orden natural de rutas: 1, 2, 10, 10A, 84... y SIN-RUTA al final. */
export function compararRutas(a: string, b: string): number {
  const f = (r: string): [number, string] => {
    const m = r.match(/^(\d+)([A-Z]*)$/)
    return m ? [parseInt(m[1], 10), m[2]] : [999999, r]
  }
  const [na, la] = f(a)
  const [nb, lb] = f(b)
  return na !== nb ? na - nb : la.localeCompare(lb)
}
