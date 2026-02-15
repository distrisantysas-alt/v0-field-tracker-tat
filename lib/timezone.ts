// ============================================================================
// lib/timezone.ts - Utilidades de Zona Horaria Colombia
// ============================================================================
// Todas las fechas y horas en la app deben usar zona horaria de Colombia
// Servidor en São Paulo (UTC-3) pero usuarios en Colombia (UTC-5)
// ============================================================================

/**
 * Obtener fecha actual en Colombia
 * @returns string en formato 'YYYY-MM-DD' (ej: '2026-02-15')
 */
export function obtenerFechaColombia(): string {
  return new Date().toLocaleString('en-CA', { 
    timeZone: 'America/Bogota' 
  }).split(',')[0]
}

/**
 * Obtener fecha y hora actual en Colombia
 * @returns Date object ajustado a zona horaria Colombia
 */
export function obtenerFechaHoraColombia(): Date {
  const colombiaString = new Date().toLocaleString('en-US', { 
    timeZone: 'America/Bogota' 
  })
  return new Date(colombiaString)
}

/**
 * Formatear fecha en zona horaria Colombia
 * @param fecha - Fecha a formatear
 * @returns string en formato 'YYYY-MM-DD'
 */
export function formatearFechaColombia(fecha: Date): string {
  return fecha.toLocaleString('en-CA', { 
    timeZone: 'America/Bogota' 
  }).split(',')[0]
}

/**
 * Obtener hora actual en Colombia
 * @returns string en formato 'HH:MM:SS' (ej: '14:30:45')
 */
export function obtenerHoraColombia(): string {
  return new Date().toLocaleTimeString('es-CO', { 
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

/**
 * Convertir timestamp a fecha Colombia
 * @param timestamp - ISO timestamp del servidor
 * @returns string en formato legible para Colombia
 */
export function timestampAColombia(timestamp: string): string {
  const fecha = new Date(timestamp)
  return fecha.toLocaleString('es-CO', { 
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

/**
 * Verificar si una fecha es hoy (en zona horaria Colombia)
 * @param fecha - Fecha a verificar en formato 'YYYY-MM-DD'
 * @returns boolean
 */
export function esHoyColombia(fecha: string): boolean {
  return fecha === obtenerFechaColombia()
}

/**
 * Obtener día de la semana en Colombia
 * @returns string - 'lunes', 'martes', etc.
 */
export function obtenerDiaSemanaColombia(): string {
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  const fecha = obtenerFechaHoraColombia()
  return dias[fecha.getDay()]
}

// Constantes útiles
export const ZONA_HORARIA = 'America/Bogota'
export const LOCALE_COLOMBIA = 'es-CO'
