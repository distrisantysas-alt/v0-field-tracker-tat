// ============================================================================
// lib/incentivos.ts - Reglas de incentivo y su evaluacion (funciones puras)
// Una regla es una ESCALA de niveles (cada nivel: condiciones + monto; se paga el
// mayor nivel cumplido) o un PAGO POR UNIDAD (monto por cada activacion, visita...).
// Las metricas las calcula lib/metricas.ts; aqui solo se decide cuanto se paga.
// ============================================================================

export type MetricaId =
  | 'visitas_dia'          // visitas del mes / dias laborables
  | 'efectividad_neta'     // (pedidos - devoluciones) / visitas * 100
  | 'efectividad_bruta'    // pedidos / visitas * 100
  | 'activaciones'         // clientes que volvieron a comprar tras N dias sin comprar
  | 'cobertura_pct'        // clientes distintos visitados / clientes asignados * 100
  | 'cumplimiento_presupuesto_pct' // venta neta / presupuesto * 100
  | 'ventas'               // venta registrada en el mes ($)
  | 'ticket_promedio'      // venta / pedidos ($)
  | 'visitas'              // visitas del mes
  | 'pedidos'              // pedidos del mes

export const METRICAS: Record<MetricaId, { etiqueta: string; unidad: string; decimales: number }> = {
  visitas_dia: { etiqueta: 'Visitas por día laborable', unidad: '', decimales: 1 },
  efectividad_neta: { etiqueta: 'Efectividad neta (pedidos − devoluciones ÷ visitas)', unidad: '%', decimales: 1 },
  efectividad_bruta: { etiqueta: 'Efectividad bruta (pedidos ÷ visitas)', unidad: '%', decimales: 1 },
  activaciones: { etiqueta: 'Clientes activados', unidad: '', decimales: 0 },
  cobertura_pct: { etiqueta: 'Cobertura de la cartera', unidad: '%', decimales: 1 },
  cumplimiento_presupuesto_pct: { etiqueta: 'Cumplimiento del presupuesto', unidad: '%', decimales: 1 },
  ventas: { etiqueta: 'Ventas del mes', unidad: '$', decimales: 0 },
  ticket_promedio: { etiqueta: 'Ticket promedio', unidad: '$', decimales: 0 },
  visitas: { etiqueta: 'Visitas del mes', unidad: '', decimales: 0 },
  pedidos: { etiqueta: 'Pedidos del mes', unidad: '', decimales: 0 },
}

export type Metricas = Partial<Record<MetricaId, number>>

export type Operador = '>=' | '>'
export interface Condicion { metrica: MetricaId; op: Operador; valor: number }
export interface Nivel { nombre: string; condiciones: Condicion[]; monto: number }
export interface DefEscala { niveles: Nivel[] }
export interface DefPorUnidad { metrica: MetricaId; monto_unidad: number; minimo: number; tope: number | null }

export interface Regla {
  id: string
  nombre: string
  plantilla: string
  modo: 'escala' | 'por_unidad'
  definicion: DefEscala | DefPorUnidad
  activa: boolean
  vigente_desde: string
  vigente_hasta: string | null
}

export interface Resultado {
  monto: number
  nivel: string | null
  /** Que le falta para el siguiente nivel (o para el minimo), en lenguaje llano. */
  falta: string | null
  /** true si falta alguna metrica que la regla necesita (ej. presupuesto sin cargar) */
  incompleto: boolean
}

function cumple(valor: number | undefined, c: Condicion): boolean {
  if (valor === undefined || Number.isNaN(valor)) return false
  return c.op === '>' ? valor > c.valor : valor >= c.valor
}

function fmtNum(m: MetricaId, n: number): string {
  const { decimales, unidad } = METRICAS[m]
  const t = n.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: decimales })
  return unidad === '$' ? '$' + t : unidad ? t + unidad : t
}

function textoCondicion(c: Condicion): string {
  return `${METRICAS[c.metrica].etiqueta} ${c.op === '>' ? 'mayor que' : 'de'} ${fmtNum(c.metrica, c.valor)}${c.op === '>=' ? ' o más' : ''}`
}

