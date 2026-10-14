import { describe, it, expect } from 'vitest'
import { evaluarRegla, validarDefinicion, reglaAplica, type Regla, type DefEscala } from '../incentivos'

// Ejemplo de regla de eficiencia con dos niveles (visitas por dia y efectividad neta)
const eficiencia: Pick<Regla, 'modo' | 'definicion'> = {
  modo: 'escala',
  definicion: {
    niveles: [
      { nombre: 'Nivel 1', monto: 120000, condiciones: [{ metrica: 'visitas_dia', op: '>=', valor: 40 }, { metrica: 'efectividad_neta', op: '>', valor: 40 }] },
      { nombre: 'Nivel 2', monto: 200000, condiciones: [{ metrica: 'visitas_dia', op: '>=', valor: 50 }, { metrica: 'efectividad_neta', op: '>=', valor: 45 }] },
    ],
  } as DefEscala,
}

describe('regla de escala', () => {
  it('paga el nivel mas alto que se cumple', () => {
    const r = evaluarRegla(eficiencia, { visitas_dia: 52, efectividad_neta: 46 })
    expect(r.monto).toBe(200000)
    expect(r.nivel).toBe('Nivel 2')
    expect(r.falta).toBeNull()
  })

  it('cumple solo el nivel inferior y dice que le falta para el siguiente', () => {
    const r = evaluarRegla(eficiencia, { visitas_dia: 41.5, efectividad_neta: 41.4 })
    expect(r.monto).toBe(120000)
    expect(r.nivel).toBe('Nivel 1')
    expect(r.falta).toContain('Nivel 2')
  })

  it('el operador > es estricto: exactamente 40% no cumple "mayor que 40"', () => {
    expect(evaluarRegla(eficiencia, { visitas_dia: 45, efectividad_neta: 40 }).monto).toBe(0)
    expect(evaluarRegla(eficiencia, { visitas_dia: 45, efectividad_neta: 40.01 }).monto).toBe(120000)
  })

  it('el operador >= incluye el valor exacto', () => {
    expect(evaluarRegla(eficiencia, { visitas_dia: 50, efectividad_neta: 45 }).monto).toBe(200000)
  })

  it('no cumple ninguno: no paga y explica el camino mas corto', () => {
    const r = evaluarRegla(eficiencia, { visitas_dia: 39.5, efectividad_neta: 25.6 })
    expect(r.monto).toBe(0)
    expect(r.falta).toContain('Nivel 1')
    expect(r.incompleto).toBe(false)
  })

  it('un dato que falta (devoluciones sin cargar) no se toma como cero: queda incompleto', () => {
    const r = evaluarRegla(eficiencia, { visitas_dia: 60 })
    expect(r.monto).toBe(0)
    expect(r.incompleto).toBe(true)
    expect(r.falta).toContain('falta cargar')
  })

  it('el orden de los niveles en la definicion no importa', () => {
    const invertida: any = { modo: 'escala', definicion: { niveles: [...(eficiencia.definicion as DefEscala).niveles].reverse() } }
    expect(evaluarRegla(invertida, { visitas_dia: 52, efectividad_neta: 46 }).monto).toBe(200000)
  })
})

describe('regla por unidad', () => {
  const activacion: Pick<Regla, 'modo' | 'definicion'> = {
    modo: 'por_unidad',
    definicion: { metrica: 'activaciones', monto_unidad: 15000, minimo: 5, tope: 300000 },
  }

  it('paga por cada unidad desde el minimo', () => {
    expect(evaluarRegla(activacion, { activaciones: 8 }).monto).toBe(120000)
  })

  it('no paga por debajo del minimo y dice cuantas faltan', () => {
    const r = evaluarRegla(activacion, { activaciones: 3 })
    expect(r.monto).toBe(0)
    expect(r.falta).toContain('2')
  })

  it('respeta el tope', () => {
    expect(evaluarRegla(activacion, { activaciones: 40 }).monto).toBe(300000)
  })

  it('sin tope paga todo', () => {
    const sinTope: any = { modo: 'por_unidad', definicion: { metrica: 'activaciones', monto_unidad: 10000, minimo: 0, tope: null } }
    expect(evaluarRegla(sinTope, { activaciones: 40 }).monto).toBe(400000)
  })
})

describe('validacion de definiciones', () => {
  it('acepta una escala valida', () => {
    expect(validarDefinicion('escala', eficiencia.definicion)).toBeNull()
  })
  it('rechaza metricas inventadas, montos negativos y escalas vacias', () => {
    expect(validarDefinicion('escala', { niveles: [{ nombre: 'x', monto: 1, condiciones: [{ metrica: 'hackeo', op: '>=', valor: 1 }] }] })).not.toBeNull()
    expect(validarDefinicion('escala', { niveles: [{ nombre: 'x', monto: -5, condiciones: [{ metrica: 'visitas', op: '>=', valor: 1 }] }] })).not.toBeNull()
    expect(validarDefinicion('escala', { niveles: [] })).not.toBeNull()
  })
  it('rechaza operadores raros', () => {
    expect(validarDefinicion('escala', { niveles: [{ nombre: 'x', monto: 1, condiciones: [{ metrica: 'visitas', op: '==', valor: 1 }] }] })).not.toBeNull()
  })
  it('valida el modo por unidad', () => {
    expect(validarDefinicion('por_unidad', { metrica: 'activaciones', monto_unidad: 1000, minimo: 0, tope: null })).toBeNull()
    expect(validarDefinicion('por_unidad', { metrica: 'activaciones', monto_unidad: -1, minimo: 0, tope: null })).not.toBeNull()
    expect(validarDefinicion('otro', {})).not.toBeNull()
  })
})

// Meta fija por perfil: un solo premio, todo o nada
const metaLocal: Pick<Regla, 'modo' | 'definicion'> = {
  modo: 'escala',
  definicion: { niveles: [{ nombre: 'Meta local', monto: 300000, condiciones: [
    { metrica: 'visitas_dia', op: '>=', valor: 35 }, { metrica: 'pedidos_dia_neto', op: '>=', valor: 20 }, { metrica: 'efectividad_neta', op: '>', valor: 45 },
  ] }] } as DefEscala,
}

describe('meta fija por perfil', () => {
  it('paga el premio completo al cumplir las tres condiciones', () => {
    expect(evaluarRegla(metaLocal, { visitas_dia: 38, pedidos_dia_neto: 21, efectividad_neta: 55 }).monto).toBe(300000)
  })
  it('no paga nada si falta una sola condicion', () => {
    const r = evaluarRegla(metaLocal, { visitas_dia: 38, pedidos_dia_neto: 19.5, efectividad_neta: 55 })
    expect(r.monto).toBe(0)
    expect(r.falta).toContain('pedidos')
  })
  it('sin devoluciones cargadas queda incompleto, no en cero pagado por error', () => {
    const r = evaluarRegla(metaLocal, { visitas_dia: 38 })
    expect(r.monto).toBe(0)
    expect(r.incompleto).toBe(true)
  })
})

describe('reglaAplica', () => {
  it('todos aplica a cualquier perfil; local y viajero solo al suyo', () => {
    expect(reglaAplica('todos', 'viajero')).toBe(true)
    expect(reglaAplica('local', 'local')).toBe(true)
    expect(reglaAplica('local', 'viajero')).toBe(false)
    expect(reglaAplica('viajero', 'local')).toBe(false)
    expect(reglaAplica(undefined, 'local')).toBe(true)
  })
})
