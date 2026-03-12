// ============================================================================
// lib/db.ts - Conexión Neon + Tipos + Helpers GPS
// ============================================================================

import { neon } from '@neondatabase/serverless';

// No lanzar error durante build - solo advertencia
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://dummy@localhost/dummy';
if (!DATABASE_URL && typeof window === 'undefined') {
  console.warn('⚠️ DATABASE_URL no definida');
}

export const sql = neon(DATABASE_URL);

// ---------------------------------------------------------------------------
// TIPOS TYPESCRIPT
// ---------------------------------------------------------------------------

export interface Asesor {
  id: number;
  nombre: string;
  zona: string;
  activo: boolean;
  created_at: Date;
}

export interface Cliente {
  id: number;
  codigo: string;
  nombre: string;
  direccion: string;
  lat: number;
  lng: number;
  radio_metros: number;
  activo: boolean;
  created_at: Date;
}

export interface RutaDia {
  id: number;
  asesor_id: number;
  cliente_id: number;
  fecha: string;
  orden: number;
  completada: boolean;
  created_at: Date;
}

export interface Visita {
  id: number;
  asesor_id: number;
  cliente_id: number;
  lat_capturada: number;
  lng_capturada: number;
  distancia_metros: number;
  validada: boolean;
  notas: string | null;
  timestamp: Date;
  synced: boolean;
  offline_id: string | null;
}

// Tipo extendido para el GET /api/clientes-del-dia
export interface ClienteConEstado extends Cliente {
  orden: number;
  completada: boolean;
  validada: boolean | null;
  distancia_metros: number | null;
  visitado_en: Date | null;
  foto_url: string | null;
}

// Tipo para visitas offline pendientes de sincronizar
export interface VisitaOffline {
  offline_id:    string;
  asesor_id:     number;
  cliente_id:    number;
  lat_capturada: number;
  lng_capturada: number;
  notas:         string | null;
  hubo_pedido:   boolean;
  valor_pedido:  number;
  foto_url?:     string | null;
  sin_gps?:      boolean;
  timestamp:     string;
  synced:        false;
}

// ---------------------------------------------------------------------------
// HELPERS GPS
// ---------------------------------------------------------------------------

export function calcularDistanciaMetros(
  lat1: number, lng1: number, lat2: number, lng2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function determinarEstadoVisita(
  distanciaMetros: number, radioPermitido: number
): { validada: boolean; estado: 'validada' | 'sospechosa'; mensaje: string } {
  const validada = distanciaMetros <= radioPermitido;
  return {
    validada,
    estado: validada ? 'validada' : 'sospechosa',
    mensaje: validada
      ? `✅ Visita validada — ${Math.round(distanciaMetros)}m del cliente`
      : `⚠️ Visita fuera de rango — ${Math.round(distanciaMetros)}m (máximo ${radioPermitido}m)`,
  };
}

export function formatearDistancia(metros: number): string {
  if (metros < 1000) return `~${Math.round(metros)}m`;
  return `~${(metros / 1000).toFixed(1)}km`;
}

// ---------------------------------------------------------------------------
// HELPERS OFFLINE — VISITAS (IndexedDB)
// ---------------------------------------------------------------------------

const DB_NAME = 'field-tracker-tat';
const DB_VERSION = 1;
const STORE_VISITAS_OFFLINE = 'visitas_pendientes';

export function initOfflineDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_VISITAS_OFFLINE)) {
        const store = db.createObjectStore(STORE_VISITAS_OFFLINE, { keyPath: 'offline_id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('asesor_id', 'asesor_id', { unique: false });
      }
    };
  });
}

