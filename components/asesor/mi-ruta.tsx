"use client"

// ============================================================================
// components/asesor/mi-ruta.tsx — CON CÁMARA EN CHECK-IN
// ✅ Todo lo anterior +
// ✅ Botón "Actualizar ubicación" siempre visible (no solo cuando sin GPS)
// ✅ Jhoan puede corregir coordenadas incorrectas desde campo
// ============================================================================

import { useState, useEffect, useRef } from "react"
import useSWR from "swr"
import {
  Bell, MapPin, Check, AlertTriangle, Clock, X,
  Loader2, Wifi, WifiOff, DollarSign, Search,
  ChevronLeft, ChevronRight, ShoppingBag, Eye,
  Plus, UserPlus, Navigation, Camera, ImageIcon
} from "lucide-react"
import {
  type ClienteConEstado,
  formatearDistancia,
  obtenerPosicionGPS,
  hayConexion,
  guardarVisitaOffline,
  sincronizarVisitasOffline,
  generarOfflineID,
} from "@/lib/db"
import { type AsesorSession } from "./login-asesor"

type ClientStatus = "validada" | "sospechosa" | "pendiente"
type TipoGestion  = "visita" | "pedido" | null
type Vista        = "lista" | "gestion" | "nuevo-cliente"

const statusConfig: Record<ClientStatus, {
  barColor: string; bgOpacity: string; textColor: string; label: string
}> = {
  validada:   { barColor: "bg-success",  bgOpacity: "bg-success/15",  textColor: "text-success",  label: "VISITADO"   },
  sospechosa: { barColor: "bg-warning",  bgOpacity: "bg-warning/15",  textColor: "text-warning",  label: "SOSPECHOSA" },
  pendiente:  { barColor: "bg-gray-600", bgOpacity: "bg-gray-500/15", textColor: "text-gray-400", label: "PENDIENTE"  },
}

const fetcher = (url: string) => fetch(url).then(r => r.json())

function getCurrentTime() {
  return new Date().toLocaleTimeString("es-CO", {
    timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", second: "2-digit"
  })
}
function fechaColombia() {
  return new Date().toLocaleString('en-CA', { timeZone: 'America/Bogota' }).split(',')[0]
}
function getInitials(nombre: string) {
  return nombre.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
}
function getRuta(nombre: string): string {
  if (!nombre) return '—'
  const match = nombre.match(/^([A-Z0-9]+)\s/)
  return match ? match[1] : '—'
}
function getNombreSinRuta(nombre: string): string {
  if (!nombre) return ''
  const partes = nombre.split(' ')
  return partes.length > 1 ? partes.slice(1).join(' ') : nombre
}
function calcularDistancia(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
function determinarEstado(cliente: ClienteConEstado): ClientStatus {
  if (!cliente.visitado_en) return "pendiente"
  return cliente.validada ? "validada" : "sospechosa"
}

async function comprimirImagen(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const MAX = 900
      let { width, height } = img
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX }
        else { width = Math.round(width * MAX / height); height = MAX }
      }
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)
      const base64 = canvas.toDataURL('image/jpeg', 0.72)
      URL.revokeObjectURL(url)
      resolve(base64)
    }
    img.onerror = reject
    img.src = url
  })
}