/** Valida una definicion recibida del cliente. Devuelve un mensaje de error o null. */
export function validarDefinicion(modo: string, def: any): string | null {
  const ids = Object.keys(METRICAS)
  if (modo === 'escala') {
    if (!def || !Array.isArray(def.niveles) || def.niveles.length === 0) return 'La escala necesita al menos un nivel'
    if (def.niveles.length > 8) return 'Máximo 8 niveles por regla'
    for (const n of def.niveles) {
      if (typeof n.monto !== 'number' || !(n.monto >= 0) || n.monto > 1e9) return 'Cada nivel necesita un monto válido'
      if (!Array.isArray(n.condiciones) || n.condiciones.length === 0) return 'Cada nivel necesita al menos una condición'
      if (n.condiciones.length > 6) return 'Máximo 6 condiciones por nivel'
      for (const c of n.condiciones) {
        if (!ids.includes(c.metrica)) return 'Métrica desconocida'
        if (c.op !== '>=' && c.op !== '>') return 'Operador no permitido'
        if (typeof c.valor !== 'number' || !Number.isFinite(c.valor)) return 'Cada condición necesita un valor numérico'
      }
    }
    return null
  }
  if (modo === 'por_unidad') {
    if (!def || !ids.includes(def.metrica)) return 'Elige qué se cuenta'
    if (typeof def.monto_unidad !== 'number' || !(def.monto_unidad >= 0) || def.monto_unidad > 1e9) return 'El monto por unidad no es válido'
    if (typeof def.minimo !== 'number' || def.minimo < 0) return 'El mínimo no es válido'
    if (def.tope !== null && (typeof def.tope !== 'number' || def.tope < 0)) return 'El tope no es válido'
    return null
  }
  return 'Modo de regla desconocido'
}

export function evaluarRegla(regla: Pick<Regla, 'modo' | 'definicion'>, m: Metricas): Resultado {
  if (regla.modo === 'por_unidad') {
    const d = regla.definicion as DefPorUnidad
    const v = m[d.metrica]
    if (v === undefined) return { monto: 0, nivel: null, falta: null, incompleto: true }
    if (v < d.minimo) {
      return { monto: 0, nivel: null, falta: `Faltan ${fmtNum(d.metrica, d.minimo - v)} para empezar a pagar`, incompleto: false }
    }
    let monto = Math.round(v * d.monto_unidad)
    if (d.tope !== null) monto = Math.min(monto, d.tope)
    return { monto, nivel: `${fmtNum(d.metrica, v)} × ${fmtNum('ventas', d.monto_unidad)}`, falta: null, incompleto: false }
  }

  const d = regla.definicion as DefEscala
  // niveles de mayor a menor monto: se paga el mejor que se cumpla
  const orden = [...d.niveles].sort((a, b) => b.monto - a.monto)
  const ganado = orden.find(n => n.condiciones.every(c => cumple(m[c.metrica], c)))
  if (ganado) {
    const idx = orden.indexOf(ganado)
    const siguiente = idx > 0 ? orden[idx - 1] : null
    return { monto: ganado.monto, nivel: ganado.nombre, falta: siguiente ? faltaPara(siguiente, m) : null, incompleto: false }
  }
  // no cumple ninguno: se informa el nivel mas facil de alcanzar (el de menor monto)
  const objetivo = orden[orden.length - 1]
  return { monto: 0, nivel: null, falta: faltaPara(objetivo, m), incompleto: objetivo.condiciones.some(c => m[c.metrica] === undefined) }
}

function faltaPara(n: Nivel, m: Metricas): string | null {
  const partes: string[] = []
  for (const c of n.condiciones) {
    const v = m[c.metrica]
    if (v === undefined) { partes.push(`falta cargar: ${METRICAS[c.metrica].etiqueta.toLowerCase()}`); continue }
    if (cumple(v, c)) continue
    const dif = c.valor - v
    partes.push(`${fmtNum(c.metrica, c.op === '>' ? dif + Math.pow(10, -METRICAS[c.metrica].decimales) : dif)} más en ${METRICAS[c.metrica].etiqueta.toLowerCase()}`)
  }
  if (partes.length === 0) return null
  return `Para «${n.nombre}» (${fmtNum('ventas', n.monto)}): ${partes.join(' y ')}`
}

export function describirRegla(regla: Pick<Regla, 'modo' | 'definicion'>): string[] {
  if (regla.modo === 'por_unidad') {
    const d = regla.definicion as DefPorUnidad
    const partes = [`${fmtNum('ventas', d.monto_unidad)} por cada ${METRICAS[d.metrica].etiqueta.toLowerCase()}`]
    if (d.minimo > 0) partes.push(`desde ${fmtNum(d.metrica, d.minimo)}`)
    if (d.tope !== null) partes.push(`tope ${fmtNum('ventas', d.tope)}`)
    return [partes.join(', ')]
  }
  return (regla.definicion as DefEscala).niveles.map(n => `${n.nombre}: ${n.condiciones.map(textoCondicion).join(' y ')} → ${fmtNum('ventas', n.monto)}`)
}
