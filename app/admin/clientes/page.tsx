'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { Search, Filter, Edit2, UserCheck, UserX, Loader2, MapPin } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface Cliente {
  id: string;
  codigo: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  coordenadas: { lat: number; lng: number } | null;
  activo: boolean;
  asesor: {
    id: string;
    nombre: string;
    email: string;
  } | null;
}

export default function AdminClientes() {
  const [buscar, setBuscar] = useState('');
  const [filtroAsesor, setFiltroAsesor] = useState('');
  const [filtroGPS, setFiltroGPS] = useState('all');
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [showReasignarModal, setShowReasignarModal] = useState(false);

  // Construir URL con filtros
  const buildURL = () => {
    const params = new URLSearchParams();
    if (buscar) params.append('buscar', buscar);
    if (filtroAsesor) params.append('asesor_id', filtroAsesor);
    if (filtroGPS !== 'all') params.append('con_gps', filtroGPS);
    params.append('limit', '50');
    
    return `/api/admin/clientes?${params.toString()}`;
  };

  const { data, error, mutate } = useSWR(buildURL(), fetcher, {
    refreshInterval: 30000
  });

  // Fetch asesores para filtro
  const { data: asesoresData } = useSWR('/api/admin/asesores', fetcher);

  const handleReasignar = async (nuevoAsesorId: string) => {
    if (!selectedCliente) return;

    try {
      const response = await fetch('/api/admin/clientes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_id: selectedCliente.id,
          asesor_id: nuevoAsesorId
        })
      });

      if (!response.ok) throw new Error('Error reasignando');

      mutate();
      setShowReasignarModal(false);
      setSelectedCliente(null);
      
    } catch (error) {
      alert('Error reasignando cliente');
    }
  };

  const handleToggleActivo = async (cliente: Cliente) => {
    try {
      const response = await fetch('/api/admin/clientes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_id: cliente.id,
          activo: !cliente.activo
        })
      });

      if (!response.ok) throw new Error('Error actualizando');

      mutate();
      
    } catch (error) {
      alert('Error actualizando cliente');
    }
  };

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-dark">
        <p className="text-red-500">Error cargando clientes</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-screen items-center justify-center bg-dark">
        <Loader2 className="h-8 w-8 animate-spin text-navy-accent" />
      </div>
    );
  }

  const clientes = data.clientes || [];

  return (
    <div className="min-h-screen bg-dark p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Gestión de Clientes
          </h1>
          <p className="text-gray-400">
            {data.pagination.total} clientes totales
          </p>
        </div>

        {/* Filtros */}
        <div className="bg-dark-surface rounded-xl border border-white/10 p-6 mb-6">
          <div className="grid md:grid-cols-3 gap-4">
            {/* Buscar */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">Buscar</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <input
                  type="text"
                  value={buscar}
                  onChange={(e) => setBuscar(e.target.value)}
                  placeholder="Nombre, código o dirección..."
                  className="w-full bg-dark border border-white/10 rounded-lg pl-10 pr-4 py-2 text-white placeholder:text-gray-500 focus:border-navy-accent focus:outline-none"
                />
              </div>
            </div>

            {/* Filtro Asesor */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">Asesor</label>
              <select
                value={filtroAsesor}
                onChange={(e) => setFiltroAsesor(e.target.value)}
                className="w-full bg-dark border border-white/10 rounded-lg px-4 py-2 text-white focus:border-navy-accent focus:outline-none"
              >
                <option value="">Todos los asesores</option>
                {asesoresData?.asesores?.map((a: any) => (
                  <option key={a.id} value={a.id}>{a.nombre}</option>
                ))}
              </select>
            </div>

            {/* Filtro GPS */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">GPS</label>
              <select
                value={filtroGPS}
                onChange={(e) => setFiltroGPS(e.target.value)}
                className="w-full bg-dark border border-white/10 rounded-lg px-4 py-2 text-white focus:border-navy-accent focus:outline-none"
              >
                <option value="all">Todos</option>
                <option value="true">Con GPS</option>
                <option value="false">Sin GPS</option>
              </select>
            </div>
          </div>
        </div>

        {/* Tabla de clientes */}
        <div className="bg-dark-surface rounded-xl border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-navy/30 border-b border-white/10">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Código</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Nombre</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Asesor</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 uppercase">GPS</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 uppercase">Estado</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {clientes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      No se encontraron clientes
                    </td>
                  </tr>
                ) : (
                  clientes.map((cliente: Cliente) => (
                    <tr key={cliente.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 text-sm text-white font-mono">{cliente.codigo}</td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm text-white font-medium">{cliente.nombre}</p>
                          {cliente.direccion && (
                            <p className="text-xs text-gray-500">{cliente.direccion}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {cliente.asesor ? (
                          <div>
                            <p className="text-sm text-white">{cliente.asesor.nombre}</p>
                            <p className="text-xs text-gray-500">{cliente.asesor.email}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500">Sin asignar</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {cliente.coordenadas ? (
                          <MapPin className="h-4 w-4 text-success inline" />
                        ) : (
                          <MapPin className="h-4 w-4 text-gray-600 inline" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          cliente.activo 
                            ? 'bg-success/20 text-success' 
                            : 'bg-gray-600/20 text-gray-400'
                        }`}>
                          {cliente.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => {
                              setSelectedCliente(cliente);
                              setShowReasignarModal(true);
                            }}
                            className="p-2 hover:bg-navy-accent/20 rounded-lg transition-colors"
                            title="Reasignar asesor"
                          >
                            <UserCheck className="h-4 w-4 text-navy-accent" />
                          </button>
                          <button
                            onClick={() => handleToggleActivo(cliente)}
                            className="p-2 hover:bg-danger/20 rounded-lg transition-colors"
                            title={cliente.activo ? 'Desactivar' : 'Activar'}
                          >
                            {cliente.activo ? (
                              <UserX className="h-4 w-4 text-danger" />
                            ) : (
                              <UserCheck className="h-4 w-4 text-success" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Reasignar */}
        {showReasignarModal && selectedCliente && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-dark-surface rounded-xl border border-white/10 p-6 max-w-md w-full">
              <h3 className="text-xl font-bold text-white mb-4">
                Reasignar Cliente
              </h3>
              <p className="text-gray-400 mb-4">
                Cliente: <span className="text-white font-medium">{selectedCliente.nombre}</span>
              </p>
              <p className="text-gray-400 mb-4">
                Asesor actual: <span className="text-white">{selectedCliente.asesor?.nombre || 'Sin asignar'}</span>
              </p>
              
              <label className="block text-sm text-gray-400 mb-2">Nuevo asesor:</label>
              <select
                onChange={(e) => handleReasignar(e.target.value)}
                className="w-full bg-dark border border-white/10 rounded-lg px-4 py-2 text-white mb-4 focus:border-navy-accent focus:outline-none"
                defaultValue=""
              >
                <option value="" disabled>Seleccionar asesor...</option>
                {asesoresData?.asesores?.map((a: any) => (
                  <option key={a.id} value={a.id}>{a.nombre}</option>
                ))}
              </select>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowReasignarModal(false);
                    setSelectedCliente(null);
                  }}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