interface MiRutaProps { asesor: AsesorSession }

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================
export function MiRuta({ asesor }: MiRutaProps) {
  const ASESOR_ID = asesor.id
  const fecha = fechaColombia()

  const [currentTime, setCurrentTime]     = useState(getCurrentTime())
  const [isOnline, setIsOnline]           = useState(true)
  const [userLocation, setUserLocation]   = useState<{ lat: number; lng: number } | null>(null)
  const [vista, setVista]                 = useState<Vista>("lista")
  const [clienteActivo, setClienteActivo] = useState<ClienteConEstado | null>(null)
  const [buscar, setBuscar]               = useState("")
  const [filtroRuta, setFiltroRuta]       = useState("")

  const { data, error, mutate } = useSWR(
    `/api/clientes-del-dia?asesor_id=${ASESOR_ID}&fecha=${fecha}`,
    fetcher,
    { refreshInterval: 30000, revalidateOnFocus: true }
  )
  const { data: resumenData } = useSWR(
    `/api/resumen-dia?asesor_id=${ASESOR_ID}&fecha=${fecha}`,
    fetcher,
    { refreshInterval: 30000 }
  )

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(getCurrentTime()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    if (navigator.onLine) {
      sincronizarVisitasOffline().then(({ sincronizadas }) => { if (sincronizadas > 0) mutate() })
    }
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [isOnline, mutate])

  useEffect(() => {
    const update = async () => {
      try {
        const pos = await obtenerPosicionGPS()
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      } catch {}
    }
    update()
    const t = setInterval(update, 10000)
    return () => clearInterval(t)
  }, [])

  // ── Enviar ubicación al supervisor cada 2 minutos ─────────────────────────
  useEffect(() => {
    const enviar = () => {
      if (!navigator.geolocation) return
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            await fetch('/api/ubicacion-asesor', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                asesor_id: ASESOR_ID,
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
              }),
            })
          } catch {}
        },
        () => {},
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
      )
    }
    enviar()
    const t = setInterval(enviar, 2 * 60 * 1000)
    return () => clearInterval(t)
  }, [ASESOR_ID])

  const todosClientes: ClienteConEstado[] = data?.clientes ?? []
  const stats = data?.stats ?? { total: 0, validadas: 0, sospechosas: 0, pendientes: 0 }

  const rutasUnicas = Array.from(
    new Set(todosClientes.map(c => getRuta(c.nombre)))
  ).filter(r => r !== '—').sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

  const clientesFiltrados = todosClientes.filter(c => {
    const matchRuta   = filtroRuta ? getRuta(c.nombre) === filtroRuta : true
    const matchBuscar = buscar
      ? c.nombre.toLowerCase().includes(buscar.toLowerCase()) ||
        (c.codigo || '').toLowerCase().includes(buscar.toLowerCase())
      : true
    return matchRuta && matchBuscar
  })

  const visited = stats.validadas + stats.sospechosas
  const total   = stats.total

  if (vista === "gestion" && clienteActivo) {
    return (
      <GestionCliente
        cliente={clienteActivo}
        asesorId={ASESOR_ID}
        userLocation={userLocation}
        isOnline={isOnline}
        onVolver={() => { setVista("lista"); setClienteActivo(null) }}
        onExito={() => { setVista("lista"); setClienteActivo(null); mutate() }}
      />
    )
  }

  if (vista === "nuevo-cliente") {
    return (
      <NuevoCliente
        asesorId={ASESOR_ID}
        userLocation={userLocation}
        onVolver={() => setVista("lista")}
        onExito={() => { setVista("lista"); mutate() }}
      />
    )
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center px-4">
        <div className="text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-danger" />
          <p className="mt-4 text-white">Error cargando clientes</p>
          <button onClick={() => mutate()} className="mt-2 text-sm text-navy-accent hover:underline">Reintentar</button>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-navy-accent" />
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-navy-accent text-sm font-bold text-white">
            {getInitials(asesor.nombre)}
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{asesor.nombre}</p>
            <p className="text-xs text-gray-400">Asesor Comercial{asesor.zona ? ` — ${asesor.zona}` : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isOnline ? <Wifi className="h-4 w-4 text-success" /> : <WifiOff className="h-4 w-4 text-warning" />}
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl text-gray-400">
            <Bell className="h-5 w-5" />
            {stats.sospechosas > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-danger" />}
          </div>
        </div>
      </div>

      {/* Hero progreso */}
      <div className="mx-4 mt-3 overflow-hidden rounded-xl bg-navy p-5">
        <div className="flex items-baseline gap-1">
          <span className="text-5xl font-bold tracking-tight text-white">{visited}</span>
          <span className="text-2xl font-medium text-white/50">/ {total}</span>
        </div>
        <p className="mt-0.5 text-sm text-white/60">visitas completadas hoy</p>
        <div className="relative mt-4 h-3 overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              total === 0 ? 'bg-gray-600' :
              (visited/total) >= 0.8 ? "bg-success" :
              (visited/total) >= 0.6 ? "bg-warning" : "bg-danger"
            }`}
            style={{ width: `${total > 0 ? Math.round((visited/total)*100) : 0}%` }}
          />
        </div>
        <div className="mt-4 flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 text-success" />
            <span className="text-xs font-medium text-success">{stats.validadas} Validadas</span>
          </div>
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-warning" />
            <span className="text-xs font-medium text-warning">{stats.sospechosas} Sospechosas</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-gray-400" />
            <span className="text-xs font-medium text-gray-400">{stats.pendientes} Pendientes</span>
          </div>
          <div className="ml-auto">
            <span className="font-mono text-xs text-white/40">{currentTime}</span>
          </div>
        </div>
      </div>

      {/* Resumen ventas */}
      {resumenData?.metricas?.pedidos?.efectivos > 0 && (
        <div className="mx-4 mt-3 rounded-xl bg-navy-accent/20 border border-navy-accent/30 p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-navy-accent" />
            <span className="text-sm font-semibold text-white">Ventas del día</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xs text-white/50">Pedidos</p>
              <p className="text-xl font-bold text-success">{resumenData.metricas.pedidos.efectivos}</p>
            </div>
            <div className="border-x border-white/10">
              <p className="text-xs text-white/50">Total</p>
              <p className="text-base font-bold text-white">{resumenData.metricas.pedidos.total_vendido_formato}</p>
            </div>
            <div>
              <p className="text-xs text-white/50">Promedio</p>
              <p className="text-base font-bold text-white">{resumenData.metricas.pedidos.promedio_pedido_formato}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="mx-4 mt-4 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <input
            type="text"
            value={buscar}
            onChange={e => setBuscar(e.target.value)}
            placeholder="Buscar por nombre o código..."
            className="w-full rounded-xl border border-white/10 bg-dark-surface pl-10 pr-10 py-2.5 text-sm text-white placeholder-gray-500 focus:border-navy-accent focus:outline-none"
          />
          {buscar && (
            <button onClick={() => setBuscar("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {rutasUnicas.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setFiltroRuta("")}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filtroRuta === "" ? "bg-navy-accent text-white" : "bg-dark-surface text-gray-400 border border-white/10"
              }`}
            >Todas</button>
            {rutasUnicas.map(r => (
              <button
                key={r}
                onClick={() => setFiltroRuta(filtroRuta === r ? "" : r)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  filtroRuta === r ? "bg-navy-accent text-white" : "bg-dark-surface text-gray-400 border border-white/10"
                }`}
              >Ruta {r}</button>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-500 px-1">
          {clientesFiltrados.length} de {total} clientes
          {filtroRuta && ` · Ruta ${filtroRuta}`}
          {buscar && ` · "${buscar}"`}
        </p>
      </div>

      {/* Lista de clientes */}
      <div className="mt-3 flex flex-col gap-2 px-4 pb-40">
        {clientesFiltrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="h-10 w-10 text-gray-600 mb-3" />
            <p className="text-gray-400 text-sm">No se encontraron clientes</p>
            <button onClick={() => { setBuscar(""); setFiltroRuta("") }} className="mt-2 text-xs text-navy-accent hover:underline">Limpiar filtros</button>
          </div>
        ) : (
          clientesFiltrados.map((cliente: ClienteConEstado) => {
            const estado    = determinarEstado(cliente)
            const config    = statusConfig[estado]
            const yaVisitado = !!cliente.visitado_en
            const sinGPS    = !cliente.lat || !cliente.lng

            let distanciaTexto = sinGPS ? "Sin GPS" : "---"
            if (!sinGPS && userLocation && cliente.lat && cliente.lng) {
              const d = calcularDistancia(
                userLocation.lat, userLocation.lng,
                parseFloat(String(cliente.lat)),
                parseFloat(String(cliente.lng))
              )
              distanciaTexto = formatearDistancia(d)
            } else if (cliente.distancia_metros) {
              distanciaTexto = formatearDistancia(cliente.distancia_metros)
            }

            return (
              <button
                key={cliente.id}
                onClick={() => { setClienteActivo(cliente); setVista("gestion") }}
                className={`flex overflow-hidden rounded-xl border transition-all duration-150 active:scale-[0.98] text-left w-full ${
                  yaVisitado ? "border-white/5 bg-dark-surface opacity-70" :
                  sinGPS ? "border-warning/30 bg-dark-surface" :
                  "border-white/10 bg-dark-surface hover:border-navy-accent/50"
                }`}
              >
                <div className={`w-1 shrink-0 ${config.barColor}`} />
                <div className="flex flex-1 items-center gap-3 px-3 py-3">
                  <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold font-mono text-gray-300">
                    {getRuta(cliente.nombre)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white truncate">{getNombreSinRuta(cliente.nombre)}</p>
                    <p className="truncate text-xs text-gray-500">{cliente.direccion}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`font-mono text-[11px] ${sinGPS ? 'text-warning' : 'text-gray-400'}`}>
                      {distanciaTexto}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${config.bgOpacity} ${config.textColor}`}>
                      {config.label}
                    </span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-600 shrink-0" />
                </div>
              </button>
            )
          })
        )}
      </div>

      {/* Botón flotante: Nuevo Cliente */}
      <button
        onClick={() => setVista("nuevo-cliente")}
        className="fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-full bg-navy-accent px-4 py-3 text-white shadow-lg shadow-navy-accent/30 transition-all active:scale-95 hover:bg-navy-accent/90"
      >
        <Plus className="h-5 w-5" />
        <span className="text-sm font-semibold">Nuevo Cliente</span>
      </button>
    </div>
  )
}

