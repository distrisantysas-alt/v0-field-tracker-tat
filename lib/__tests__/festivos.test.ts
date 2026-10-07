import { describe, it, expect } from 'vitest'
import { festivosColombia, diasLaborablesMes, pascua } from '../festivos'

describe('festivos de Colombia', () => {
  it('Pascua de 2026 es el 5 de abril', () => {
    expect(pascua(2026).toISOString().slice(0, 10)).toBe('2026-04-05')
  })

  it('calendario oficial 2026', () => {
    expect(festivosColombia(2026).map(f => f.fecha)).toEqual([
      '2026-01-01', '2026-01-12', '2026-03-23', '2026-04-02', '2026-04-03', '2026-05-01',
      '2026-05-18', '2026-06-08', '2026-06-15', '2026-06-29', '2026-07-20', '2026-08-07',
      '2026-08-17', '2026-10-12', '2026-11-02', '2026-11-16', '2026-12-08', '2026-12-25',
    ])
  })

  it('2025: Semana Santa fija y festivos de Pascua trasladados a lunes', () => {
    const f = festivosColombia(2025).map(x => x.fecha)
    expect(f).toContain('2025-04-17') // Jueves Santo
    expect(f).toContain('2025-04-18') // Viernes Santo
    expect(f).toContain('2025-06-02') // Ascension (lunes)
    expect(f).toContain('2025-06-23') // Corpus Christi (lunes)
  })

  it('un dia festivo aparece una sola vez aunque coincidan dos', () => {
    for (const anio of [2024, 2025, 2026, 2027, 2028]) {
      const fechas = festivosColombia(anio).map(x => x.fecha)
      expect(new Set(fechas).size).toBe(fechas.length)
    }
  })
})

describe('dias laborables del mes (lunes a sabado)', () => {
  it('septiembre 2026: 26 (sin festivos, 4 domingos)', () => {
    const d = diasLaborablesMes('2026-09')
    expect(d.laborables).toBe(26)
    expect(d.festivos).toEqual([])
  })

  it('octubre 2026: 26 (27 sin domingos, menos el 12 de octubre)', () => {
    const d = diasLaborablesMes('2026-10')
    expect(d.laborables).toBe(26)
    expect(d.festivos.map(f => f.fecha)).toEqual(['2026-10-12'])
  })

  it('febrero 2026 tiene 28 dias y 4 domingos: 24', () => {
    expect(diasLaborablesMes('2026-02').laborables).toBe(24)
  })

  it('se puede definir otra semana laboral (lunes a viernes)', () => {
    expect(diasLaborablesMes('2026-09', [1, 2, 3, 4, 5]).laborables).toBe(22)
  })
})