export async function guardarVisitaOffline(visita: VisitaOffline): Promise<void> {
  const db = await initOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_VISITAS_OFFLINE, 'readwrite');
    const store = tx.objectStore(STORE_VISITAS_OFFLINE);
    const request = store.add(visita);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function obtenerVisitasOffline(): Promise<VisitaOffline[]> {
  const db = await initOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_VISITAS_OFFLINE, 'readonly');
    const store = tx.objectStore(STORE_VISITAS_OFFLINE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function eliminarVisitaOffline(offline_id: string): Promise<void> {
  const db = await initOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_VISITAS_OFFLINE, 'readwrite');
    const store = tx.objectStore(STORE_VISITAS_OFFLINE);
    const request = store.delete(offline_id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function sincronizarVisitasOffline(): Promise<{ sincronizadas: number; errores: number }> {
  const visitasPendientes = await obtenerVisitasOffline();
  let sincronizadas = 0;
  let errores = 0;

  for (const visita of visitasPendientes) {
    try {
      const response = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asesor_id:    visita.asesor_id,
          cliente_id:   visita.cliente_id,
          lat:          visita.lat_capturada,
          lng:          visita.lng_capturada,
          notas:        visita.notas,
          hubo_pedido:  visita.hubo_pedido  ?? false,
          valor_pedido: visita.valor_pedido ?? 0,
          foto_url:     visita.foto_url     ?? null,
          sin_gps:      visita.sin_gps      ?? false,
          offline_id:   visita.offline_id,
        }),
      });
      if (response.ok) {
        await eliminarVisitaOffline(visita.offline_id);
        sincronizadas++;
      } else {
        errores++;
      }
    } catch (error) {
      console.error('Error sincronizando visita:', visita.offline_id, error);
      errores++;
    }
  }

  return { sincronizadas, errores };
}

// ---------------------------------------------------------------------------
// HELPERS GPS OFFLINE (localStorage)
// ✅ Permite capturar GPS del cliente sin señal y sincronizar al reconectar
// ---------------------------------------------------------------------------

const GPS_OFFLINE_KEY = 'dsroute_gps_pendientes'

export interface GPSPendiente {
  cliente_id: string
  lat: number
  lng: number
  ts: string
}

export function guardarGPSOffline(clienteId: string, lat: number, lng: number): void {
  try {
    const raw = localStorage.getItem(GPS_OFFLINE_KEY)
    const pendientes: Record<string, GPSPendiente> = raw ? JSON.parse(raw) : {}
    pendientes[clienteId] = { cliente_id: clienteId, lat, lng, ts: new Date().toISOString() }
    localStorage.setItem(GPS_OFFLINE_KEY, JSON.stringify(pendientes))
  } catch {}
}

export function leerGPSPendientes(): Record<string, GPSPendiente> {
  try {
    const raw = localStorage.getItem(GPS_OFFLINE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

export function eliminarGPSPendiente(clienteId: string): void {
  try {
    const raw = localStorage.getItem(GPS_OFFLINE_KEY)
    const pendientes: Record<string, GPSPendiente> = raw ? JSON.parse(raw) : {}
    delete pendientes[clienteId]
    localStorage.setItem(GPS_OFFLINE_KEY, JSON.stringify(pendientes))
  } catch {}
}

export async function sincronizarGPSPendientes(): Promise<void> {
  const pendientes = leerGPSPendientes()
  const ids = Object.keys(pendientes)
  if (ids.length === 0) return
  for (const clienteId of ids) {
    const { lat, lng } = pendientes[clienteId]
    try {
      const res = await fetch('/api/clientes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_id: clienteId, lat, lng }),
      })
      if (res.ok) eliminarGPSPendiente(clienteId)
    } catch {}
  }
}

// ---------------------------------------------------------------------------
// HELPERS DE VALIDACIÓN
// ---------------------------------------------------------------------------

export function soportaGPS(): boolean {
  return 'geolocation' in navigator;
}

export function obtenerPosicionGPS(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!soportaGPS()) {
      reject(new Error('Geolocalización no soportada en este navegador'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, () => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 60000,
      });
    }, {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 30000,
    });
  });
}

export function hayConexion(): boolean {
  return navigator.onLine;
}

export function generarOfflineID(): string {
  return `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
