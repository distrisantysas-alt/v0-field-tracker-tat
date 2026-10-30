// ============================================================================
// lib/planeador.ts - Planeador de ruta: orden de visita que ahorra kilometros, y enlaces para navegar.
// Sin dependencias: corre en el telefono del asesor (sin conexion a ningun servicio de mapas).
// Distancia en linea recta (haversine) x 1,3 como aproximacion de las calles; no es un ruteo vial exacto,
// pero ordena muy bien las paradas. El tiempo es una estimacion.
// ============================================================================

export interface Punto { id: string; lat: number; lng: number }
export interface Coord { lat: number; lng: number }

const FACTOR_CALLES = 1.3          // la calle real es mas larga que la linea recta
export const VELOCIDAD_KMH = 22    // promedio urbano en moto o carro
export const MINUTOS_POR_VISITA = 10

export function coordValida(lat: unknown, lng: unknown): boolean {
  const a = Number(lat), b = Number(lng)
  return Number.isFinite(a) && Number.isFinite(b) && (Math.abs(a) > 0.0001 || Math.abs(b) > 0.0001) && Math.abs(a) <= 90 && Math.abs(b) <= 180
}

/** Kilometros entre dos coordenadas, en linea recta. */
export function km(a: Coord, b: Coord): number {
  const R = 6371, rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Longitud de un recorrido (desde `inicio` si se da) pasando por los puntos en ese orden, con el factor de calles. */
export function longitudRuta(orden: Punto[], inicio?: Coord | null): number {
  let total = 0, previo: Coord | null | undefined = inicio
  for (const p of orden) { if (previo) total += km(previo, p); previo = p }
  return total * FACTOR_CALLES
}

/**
 * Ordena las paradas para recorrerlas con el menor camino: vecino mas cercano desde `inicio` y despues 2-opt
 * (deshace los cruces). Para unas decenas de paradas es instantaneo. Sin `inicio`, arranca en la parada mas alejada del centro.
 */
export function ordenarRuta(puntos: Punto[], inicio?: Coord | null): Punto[] {
  const validos = puntos.filter(p => coordValida(p.lat, p.lng))
  if (validos.length <= 2) return inicio && validos.length === 2 && km(inicio, validos[1]) < km(inicio, validos[0]) ? [validos[1], validos[0]] : validos

  let origen: Coord | null = inicio ?? null
  const restantes = [...validos]
  const ruta: Punto[] = []
  if (!origen) {
    const cx = validos.reduce((s, p) => s + p.lat, 0) / validos.length, cy = validos.reduce((s, p) => s + p.lng, 0) / validos.length
    restantes.sort((a, b) => km({ lat: cx, lng: cy }, b) - km({ lat: cx, lng: cy }, a))
    ruta.push(restantes.shift()!); origen = ruta[0]
  }
  while (restantes.length) {
    let mejor = 0, d = Infinity
    for (let i = 0; i < restantes.length; i++) { const x = km(origen!, restantes[i]); if (x < d) { d = x; mejor = i } }
    const [p] = restantes.splice(mejor, 1)
    ruta.push(p); origen = p
  }

  // 2-opt sobre un camino abierto con inicio fijo
  const base = inicio ?? null
  const dist = (a: Coord | null, b: Coord) => (a ? km(a, b) : 0)
  let mejora = true, vueltas = 0
  while (mejora && vueltas++ < 60) {
    mejora = false
    for (let i = 0; i < ruta.length - 1; i++) {
      for (let j = i + 1; j < ruta.length; j++) {
        const antes = dist(i === 0 ? base : ruta[i - 1], ruta[i]) + (j + 1 < ruta.length ? km(ruta[j], ruta[j + 1]) : 0)
        const despues = dist(i === 0 ? base : ruta[i - 1], ruta[j]) + (j + 1 < ruta.length ? km(ruta[i], ruta[j + 1]) : 0)
        if (despues + 1e-9 < antes) { ruta.splice(i, j - i + 1, ...ruta.slice(i, j + 1).reverse()); mejora = true }
      }
    }
  }
  return ruta
}

/** Horas de recorrido: tiempo manejando + lo que se queda en cada visita. */
export function estimarMinutos(kilometros: number, paradas: number): number {
  return Math.round((kilometros / VELOCIDAD_KMH) * 60 + paradas * MINUTOS_POR_VISITA)
}

export function textoDuracion(minutos: number): string {
  const h = Math.floor(minutos / 60), m = minutos % 60
  return h === 0 ? `${m} min` : `${h} h${m ? ` ${m} min` : ""}`
}

// ---- Enlaces para navegar (se abren en la app de mapas del telefono) ---------------------------------------
export const urlWaze = (p: Coord) => `https://waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes`
export const urlGoogleParada = (p: Coord) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=driving`

/** Google Maps admite hasta 9 paradas intermedias por enlace: una ruta larga se parte en tramos. */
export function urlsGoogleRuta(paradas: Coord[], inicio?: Coord | null, porTramo = 9): { desde: number; hasta: number; url: string }[] {
  const tramos: { desde: number; hasta: number; url: string }[] = []
  let origen: Coord | null | undefined = inicio
  for (let i = 0; i < paradas.length; i += porTramo) {
    const grupo = paradas.slice(i, i + porTramo)
    const destino = grupo[grupo.length - 1], medias = grupo.slice(0, -1)
    const q = new URLSearchParams({ api: "1", destination: `${destino.lat},${destino.lng}`, travelmode: "driving" })
    if (origen) q.set("origin", `${origen.lat},${origen.lng}`)
    if (medias.length) q.set("waypoints", medias.map(p => `${p.lat},${p.lng}`).join("|"))
    tramos.push({ desde: i + 1, hasta: i + grupo.length, url: `https://www.google.com/maps/dir/?${q.toString()}` })
    origen = destino
  }
  return tramos
}

