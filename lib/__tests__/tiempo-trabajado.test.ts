import { describe, it, expect } from 'vitest'
import { rangoPeriodo, moverPeriodo, resumirPorAsesor, formatoDuracion, formatoHora, validarFecha, type DiaTrabajado } from '../tiempo-trabajado'

function dia(p: Partial<DiaTrabajado>): DiaTrabajado {
  return { asesor_id: 'a1', nombre: 'JENSI', fecha: '2026-11-09', inicio_min: 480, fin_min: 960, visitas: 40, pausa_min: 30, pausa_desde_min: 720, ...p }
}

describe('rango del periodo', () => {
  it('día: solo esa fecha', () => {
    expect(rangoPeriodo('dia', '2026-11-12')).toEqual({ desde: '2026-11-12', hasta: '2026-11-12' })
  })
  it('semana: de lunes a domingo, también si la fecha es domingo', () => {
    expect(rangoPeriodo('semana', '2026-11-12')).toEqual({ desde: '2026-11-09', hasta: '2026-11-15' })
    expect(rangoPeriodo('semana', '2026-11-15')).toEqual({ desde: '2026-11-09', hasta: '2026-11-15' })
    expect(rangoPeriodo('semana', '2026-11-09')).toEqual({ desde: '2026-11-09', hasta: '2026-11-15' })
  })
  it('semana que cruza de mes', () => {
    expect(rangoPeriodo('semana', '2026-11-01')).toEqual({ desde: '2026-10-26', hasta: '2026-11-01' })
  })
  it('mes completo, con febrero bisiesto', () => {
    expect(rangoPeriodo('mes', '2026-11-17')).toEqual({ desde: '2026-11-01', hasta: '2026-11-30' })
    expect(rangoPeriodo('mes', '2028-02-10')).toEqual({ desde: '2028-02-01', hasta: '2028-02-29' })
  })
})

describe('mover el periodo', () => {
  it('día, semana y mes hacia atrás y adelante', () => {
    expect(moverPeriodo('dia', '2026-11-01', -1)).toBe('2026-10-31')
    expect(moverPeriodo('semana', '2026-11-12', 1)).toBe('2026-11-16')
    expect(moverPeriodo('mes', '2026-01-31', -1)).toBe('2025-12-01')
  })
})

describe('resumen por asesor', () => {
  it('suma jornadas, promedia horas y toma la pausa más larga con su fecha', () => {
    const r = resumirPorAsesor([
      dia({ fecha: '2026-11-10', inicio_min: 480, fin_min: 960, visitas: 40, pausa_min: 30 }),  // 8 h
      dia({ fecha: '2026-11-09', inicio_min: 540, fin_min: 900, visitas: 20, pausa_min: 90 }),  // 6 h
    ])
    expect(r).toHaveLength(1)
    expect(r[0].dias).toBe(2)
    expect(r[0].minutos_total).toBe(840)
    expect(r[0].minutos_promedio).toBe(420)
    expect(r[0].inicio_promedio_min).toBe(510)
    expect(r[0].visitas_por_hora).toBeCloseTo(60 / 14)
    expect(r[0].pausa_max_min).toBe(90)
    expect(r[0].pausa_max_fecha).toBe('2026-11-09')
    expect(r[0].detalle.map(d => d.fecha)).toEqual(['2026-11-09', '2026-11-10'])
  })

  it('ordena por más horas promedio y separa asesores', () => {
    const r = resumirPorAsesor([
      dia({ asesor_id: 'a2', nombre: 'SANDRA', inicio_min: 480, fin_min: 600 }),
      dia({ asesor_id: 'a1', nombre: 'JENSI' }),
    ])
    expect(r.map(x => x.nombre)).toEqual(['JENSI', 'SANDRA'])
  })

  it('un día con una sola gestión: jornada 0 y sin ritmo por hora', () => {
    const r = resumirPorAsesor([dia({ inicio_min: 600, fin_min: 600, visitas: 1, pausa_min: 0, pausa_desde_min: null })])
    expect(r[0].minutos_total).toBe(0)
    expect(r[0].visitas_por_hora).toBeNull()
    expect(r[0].pausa_max_fecha).toBeNull()
  })
})

describe('formatos', () => {
  it('duración y hora', () => {
    expect(formatoDuracion(485)).toBe('8 h 05 min')
    expect(formatoDuracion(45)).toBe('45 min')
    expect(formatoHora(485)).toBe('8:05 a. m.')
    expect(formatoHora(935.6)).toBe('3:36 p. m.')
    expect(formatoHora(725)).toBe('12:05 p. m.')
  })
  it('fecha válida', () => {
    expect(validarFecha('2026-11-17')).toBe(true)
    expect(validarFecha('2026-02-30')).toBe(false)
    expect(validarFecha('17/11/2026')).toBe(false)
  })
})
