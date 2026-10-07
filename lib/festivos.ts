// ============================================================================
// lib/festivos.ts - Festivos de Colombia y calendario de dias laborables
// Reglas (Ley 51 de 1983 / Ley Emiliani): algunos festivos se trasladan al lunes
// siguiente; los de Semana Santa son fijos; Ascension, Corpus Christi y Sagrado
// Corazon dependen de la Pascua y se trasladan al lunes.
// Todas las fechas son 'AAAA-MM-DD' (sin zona horaria).
// ============================================================================

function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d))
}
function fmt(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function sumar(d: Date, dias: number): Date {
  return new Date(d.getTime() + dias * 86400000)
}
/** Si no es lunes, pasa al lunes siguiente. */
function alLunes(d: Date): Date {
  const dow = d.getUTCDay() // 0 domingo ... 1 lunes
  return dow === 1 ? d : sumar(d, (8 - dow) % 7)
}

/** Domingo de Pascua (algoritmo de Meeus/Jones/Butcher). */
export function pascua(anio: number): Date {
  const a = anio % 19
  const b = Math.floor(anio / 100)
  const c = anio % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return utc(anio, mes, dia)
}

export function festivosColombia(anio: number): { fecha: string; nombre: string }[] {
  const p = pascua(anio)
  const lista: [Date, string][] = [
    [utc(anio, 1, 1), 'Año Nuevo'],
    [alLunes(utc(anio, 1, 6)), 'Reyes Magos'],
    [alLunes(utc(anio, 3, 19)), 'San José'],
    [sumar(p, -3), 'Jueves Santo'],
    [sumar(p, -2), 'Viernes Santo'],
    [utc(anio, 5, 1), 'Día del Trabajo'],
    [alLunes(sumar(p, 39)), 'Ascensión del Señor'],
    [alLunes(sumar(p, 60)), 'Corpus Christi'],
    [alLunes(sumar(p, 68)), 'Sagrado Corazón'],
    [alLunes(utc(anio, 6, 29)), 'San Pedro y San Pablo'],
    [utc(anio, 7, 20), 'Independencia'],
    [utc(anio, 8, 7), 'Batalla de Boyacá'],
    [alLunes(utc(anio, 8, 15)), 'Asunción de la Virgen'],
    [alLunes(utc(anio, 10, 12)), 'Día de la Raza'],
    [alLunes(utc(anio, 11, 1)), 'Todos los Santos'],
    [alLunes(utc(anio, 11, 11)), 'Independencia de Cartagena'],
    [utc(anio, 12, 8), 'Inmaculada Concepción'],
    [utc(anio, 12, 25), 'Navidad'],
  ]
  // si dos festivos caen el mismo dia (puede pasar al trasladarlos a lunes), cuenta una sola vez
  const porFecha = new Map<string, string>()
  for (const [d, nombre] of lista) {
    const f = fmt(d)
    porFecha.set(f, porFecha.has(f) ? porFecha.get(f) + ' / ' + nombre : nombre)
  }
  return [...porFecha.entries()].map(([fecha, nombre]) => ({ fecha, nombre })).sort((x, y) => x.fecha.localeCompare(y.fecha))
}

export interface DiasMes {
  mes: string            // 'AAAA-MM'
  inicio: string         // primer dia
  fin: string            // ultimo dia
  laborables: number     // dias de la semana laborable que no son festivo
  festivos: { fecha: string; nombre: string }[]   // festivos que caen en dias laborables de la semana
}

/**
 * Dias laborables de un mes. diasSemana usa 1=lunes ... 6=sabado, 0=domingo
 * (por defecto lunes a sabado, la semana comercial usual).
 */
export function diasLaborablesMes(mes: string, diasSemana: number[] = [1, 2, 3, 4, 5, 6]): DiasMes {
  const [anio, m] = mes.split('-').map(Number)
  const ultimo = new Date(Date.UTC(anio, m, 0)).getUTCDate()
  const festivos = festivosColombia(anio).filter(f => f.fecha.startsWith(mes))
  const setFest = new Set(festivos.map(f => f.fecha))
  let laborables = 0
  const festivosEnSemana: { fecha: string; nombre: string }[] = []
  for (let d = 1; d <= ultimo; d++) {
    const fecha = utc(anio, m, d)
    if (!diasSemana.includes(fecha.getUTCDay())) continue
    if (setFest.has(fmt(fecha))) {
      festivosEnSemana.push(festivos.find(f => f.fecha === fmt(fecha))!)
      continue
    }
    laborables++
  }
  return { mes, inicio: fmt(utc(anio, m, 1)), fin: fmt(utc(anio, m, ultimo)), laborables, festivos: festivosEnSemana }
}