// ============================================================================
// GESTIÓN DEL CLIENTE
// ============================================================================
interface GestionClienteProps {
  cliente: ClienteConEstado
  asesorId: string
  userLocation: { lat: number; lng: number } | null
  isOnline: boolean
  onVolver: () => void
  onExito: () => void
}

function GestionCliente({ cliente, asesorId, userLocation, isOnline, onVolver, onExito }: GestionClienteProps) {
  const [tipoGestion, setTipoGestion]       = useState<TipoGestion>(null)
  const [monto, setMonto]                   = useState("")
  const [nota, setNota]                     = useState("")
  const [loading, setLoading]               = useState(false)
  const [guardandoGPS, setGuardandoGPS]     = useState(false)
  const [gpsGuardado, setGpsGuardado]       = useState(false)
  const [distancia, setDistancia]           = useState<number | null>(null)
  const [mostrarActualizarGPS, setMostrarActualizarGPS] = useState(false)

  const fileInputRef                = useRef<HTMLInputElement>(null)
  const [fotoPreview, setFotoPreview]   = useState<string | null>(null)
  const [fotoBase64, setFotoBase64]     = useState<string | null>(null)
  const [subiendoFoto, setSubiendoFoto] = useState(false)

  const yaVisitado     = !!cliente.visitado_en
  const sinGPS         = !cliente.lat || !cliente.lng || (parseFloat(String(cliente.lat)) === 0 && parseFloat(String(cliente.lng)) === 0)
  const radioPermitido = cliente.radio_metros ?? 50
  const dentroDelRango = distancia !== null && distancia <= radioPermitido

  useEffect(() => {
    if (userLocation && cliente.lat && cliente.lng) {
      const lat = parseFloat(String(cliente.lat))
      const lng = parseFloat(String(cliente.lng))
      if (lat !== 0 && lng !== 0) {
        setDistancia(calcularDistancia(userLocation.lat, userLocation.lng, lat, lng))
      }
    }
  }, [userLocation, cliente.lat, cliente.lng])

  const handleAbrirCamara = () => fileInputRef.current?.click()

  const handleFotoSeleccionada = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSubiendoFoto(true)
    try {
      const base64 = await comprimirImagen(file)
      setFotoPreview(base64)
      setFotoBase64(base64)
    } catch {
      alert("Error procesando la foto. Intenta nuevamente.")
    } finally {
      setSubiendoFoto(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleCapturarGPS = async () => {
    if (!userLocation) { alert("Esperando GPS. Activa la ubicación."); return }
    setGuardandoGPS(true)
    try {
      const res = await fetch('/api/clientes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_id: cliente.id, lat: userLocation.lat, lng: userLocation.lng }),
      })
      if (!res.ok) throw new Error()
      setGpsGuardado(true)
      setDistancia(0)
      setMostrarActualizarGPS(false)
    } catch {
      alert("Error guardando coordenadas. Intenta nuevamente.")
    } finally {
      setGuardandoGPS(false)
    }
  }

  const handleRegistrar = async () => {
    if (!tipoGestion) return
    if (!userLocation) { alert("Esperando GPS. Activa la ubicación."); return }
    if (tipoGestion === "pedido" && (!monto || parseFloat(monto) <= 0)) {
      alert("Ingresa el monto del pedido"); return
    }
    setLoading(true)
    try {
      let foto_url: string | null = null
      if (fotoBase64) {
        const uploadRes = await fetch('/api/upload-foto', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ foto_base64: fotoBase64 }),
        })
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json()
          foto_url = uploadData.url
        }
      }

      const payload = {
        asesor_id:    asesorId,
        cliente_id:   cliente.id,
        lat:          userLocation.lat,
        lng:          userLocation.lng,
        notas:        nota || null,
        hubo_pedido:  tipoGestion === "pedido",
        valor_pedido: tipoGestion === "pedido" ? parseFloat(monto) : 0,
        foto_url,
      }

      if (hayConexion()) {
        const res = await fetch('/api/checkin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error()
      } else {
        await guardarVisitaOffline({
          offline_id:    generarOfflineID(),
          asesor_id:     payload.asesor_id,
          cliente_id:    payload.cliente_id,
          lat_capturada: payload.lat,
          lng_capturada: payload.lng,
          notas:         payload.notas,
          timestamp:     new Date().toISOString(),
          synced:        false,
        })
      }
      onExito()
    } catch {
      alert("Error al registrar. Intenta nuevamente.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-dark-bg">

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFotoSeleccionada}
      />

      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-white/10">
        <button onClick={onVolver} className="flex h-9 w-9 items-center justify-center rounded-xl bg-dark-surface text-gray-400 hover:text-white transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 font-mono">Ruta {getRuta(cliente.nombre)}</p>
          <h2 className="text-base font-bold text-white truncate">{getNombreSinRuta(cliente.nombre)}</h2>
        </div>
        {yaVisitado && (
          <span className="shrink-0 rounded-full bg-success/20 text-success text-xs font-bold px-2 py-0.5">YA VISITADO</span>
        )}
        {sinGPS && !gpsGuardado && (
          <span className="shrink-0 rounded-full bg-warning/20 text-warning text-xs font-bold px-2 py-0.5">SIN GPS</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-32">

        {/* Info del cliente */}
        <div className="rounded-xl bg-dark-surface border border-white/10 p-4 space-y-2">
          {cliente.direccion && (
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-gray-500 mt-0.5 shrink-0" />
              <p className="text-sm text-gray-300">{cliente.direccion}</p>
            </div>
          )}
          {cliente.codigo && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Código:</span>
              <span className="text-xs font-mono text-gray-300">{cliente.codigo}</span>
            </div>
          )}
          {/* Botón actualizar ubicación — siempre visible */}
          <button
            onClick={() => setMostrarActualizarGPS(!mostrarActualizarGPS)}
            className="flex items-center gap-1.5 mt-1 text-xs text-gray-500 hover:text-navy-accent transition-colors"
          >
            <Navigation className="h-3.5 w-3.5" />
            {sinGPS ? 'Capturar ubicación' : 'Actualizar ubicación'}
          </button>
        </div>

        {/* Panel actualizar GPS — expandible */}
        {(sinGPS || mostrarActualizarGPS) && !gpsGuardado && (
          <div className={`rounded-xl border p-4 ${sinGPS ? 'border-warning/40 bg-warning/10' : 'border-navy-accent/30 bg-navy-accent/5'}`}>
            <div className="flex items-start gap-3 mb-3">
              <Navigation className={`h-5 w-5 mt-0.5 shrink-0 ${sinGPS ? 'text-warning' : 'text-navy-accent'}`} />
              <div>
                <p className="text-sm font-semibold text-white">
                  {sinGPS ? 'Sin ubicación GPS' : 'Actualizar ubicación'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {sinGPS
                    ? 'Párate en el punto exacto del cliente y captura.'
                    : 'Párate en el punto exacto del cliente y actualiza las coordenadas.'
                  }
                </p>
                {userLocation && (
                  <p className="text-[10px] text-gray-500 mt-1 font-mono">
                    Tu posición: {userLocation.lat.toFixed(6)}, {userLocation.lng.toFixed(6)}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={handleCapturarGPS}
              disabled={guardandoGPS || !userLocation}
              className={`flex w-full items-center justify-center gap-2 rounded-xl border py-3 font-semibold text-sm transition-all active:scale-[0.97] disabled:opacity-50 ${
                sinGPS
                  ? 'bg-warning/20 border-warning/40 text-warning'
                  : 'bg-navy-accent/20 border-navy-accent/40 text-navy-accent'
              }`}
            >
              {guardandoGPS
                ? <><Loader2 className="h-4 w-4 animate-spin" /><span>Guardando...</span></>
                : <><Navigation className="h-4 w-4" /><span>{sinGPS ? 'Capturar ubicación' : 'Guardar nueva ubicación'}</span></>
              }
            </button>
          </div>
        )}

        {gpsGuardado && (
          <div className="rounded-xl border border-success/30 bg-success/10 p-3 flex items-center gap-2">
            <Check className="h-4 w-4 text-success shrink-0" />
            <p className="text-sm text-success font-medium">Ubicación actualizada ✓</p>
          </div>
        )}

        {/* GPS Status */}
        {(!sinGPS || gpsGuardado) && (
          <div className={`rounded-xl border p-4 ${
            !userLocation ? "border-gray-700 bg-gray-800/50" :
            dentroDelRango ? "border-success/30 bg-success/10" : "border-warning/30 bg-warning/10"
          }`}>
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                !userLocation ? "bg-gray-700" :
                dentroDelRango ? "bg-success/20" : "bg-warning/20"
              }`}>
                {!userLocation
                  ? <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                  : dentroDelRango
                  ? <Check className="h-5 w-5 text-success" />
                  : <AlertTriangle className="h-5 w-5 text-warning" />
                }
              </div>
              <div>
                {!userLocation ? (
                  <><p className="text-sm font-medium text-white">Obteniendo GPS...</p><p className="text-xs text-gray-400">Activa la ubicación</p></>
                ) : gpsGuardado ? (
                  <><p className="text-sm font-medium text-success">Ubicación actualizada ✓</p><p className="text-xs text-gray-300">La visita se registrará como validada</p></>
                ) : dentroDelRango ? (
                  <><p className="text-sm font-medium text-success">Dentro del rango ✓</p><p className="text-xs text-gray-300">A {formatearDistancia(distancia!)} del cliente</p></>
                ) : (
                  <><p className="text-sm font-medium text-warning">Fuera del rango</p><p className="text-xs text-gray-300">A {formatearDistancia(distancia!)} — sospechosa</p></>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Ya visitado */}
        {yaVisitado ? (
          <div className="rounded-xl bg-dark-surface border border-white/10 p-4">
            <p className="text-sm font-semibold text-white mb-3">Registro de hoy</p>
            <div className="space-y-2 text-sm text-gray-400">
              <div className="flex justify-between">
                <span>Estado</span>
                <span className={cliente.validada ? "text-success font-medium" : "text-warning font-medium"}>
                  {cliente.validada ? "✓ Validada" : "⚠ Sospechosa"}
                </span>
              </div>
              {cliente.distancia_metros && (
                <div className="flex justify-between">
                  <span>Distancia</span>
                  <span className="text-white">{formatearDistancia(cliente.distancia_metros)}</span>
                </div>
              )}
              {!cliente.foto_url && (
                <p className="text-xs text-gray-600 text-center pt-1">Sin foto en esta visita</p>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Foto de visita anterior */}
            {cliente.foto_url && (
              <div className="rounded-xl overflow-hidden border border-white/10">
                <div className="flex items-center gap-2 px-4 py-2 bg-dark-surface border-b border-white/10">
                  <ImageIcon className="h-4 w-4 text-gray-400" />
                  <p className="text-xs font-medium text-gray-400">Foto de visita anterior</p>
                </div>
                <img src={cliente.foto_url} alt="Foto de visita" className="w-full object-cover max-h-56" />
              </div>
            )}

            {/* Tipo de gestión */}
            <div>
              <p className="text-sm font-semibold text-white mb-3">¿Qué pasó en esta visita?</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setTipoGestion(tipoGestion === "visita" ? null : "visita")}
                  className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition-all ${
                    tipoGestion === "visita"
                      ? "border-navy-accent bg-navy-accent/20 text-white"
                      : "border-white/10 bg-dark-surface text-gray-400"
                  }`}
                >
                  <Eye className={`h-7 w-7 ${tipoGestion === "visita" ? "text-navy-accent" : "text-gray-500"}`} />
                  <span className="text-sm font-semibold">Solo Visita</span>
                  <span className="text-[10px] text-center opacity-70">Sin pedido</span>
                </button>
                <button
                  onClick={() => setTipoGestion(tipoGestion === "pedido" ? null : "pedido")}
                  className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition-all ${
                    tipoGestion === "pedido"
                      ? "border-success bg-success/20 text-white"
                      : "border-white/10 bg-dark-surface text-gray-400"
                  }`}
                >
                  <ShoppingBag className={`h-7 w-7 ${tipoGestion === "pedido" ? "text-success" : "text-gray-500"}`} />
                  <span className="text-sm font-semibold">Hubo Pedido</span>
                  <span className="text-[10px] text-center opacity-70">Registrar monto</span>
                </button>
              </div>
            </div>

            {/* Monto */}
            {tipoGestion === "pedido" && (
              <div className="rounded-xl bg-dark-surface border border-success/30 p-4">
                <label className="block text-sm font-medium text-white mb-2">Monto del pedido</label>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-gray-400">$</span>
                  <input
                    type="number"
                    value={monto}
                    onChange={e => setMonto(e.target.value)}
                    placeholder="0"
                    min="0"
                    step="1000"
                    autoFocus
                    inputMode="numeric"
                    className="flex-1 bg-transparent text-2xl font-bold text-white placeholder-gray-600 focus:outline-none"
                  />
                  <span className="text-sm text-gray-500">COP</span>
                </div>
                {monto && parseFloat(monto) > 0 && (
                  <p className="mt-1 text-xs text-success">${parseFloat(monto).toLocaleString('es-CO')}</p>
                )}
              </div>
            )}

            {/* Nota */}
            {tipoGestion && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nota (opcional)</label>
                <textarea
                  value={nota}
                  onChange={e => setNota(e.target.value)}
                  placeholder="Ej: Cliente no estaba, volver mañana..."
                  rows={2}
                  className="w-full resize-none rounded-xl border border-white/10 bg-dark-surface px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-navy-accent focus:outline-none"
                />
              </div>
            )}

            {/* Foto */}
            {tipoGestion && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-white">Foto del punto de venta</p>
                {!fotoPreview ? (
                  <button
                    onClick={handleAbrirCamara}
                    disabled={subiendoFoto}
                    className="flex w-full items-center justify-center gap-3 rounded-xl border-2 border-dashed border-white/20 bg-dark-surface py-6 text-gray-400 transition-all hover:border-navy-accent/50 hover:text-gray-300 active:scale-[0.98] disabled:opacity-50"
                  >
                    {subiendoFoto
                      ? <><Loader2 className="h-6 w-6 animate-spin" /><span className="text-sm">Procesando...</span></>
                      : <><Camera className="h-6 w-6" /><span className="text-sm font-medium">Tomar foto</span></>
                    }
                  </button>
                ) : (
                  <div className="relative rounded-xl overflow-hidden border border-success/30">
                    <img src={fotoPreview} alt="Foto" className="w-full object-cover max-h-52" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <Check className="h-4 w-4 text-success" />
                        <span className="text-xs font-medium text-white">Foto lista</span>
                      </div>
                      <button
                        onClick={() => { setFotoPreview(null); setFotoBase64(null) }}
                        className="flex items-center gap-1 rounded-lg bg-black/40 px-2 py-1 text-xs text-white"
                      >
                        <Camera className="h-3 w-3" /> Cambiar
                      </button>
                    </div>
                  </div>
                )}
                <p className="text-[10px] text-gray-600 text-center">
                  {fotoPreview ? "La foto se subirá al confirmar" : "Opcional — evidencia de la visita"}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Botón confirmar */}
      {!yaVisitado && tipoGestion && (
        <div className="fixed inset-x-0 bottom-16 z-40 px-4 pb-3">
          <button
            onClick={handleRegistrar}
            disabled={loading || !userLocation}
            className={`flex w-full items-center justify-center gap-3 rounded-xl py-4 text-white font-bold text-base shadow-lg transition-all active:scale-[0.97] disabled:opacity-50 ${
              tipoGestion === "pedido" ? "bg-success shadow-success/25" : "bg-navy-accent shadow-navy-accent/25"
            }`}
          >
            {loading
              ? <><Loader2 className="h-5 w-5 animate-spin" /><span>REGISTRANDO...</span></>
              : tipoGestion === "pedido"
              ? <><ShoppingBag className="h-5 w-5" /><span>CONFIRMAR PEDIDO{monto ? ` · $${parseFloat(monto).toLocaleString('es-CO')}` : ''}</span></>
              : <><Check className="h-5 w-5" /><span>CONFIRMAR VISITA</span></>
            }
          </button>
          {!isOnline && (
            <p className="mt-1.5 text-center text-[10px] text-warning">
              SIN CONEXIÓN — se guardará y sincronizará al reconectar
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// NUEVO CLIENTE
// ============================================================================
interface NuevoClienteProps {
  asesorId: string
  userLocation: { lat: number; lng: number } | null
  onVolver: () => void
  onExito: () => void
}

function NuevoCliente({ asesorId, userLocation, onVolver, onExito }: NuevoClienteProps) {
  const [ruta, setRuta]           = useState("")
  const [nombre, setNombre]       = useState("")
  const [direccion, setDireccion] = useState("")
  const [telefono, setTelefono]   = useState("")
  const [usarGPS, setUsarGPS]     = useState(true)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState("")

  const handleCrear = async () => {
    if (!nombre.trim()) { setError("El nombre es obligatorio"); return }
    setError("")
    setLoading(true)
    try {
      const nombreFinal = ruta.trim()
        ? `${ruta.trim().toUpperCase()} ${nombre.trim().toUpperCase()}`
        : nombre.trim().toUpperCase()

      const payload = {
        nombre:    nombreFinal,
        direccion: direccion.trim() || null,
        telefono:  telefono.trim() || null,
        asesor_id: asesorId,
        lat:       usarGPS && userLocation ? userLocation.lat : null,
        lng:       usarGPS && userLocation ? userLocation.lng : null,
      }
      const res = await fetch('/api/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || "Error creando cliente"); return }
      onExito()
    } catch {
      setError("Error de conexión. Intenta nuevamente.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-dark-bg">
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-white/10">
        <button onClick={onVolver} className="flex h-9 w-9 items-center justify-center rounded-xl bg-dark-surface text-gray-400 hover:text-white transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <p className="text-xs text-gray-500">Nuevo cliente</p>
          <h2 className="text-base font-bold text-white">Registrar cliente</h2>
        </div>
        <UserPlus className="ml-auto h-5 w-5 text-navy-accent" />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-32">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Ruta y nombre *</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={ruta}
              onChange={e => setRuta(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase())}
              placeholder="Ruta"
              maxLength={4}
              inputMode="numeric"
              className="w-20 rounded-xl border border-white/10 bg-dark-surface px-3 py-3 text-sm text-white placeholder-gray-500 focus:border-navy-accent focus:outline-none text-center font-mono"
            />
            <input
              type="text"
              value={nombre}
              onChange={e => { setNombre(e.target.value); setError("") }}
              placeholder="Nombre del cliente"
              autoFocus
              className={`flex-1 rounded-xl border bg-dark-surface px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none transition-all ${
                error && !nombre ? "border-danger" : "border-white/10 focus:border-navy-accent"
              }`}
            />
          </div>
          {(ruta || nombre) && (
            <p className="mt-1.5 px-1 text-xs text-gray-500">
              Se guardará como: <span className="text-white font-mono">{ruta ? `${ruta.toUpperCase()} ` : ""}{nombre.toUpperCase()}</span>
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Dirección</label>
          <input
            type="text"
            value={direccion}
            onChange={e => setDireccion(e.target.value)}
            placeholder="Ej: Calle 5 #10-20"
            className="w-full rounded-xl border border-white/10 bg-dark-surface px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-navy-accent focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Teléfono</label>
          <input
            type="tel"
            value={telefono}
            onChange={e => setTelefono(e.target.value)}
            placeholder="Ej: 3001234567"
            inputMode="tel"
            className="w-full rounded-xl border border-white/10 bg-dark-surface px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-navy-accent focus:outline-none"
          />
        </div>

        <div className={`rounded-xl border p-4 ${usarGPS && userLocation ? "border-success/30 bg-success/10" : "border-white/10 bg-dark-surface"}`}>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={usarGPS}
              onChange={e => setUsarGPS(e.target.checked)}
              className="h-4 w-4 rounded border-white/20 text-success focus:ring-success"
            />
            <div>
              <p className="text-sm font-medium text-white">Capturar ubicación GPS ahora</p>
              <p className="text-xs text-gray-400">
                {usarGPS ? userLocation ? `📍 ${userLocation.lat.toFixed(5)}, ${userLocation.lng.toFixed(5)}` : "Obteniendo GPS..." : "Sin ubicación"}
              </p>
            </div>
          </label>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-danger/10 border border-danger/20 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-danger shrink-0" />
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-16 z-40 px-4 pb-3">
        <button
          onClick={handleCrear}
          disabled={loading || !nombre.trim()}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-navy-accent py-4 text-white font-bold text-base shadow-lg shadow-navy-accent/25 transition-all active:scale-[0.97] disabled:opacity-50"
        >
          {loading
            ? <><Loader2 className="h-5 w-5 animate-spin" /><span>CREANDO...</span></>
            : <><UserPlus className="h-5 w-5" /><span>CREAR CLIENTE</span></>
          }
        </button>
      </div>
    </div>
  )
}