// ---- Elegir cuáles clientes visitar hoy -----------------------------------------------------------------------
export interface Candidato extends Punto { prioridad?: boolean }

const mediana = (xs: number[]): number => {
  if (xs.length === 0) return 0
  const o = [...xs].sort((a, b) => a - b), m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2
}

/**
 * Clientes cuya ubicación queda muy lejos del resto (casi siempre una coordenada mal guardada).
 * Umbral: el mayor entre `minKm` y `veces` x la distancia mediana al centro del grupo; así una ruta viajera, que
 * es larga de por sí, no marca a todos. Con menos de 5 puntos no se juzga a nadie.
 */
export function ubicacionesLejanas(puntos: Punto[], minKm = 20, veces = 3): Set<string> {
  const v = puntos.filter(p => coordValida(p.lat, p.lng))
  if (v.length < 5) return new Set()
  const centro: Coord = { lat: mediana(v.map(p => p.lat)), lng: mediana(v.map(p => p.lng)) }
  const d = v.map(p => km(centro, p))
  const umbral = Math.max(minKm, veces * mediana(d))
  return new Set(v.filter((_, i) => d[i] > umbral).map(p => p.id))
}

/**
 * Elige los `n` clientes que conviene visitar hoy: los más cercanos al punto de partida (el GPS del asesor; sin GPS,
 * el rincón más denso de la lista), de modo que el día quede en una sola zona. Con `usarPrioridad`, los clientes con
 * oportunidad de venta cuentan como si estuvieran un 40% más cerca. Devuelve los id elegidos.
 */
export function elegirParaHoy(cands: Candidato[], centro: Coord | null, n: number, usarPrioridad = false): string[] {
  const v = cands.filter(p => coordValida(p.lat, p.lng))
  if (n <= 0) return []
  if (v.length <= n) return v.map(p => p.id)
  let origen = centro
  if (!origen) {
    // sin GPS: el punto con menor suma de distancias a sus (n-1) vecinos más próximos
    let mejor = v[0], suma = Infinity
    for (const a of v) {
      const s = v.map(b => km(a, b)).sort((x, y) => x - y).slice(0, n).reduce((t, x) => t + x, 0)
      if (s < suma) { suma = s; mejor = a }
    }
    origen = mejor
  }
  const o = origen
  return v
    .map(p => ({ id: p.id, d: km(o, p) * (usarPrioridad && p.prioridad ? 0.6 : 1) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map(x => x.id)
}
