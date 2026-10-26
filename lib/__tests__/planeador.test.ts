import { describe, it, expect } from 'vitest'
import { km, ordenarRuta, longitudRuta, coordValida, estimarMinutos, textoDuracion, urlsGoogleRuta, urlWaze, type Punto } from '../planeador'

// Paradas sobre una linea (norte-sur) mezcladas: el mejor recorrido desde el sur es en orden de latitud
const linea: Punto[] = [4.70, 4.62, 4.66, 4.60, 4.68, 4.64].map((lat, i) => ({ id: `p${i}`, lat, lng: -74.1 }))

describe('planeador de ruta', () => {
  it('distancia: Bogota a Medellin ronda los 240 km en linea recta', () => {
    const d = km({ lat: 4.711, lng: -74.0721 }, { lat: 6.2442, lng: -75.5812 })
    expect(d).toBeGreaterThan(215); expect(d).toBeLessThan(250)
    expect(km({ lat: 4, lng: -74 }, { lat: 4, lng: -74 })).toBe(0)
  })
  it('ordena paradas en linea recta de punta a punta desde el inicio', () => {
    const inicio = { lat: 4.55, lng: -74.1 }
    const r = ordenarRuta(linea, inicio).map(p => p.lat)
    expect(r).toEqual([...r].sort((a, b) => a - b))         // sube de sur a norte, sin saltos
    expect(longitudRuta(ordenarRuta(linea, inicio), inicio)).toBeLessThan(longitudRuta(linea, inicio))
  })
  it('nunca queda peor que el orden original y conserva todas las paradas', () => {
    const azar: Punto[] = Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, lat: 4.6 + ((i * 7919) % 100) / 1000, lng: -74.1 + ((i * 104729) % 100) / 1000 }))
    const inicio = { lat: 4.65, lng: -74.05 }
    const r = ordenarRuta(azar, inicio)
    expect(r.length).toBe(30)
    expect(new Set(r.map(p => p.id)).size).toBe(30)
    expect(longitudRuta(r, inicio)).toBeLessThanOrEqual(longitudRuta(azar, inicio))
  })
  it('casos pequenos y coordenadas invalidas', () => {
    expect(ordenarRuta([])).toEqual([])
    expect(ordenarRuta([linea[0]])).toEqual([linea[0]])
    expect(ordenarRuta([{ id: 'a', lat: 0, lng: 0 }, linea[0]]).map(p => p.id)).toEqual(['p0'])   // sin ubicacion: se descarta
    const dos = ordenarRuta([linea[0], linea[3]], { lat: 4.59, lng: -74.1 })
    expect(dos[0].id).toBe('p3')                                                              // el mas cercano primero
    expect(coordValida(null, null)).toBe(false); expect(coordValida(4.6, -74.1)).toBe(true); expect(coordValida(91, 0)).toBe(false)
  })
  it('sin inicio arranca en un extremo, no en el medio', () => {
    const r = ordenarRuta(linea)
    expect([r[0].lat, r[r.length - 1].lat].sort()).toEqual([4.60, 4.70])
  })
  it('estima tiempos y los escribe legible', () => {
    expect(estimarMinutos(22, 0)).toBe(60)
    expect(estimarMinutos(0, 6)).toBe(60)
    expect(textoDuracion(45)).toBe('45 min'); expect(textoDuracion(120)).toBe('2 h'); expect(textoDuracion(135)).toBe('2 h 15 min')
  })
  it('parte la ruta en tramos de 9 paradas para Google Maps', () => {
    const paradas = Array.from({ length: 20 }, (_, i) => ({ lat: 4.6 + i / 100, lng: -74.1 }))
    const t = urlsGoogleRuta(paradas, { lat: 4.5, lng: -74.1 })
    expect(t.map(x => [x.desde, x.hasta])).toEqual([[1, 9], [10, 18], [19, 20]])
    expect(t[0].url).toContain('origin=4.5%2C-74.1')
    expect(t[1].url).toContain('origin=4.68%2C-74.1')          // el segundo tramo arranca donde termino el primero
    expect(new URL(t[0].url).searchParams.get('waypoints')!.split('|').length).toBe(8)
    expect(urlsGoogleRuta([], null)).toEqual([])
    expect(urlWaze({ lat: 4.6, lng: -74.1 })).toBe('https://waze.com/ul?ll=4.6,-74.1&navigate=yes')
  })
})
