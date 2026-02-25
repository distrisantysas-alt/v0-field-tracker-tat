"use client"
// ============================================================================
// components/supervisor/supervisor-mapa-asesores.tsx
// Carga dinámica — solo en cliente, nunca en servidor
// ============================================================================
import { useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { Loader2, Map } from "lucide-react"

const fetcher = (url: string) => fetch(url).then(r => r.json())

function getInitials(nombre: string) {
  return nombre.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
}

export default function SupervisorMapaAsesores() {
  const mapRef     = useRef<HTMLDivElement>(null)
  const leafletRef = useRef<any>(null)
  const markersRef = useRef<Map<string, any>>(new Map())
  const [mapReady, setMapReady]   = useState(false)
  const [asesorSel, setAsesorSel] = useState<any>(null)

  const { data, isLoading } = useSWR('/api/ubicacion-asesor', fetcher, { refreshInterval: 30000 })
  const ubicaciones = data?.ubicaciones ?? []

  // Cargar Leaflet
  useEffect(() => {
    if (typeof window === "undefined" || leafletRef.current) return
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'; link.rel = 'stylesheet'
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'
      document.head.appendChild(link)
    }
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'
    script.onload = () => { leafletRef.current = (window as any).L; setMapReady(true) }
    document.head.appendChild(script)
  }, [])

  // Inicializar mapa
  useEffect(() => {
    if (!mapReady || !mapRef.current || !leafletRef.current) return
    if ((mapRef.current as any)._leaflet_id) return
    const L = leafletRef.current
    const map = L.map(mapRef.current, { center: [7.119, -73.1227], zoom: 13 })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19
    }).addTo(map)
    ;(mapRef.current as any)._mapInstance = map
  }, [mapReady])

  // Actualizar pins
  useEffect(() => {
    if (!mapReady || !ubicaciones.length) return
    const map = (mapRef.current as any)?._mapInstance
    const L = leafletRef.current
    if (!map || !L) return

    ubicaciones.forEach((u: any) => {
      const minutos = Math.round(u.minutos_atras ?? 0)
      const color   = minutos <= 10 ? '#1A7A4A' : minutos <= 30 ? '#D97706' : '#4B5563'
      const initials = getInitials(u.nombre)
      const activo   = minutos <= 10

      const icon = L.divIcon({
        className: '',
        html: `<div style="position:relative">
          <div style="background:${color};border:2px solid white;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.4);">
            <span style="font-size:11px;font-weight:700;color:#fff;font-family:sans-serif;">${initials}</span>
          </div>
          ${activo ? `<div style="position:absolute;bottom:-2px;right:-2px;width:10px;height:10px;background:#1A7A4A;border:2px solid white;border-radius:50%;"></div>` : ''}
        </div>`,
        iconSize: [36, 36], iconAnchor: [18, 18],
      })

      if (markersRef.current.has(u.asesor_id)) {
        const marker = markersRef.current.get(u.asesor_id)
        marker.setLatLng([u.lat, u.lng])
        marker.setIcon(icon)
      } else {
        const marker = L.marker([u.lat, u.lng], { icon }).addTo(map)
        marker.on('click', () => setAsesorSel(u))
        markersRef.current.set(u.asesor_id, marker)
      }
    })

    const arr = Array.from(markersRef.current.values())
    if (arr.length > 0) {
      const group = L.featureGroup(arr)
      map.fitBounds(group.getBounds().pad(0.2))
    }
  }, [mapReady, data])

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 200px)' }}>
      {/* Leyenda */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-white/10 bg-dark-surface">
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-success" />
          <span className="text-[11px] text-gray-400">Activo (&lt;10 min)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-warning" />
          <span className="text-[11px] text-gray-400">&lt;30 min</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-gray-500" />
          <span className="text-[11px] text-gray-400">Inactivo</span>
        </div>
        <span className="ml-auto text-[11px] text-gray-500">{ubicaciones.length} asesores</span>
      </div>

      {/* Mapa */}
      <div className="relative flex-1">
        {(isLoading || !mapReady) && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-dark-bg">
            <Loader2 className="h-7 w-7 animate-spin text-navy-accent" />
          </div>
        )}
        {!isLoading && ubicaciones.length === 0 && mapReady && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-dark-bg gap-2">
            <Map className="h-10 w-10 text-gray-600" />
            <p className="text-sm text-gray-400">Ningún asesor activo ahora</p>
            <p className="text-xs text-gray-600">Las ubicaciones aparecen cuando los asesores abren la app</p>
          </div>
        )}
        <div ref={mapRef} className="h-full w-full" />
      </div>

      {/* Tarjeta asesor seleccionado */}
      {asesorSel && (
        <div className="absolute bottom-0 left-0 right-0 z-[1000] rounded-t-2xl border-t border-white/10 bg-dark-surface p-4 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy-accent/20 text-sm font-bold text-navy-accent">
              {getInitials(asesorSel.nombre)}
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-white">{asesorSel.nombre}</p>
              <p className="text-xs text-gray-400">{asesorSel.zona || 'Sin zona'}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">
                Última ubicación: hace {Math.round(asesorSel.minutos_atras ?? 0)} min
              </p>
            </div>
            <button onClick={() => setAsesorSel(null)} className="text-gray-500 hover:text-white p-1">✕</button>
          </div>
        </div>
      )}
    </div>
  )
}
