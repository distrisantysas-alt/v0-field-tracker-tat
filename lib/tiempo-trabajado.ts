// ============================================================================
// lib/tiempo-trabajado.ts - Tiempo trabajado por asesor (funciones puras)
// La jornada de un dia va de la primera a la ultima gestion registrada
// (hora de Colombia). La pausa mas larga es el mayor rato entre dos gestiones
// seguidas; se informa aparte y NO se descuenta de la jornada.
// ============================================================================

export type Periodo = 'dia' | 'semana' | 'mes'

export interface DiaTrabajado {
  asesor_id: string
  nombre: string
  fecha: string          // AAAA-MM-DD
  inicio_min: number     // minutos desde la medianoche (primera gestion)
  fin_min: number        // minutos desde la medianoche (ultima gestion)
  visitas: number
  pausa_min: number      // pausa mas larga del dia (0 si hubo una sola gestion)
  pausa_desde_min: number | null
}

export interface ResumenAsesor {
  asesor_id: string
  nombre: string
  dias: number
  minutos_total: number
  minutos_promedio: number
  inicio_promedio_min: number
  fin_promedio_min: number
  visitas: number
  visitas_por_hora: number | null
  pausa_max_min: number
  pausa_max_fecha: string | null
  pausa_promedio_min: number
  detalle: DiaTrabajado[]
}

export function validarFecha(f: unknown): f is string {
  if (typeof f !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(f)) return false
  const d = new Date(f + 'T00:00:00Z')
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f
}

function sumarDias(fecha: string, n: number): string {
  const d = new Date(fecha + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Rango de fechas del periodo que contiene `fecha`. La semana va de lunes a domingo. */
export function rangoPeriodo(periodo: Periodo, fecha: string): { desde: string; hasta: string } {
  if (periodo === 'dia') return { desde: fecha, hasta: fecha }
  if (periodo === 'semana') {
    const dow = new Date(fecha + 'T00:00:00Z').getUTCDay() // 0 = domingo
    const desde = sumarDias(fecha, dow === 0 ? -6 : 1 - dow)
    return { desde, hasta: sumarDias(desde, 6) }
  }
  const [a, m] = fecha.split('-').map(Number)
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
  const mes = fecha.slice(0, 7)
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, '0')}` }
}

/** Fecha dentro del periodo anterior (delta = -1) o siguiente (delta = 1). */
export function moverPeriodo(periodo: Periodo, fecha: string, delta: number): string {
  if (periodo === 'dia') return sumarDias(fecha, delta)
  if (periodo === 'semana') return sumarDias(rangoPeriodo('semana', fecha).desde, 7 * delta)
  const [a, m] = fecha.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1 + delta, 1))
  return d.toISOString().slice(0, 10)
}

const prom = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0)

/** Agrupa los dias por asesor y calcula totales y promedios del periodo. */
export function resumirPorAsesor(dias: DiaTrabajado[]): ResumenAsesor[] {
  const porAsesor = new Map<string, DiaTrabajado[]>()
  for (const d of dias) {
    const lista = porAsesor.get(d.asesor_id) ?? []
    lista.push(d)
    porAsesor.set(d.asesor_id, lista)
  }

  const resumen: ResumenAsesor[] = []
  for (const [asesor_id, lista] of porAsesor) {
    lista.sort((x, y) => x.fecha.localeCompare(y.fecha))
    const minutos = lista.map(d => d.fin_min - d.inicio_min)
    const minutos_total = minutos.reduce((s, x) => s + x, 0)
    const visitas = lista.reduce((s, d) => s + d.visitas, 0)
    const mayor = lista.reduce((m, d) => (d.pausa_min > m.pausa_min ? d : m), lista[0])
    resumen.push({
      asesor_id,
      nombre: lista[0].nombre,
      dias: lista.length,
      minutos_total,
      minutos_promedio: prom(minutos),
      inicio_promedio_min: prom(lista.map(d => d.inicio_min)),
      fin_promedio_min: prom(lista.map(d => d.fin_min)),
      visitas,
      // con menos de una hora registrada el ritmo por hora no dice nada
      visitas_por_hora: minutos_total >= 60 ? visitas / (minutos_total / 60) : null,
      pausa_max_min: mayor.pausa_min,
      pausa_max_fecha: mayor.pausa_min > 0 ? mayor.fecha : null,
      pausa_promedio_min: prom(lista.map(d => d.pausa_min)),
      detalle: lista,
    })
  }
  return resumen.sort((x, y) => y.minutos_promedio - x.minutos_promedio || x.nombre.localeCompare(y.nombre))
}

/** 485 → "8 h 05 min" */
export function formatoDuracion(min: number): string {
  const m = Math.round(min)
  const h = Math.floor(m / 60)
  const r = m % 60
  if (h === 0) return `${r} min`
  return `${h} h ${String(r).padStart(2, '0')} min`
}

/** 485 → "8:05 a. m."; 935 → "3:35 p. m." */
export function formatoHora(min: number): string {
  const m = Math.round(min) % (24 * 60)
  const h24 = Math.floor(m / 60)
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(m % 60).padStart(2, '0')} ${h24 < 12 ? 'a. m.' : 'p. m.'}`
}
