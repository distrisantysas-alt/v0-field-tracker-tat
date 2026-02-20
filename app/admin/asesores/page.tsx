'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Search, MapPin, Users, ChevronLeft, Loader2 } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface Asesor {
  id: string;
  nombre: string;
  email: string;
  activo: boolean;
  total_clientes: number;
}

interface Cliente {
  id: string;
  codigo: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  coordenadas: { lat: number; lng: number } | null;
  activo: boolean;
}

function getRuta(nombre: string): string {
  if (!nombre) return '—';
  return nombre.split(' ')[0] || '—';
}

function getNombreSinRuta(nombre: string): string {
  if (!nombre) return '';
  const partes = nombre.split(' ');
  return partes.slice(1).join(' ') || nombre;
}

export default function AdminAsesores() {
  const [asesorSeleccionado, setAsesorSeleccionado] = useState<Asesor | null>(null);
  const [buscar, setBuscar] = useState('');
  const [filtroRuta, setFiltroRuta] = useState('');

  const { data: asesoresData, isLoading: loadingAsesores } = useSWR('/api/admin/asesores', fetcher);

  const clientesURL = asesorSeleccionado
    ? `/api/admin/clientes?asesor_id=${asesorSeleccionado.id}&limit=500`
    : null;
  const { data: clientesData, isLoading: loadingClientes } = useSWR(clientesURL, fetcher);

  const todosClientes: Cliente[] = clientesData?.clientes || [];

  const rutasUnicas = Array.from(
    new Set(todosClientes.map(c => getRuta(c.nombre)))
  ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const clientesFiltrados = todosClientes.filter(c => {
    const ruta = getRuta(c.nombre);
    const matchRuta = filtroRuta ? ruta === filtroRuta : true;
    const matchBuscar = buscar
      ? c.nombre.toLowerCase().includes(buscar.toLowerCase()) || (c.codigo || '').includes(buscar)
      : true;
    return matchRuta && matchBuscar;
  });

  // ── VISTA DETALLE ASESOR ──────────────────────────────────────────
  if (asesorSeleccionado) {
    return (
      <div className="min-h-screen bg-gray-900 p-6">
        <div className="max-w-6xl mx-auto">

          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => { setAsesorSeleccionado(null); setBuscar(''); setFiltroRuta(''); }}
              className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              <ChevronLeft className="h-5 w-5 text-white" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white">{asesorSeleccionado.nombre}</h1>
              <p className="text-gray-400 text-sm">{asesorSeleccionado.email}</p>
            </div>
            <div className="ml-auto bg-blue-500/20 text-blue-400 px-3 py-1 rounded-full text-sm font-medium">
              {clientesFiltrados.length} de {todosClientes.length} clientes
            </div>
          </div>

          {/* Filtros */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 mb-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={buscar}
                  onChange={(e) => setBuscar(e.target.value)}
                  placeholder="Buscar por nombre o código..."
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-10 pr-4 py-2 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <select
                value={filtroRuta}
                onChange={(e) => setFiltroRuta(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="">Todas las rutas</option>
                {rutasUnicas.map(r => (
                  <option key={r} value={r}>Ruta {r}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Tabla */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            {loadingClientes ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-700 border-b border-gray-600">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase">Ruta</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase">Código</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase">Nombre</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase">Dirección</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase">Teléfono</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-300 uppercase">GPS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {clientesFiltrados.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                          No se encontraron clientes
                        </td>
                      </tr>
                    ) : (
                      clientesFiltrados.map((cliente) => (
                        <tr key={cliente.id} className="hover:bg-gray-700/50 transition-colors">
                          <td className="px-4 py-3">
                            <span className="bg-blue-500/20 text-blue-300 px-2 py-1 rounded text-xs font-bold font-mono">
                              {getRuta(cliente.nombre)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-300 font-mono">{cliente.codigo}</td>
                          <td className="px-4 py-3 text-sm text-white font-medium">
                            {getNombreSinRuta(cliente.nombre)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-400">{cliente.direccion || '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-400">{cliente.telefono || '—'}</td>
                          <td className="px-4 py-3 text-center">
                            <MapPin className={`h-4 w-4 inline ${cliente.coordenadas ? 'text-green-400' : 'text-gray-600'}`} />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      </div>
    );
  }

  // ── VISTA LISTA ASESORES ──────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto">

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Asesores</h1>
          <p className="text-gray-400">Selecciona un asesor para ver sus clientes</p>
        </div>

        {loadingAsesores ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {asesoresData?.asesores
              ?.filter((a: Asesor) => a.nombre && !a.nombre.match(/^(lunes|martes|mi|s[aá]bado|jueves|viernes|domingo)/i))
              .map((asesor: Asesor) => (
                <button
                  key={asesor.id}
                  onClick={() => setAsesorSeleccionado(asesor)}
                  className="bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-blue-500 rounded-xl p-5 text-left transition-all group"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-white font-semibold text-lg group-hover:text-blue-400 transition-colors">
                        {asesor.nombre}
                      </h3>
                      <p className="text-gray-400 text-sm mt-1">{asesor.email}</p>
                    </div>
                    <div className="flex items-center gap-1 bg-gray-700 rounded-lg px-3 py-1">
                      <Users className="h-4 w-4 text-gray-400" />
                      <span className="text-white font-bold text-sm">{asesor.total_clientes}</span>
                    </div>
                  </div>
                  <div className="mt-3">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      asesor.activo ? 'bg-green-500/20 text-green-400' : 'bg-gray-600/20 text-gray-400'
                    }`}>
                      {asesor.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                </button>
              ))}
          </div>
        )}

      </div>
    </div>
  );
}
