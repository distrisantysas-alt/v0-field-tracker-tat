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
  telefono: string | null;
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
  // Pedido de la visita de HOY (si ya se registró)
  hubo_pedido: boolean | null;
  valor_pedido: number | null;
  ultima_foto_url: string | null;
  ultima_visita_en: Date | null;
  // Última gestión registrada alguna vez (hoy o no) — para priorizar la ruta
  ultima_gestion_en: Date | null;
  ultimo_hubo_pedido: boolean | null;
  ultimo_valor_pedido: number | null;
  // Panorama de oportunidad: últimas hasta 5 gestiones (más reciente primero)
  // y cuántas de las más recientes seguidas fueron sin pedido
  historial_reciente: { timestamp: string; hubo_pedido: boolean; valor_pedido: number }[];
  racha_sin_pedido: number;
}

// Tipo para visitas offline pendientes de sincronizar
export interface VisitaOffline {
  offline_id:    string;
  asesor_id:     number;
  cliente_id:    number;
  lat_capturada: number;
  lng_capturada: number;
  accuracy?:     number | null;
  notas:         string | null;
  hubo_pedido:   boolean;
  valor_pedido:  number;
  foto_url?:     string | null;
  // Copia local de la foto (base64) para poder subirla al reconectar si
  // se tomó estando offline — foto_url puede venir null en ese caso porque
  // no hubo señal para subirla a Cloudinary en el momento de capturarla.
  foto_base64?:  string | null;
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
const DB_VERSION = 2;
const STORE_VISITAS_OFFLINE = 'visitas_pendientes';

export function initOfflineDB(): Promise<IDBDatabase> {
  // Usa v2 para incluir el store de GPS pendientes
  return initOfflineDBv2()
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

// Guarda la URL ya subida para no reintentar el upload en cada sync si el
// checkin en sí falla por otra razón (ej. red se cae justo después).
async function actualizarFotoUrlVisitaOffline(offline_id: string, foto_url: string): Promise<void> {
  const db = await initOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_VISITAS_OFFLINE, 'readwrite');
    const store = tx.objectStore(STORE_VISITAS_OFFLINE);
    const getRequest = store.get(offline_id);
    getRequest.onsuccess = () => {
      const visita = getRequest.result;
      if (!visita) { resolve(); return; }
      visita.foto_url = foto_url;
      const putRequest = store.put(visita);
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

export async function sincronizarVisitasOffline(): Promise<{ sincronizadas: number; errores: number; sesionExpirada: boolean }> {
  const visitasPendientes = await obtenerVisitasOffline();
  let sincronizadas = 0;
  let errores = 0;
  let sesionExpirada = false;

  for (const visita of visitasPendientes) {
    if (sesionExpirada) break; // no tiene sentido seguir intentando, ninguna va a pasar

    try {
      // Si la foto se tomó offline, nunca se subió — reintenta ahora que
      // hay señal. Si el reintento falla, se salta esta visita por ahora
      // (sigue esperando en la cola) en vez de enviarla sin evidencia.
      let fotoUrl = visita.foto_url ?? null;
      if (!fotoUrl && visita.foto_base64) {
        try {
          const uploadRes = await fetch('/api/upload-foto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ foto_base64: visita.foto_base64 }),
          });
          if (uploadRes.ok) {
            const uploadData = await uploadRes.json();
            fotoUrl = uploadData.url ?? null;
            if (fotoUrl) await actualizarFotoUrlVisitaOffline(visita.offline_id, fotoUrl);
          } else if (uploadRes.status === 401) {
            sesionExpirada = true;
            continue;
          } else {
            errores++;
            continue; // no se pudo subir la foto todavía, se reintenta después
          }
        } catch {
          errores++;
          continue;
        }
      }

      const response = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asesor_id:    visita.asesor_id,
          cliente_id:   visita.cliente_id,
          lat:          visita.lat_capturada,
          lng:          visita.lng_capturada,
          accuracy:     visita.accuracy      ?? null,
          notas:        visita.notas,
          hubo_pedido:  visita.hubo_pedido  ?? false,
          valor_pedido: visita.valor_pedido ?? 0,
          foto_url:     fotoUrl,
          sin_gps:      visita.sin_gps      ?? false,
          offline_id:   visita.offline_id,
        }),
      });
      if (response.ok) {
        await eliminarVisitaOffline(visita.offline_id);
        sincronizadas++;
      } else if (response.status === 401) {
        // Sesión expirada: NO se borra el registro local — se reintenta
        // en cuanto el asesor vuelva a iniciar sesión.
        sesionExpirada = true;
      } else {
        errores++;
      }
    } catch (error) {
      console.error('Error sincronizando visita:', visita.offline_id, error);
      errores++;
    }
  }

  return { sincronizadas, errores, sesionExpirada };
}

// ---------------------------------------------------------------------------
// HELPERS GPS OFFLINE (IndexedDB)
// ✅ GPS capturado sin señal → persiste aunque cierren la app → sube al reconectar
// ---------------------------------------------------------------------------

const STORE_GPS_OFFLINE = 'gps_pendientes'

export interface GPSPendiente {
  cliente_id: string
  lat: number
  lng: number
  motivo?: string | null
  ts: string
}

export function initOfflineDBv2(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_VISITAS_OFFLINE)) {
        const store = db.createObjectStore(STORE_VISITAS_OFFLINE, { keyPath: 'offline_id' })
        store.createIndex('timestamp', 'timestamp', { unique: false })
        store.createIndex('asesor_id', 'asesor_id', { unique: false })
      }
      if (!db.objectStoreNames.contains(STORE_GPS_OFFLINE)) {
        db.createObjectStore(STORE_GPS_OFFLINE, { keyPath: 'cliente_id' })
      }
    }
  })
}

export async function guardarGPSOffline(clienteId: string, lat: number, lng: number, motivo?: string | null): Promise<void> {
  const db = await initOfflineDBv2()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_GPS_OFFLINE, 'readwrite')
    const store = tx.objectStore(STORE_GPS_OFFLINE)
    const request = store.put({ cliente_id: clienteId, lat, lng, motivo: motivo ?? null, ts: new Date().toISOString() })
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function obtenerGPSPendientes(): Promise<GPSPendiente[]> {
  const db = await initOfflineDBv2()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_GPS_OFFLINE, 'readonly')
    const store = tx.objectStore(STORE_GPS_OFFLINE)
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function eliminarGPSPendiente(clienteId: string): Promise<void> {
  const db = await initOfflineDBv2()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_GPS_OFFLINE, 'readwrite')
    const store = tx.objectStore(STORE_GPS_OFFLINE)
    const request = store.delete(clienteId)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function sincronizarGPSPendientes(): Promise<void> {
  const pendientes = await obtenerGPSPendientes()
  if (pendientes.length === 0) return
  for (const { cliente_id, lat, lng, motivo } of pendientes) {
    try {
      const res = await fetch('/api/clientes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_id, lat, lng, motivo }),
      })
      if (res.ok) await eliminarGPSPendiente(cliente_id)
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
