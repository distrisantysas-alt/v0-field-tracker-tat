'use client';

import { useState } from 'react';
import { Upload, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

export default function AdminImport() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResult(null);
      setError(null);
    }
  };

  const handleImport = async () => {
    if (!file) {
      setError('Selecciona un archivo primero');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/admin/import-csv', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error en la importación');
      }

      setResult(data);
      setFile(null);
      
      // Limpiar el input
      const fileInput = document.getElementById('file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Panel de Administración
          </h1>
          <p className="text-gray-400">
            Importa clientes masivamente desde CSV
          </p>
        </div>

        {/* Card de importación */}
        <div className="bg-dark-surface rounded-xl border border-white/10 p-8">
          <div className="flex items-center gap-3 mb-6">
            <Upload className="h-6 w-6 text-navy-accent" />
            <h2 className="text-xl font-semibold text-white">
              Importar CSV
            </h2>
          </div>

          {/* Área de drop file */}
          <div className="border-2 border-dashed border-white/20 rounded-lg p-12 text-center mb-6 hover:border-navy-accent transition-colors">
            <input
              id="file-input"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
            />
            
            {!file ? (
              <label htmlFor="file-input" className="cursor-pointer">
                <Upload className="h-12 w-12 text-gray-500 mx-auto mb-4" />
                <p className="text-white mb-2">
                  Click para seleccionar archivo CSV
                </p>
                <p className="text-sm text-gray-500">
                  Formato soportado: .csv
                </p>
              </label>
            ) : (
              <div className="flex items-center justify-center gap-3">
                <CheckCircle className="h-6 w-6 text-success" />
                <div className="text-left">
                  <p className="text-white font-medium">{file.name}</p>
                  <p className="text-sm text-gray-400">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                <button
                  onClick={() => setFile(null)}
                  className="ml-4 text-danger hover:text-danger/80"
                >
                  Eliminar
                </button>
              </div>
            )}
          </div>

          {/* Instrucciones */}
          <div className="bg-navy/20 border border-navy-accent/30 rounded-lg p-4 mb-6">
            <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Importante
            </h3>
            <ul className="text-sm text-gray-300 space-y-1 ml-6 list-disc">
              <li>Solo se importarán clientes <strong>con coordenadas GPS</strong></li>
              <li>Clientes sin GPS serán omitidos</li>
              <li>Los asesores se crearán automáticamente</li>
              <li>Duplicados se actualizarán (no se crean dos veces)</li>
            </ul>
          </div>

          {/* Botón de importar */}
          <button
            onClick={handleImport}
            disabled={!file || loading}
            className="w-full bg-success hover:bg-success/90 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Importando...
              </>
            ) : (
              <>
                <Upload className="h-5 w-5" />
                Importar Clientes
              </>
            )}
          </button>
        </div>

        {/* Resultado de la importación */}
        {result && (
          <div className="mt-6 bg-success/10 border border-success/30 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle className="h-6 w-6 text-success" />
              <h3 className="text-lg font-semibold text-white">
                Importación Exitosa
              </h3>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-dark-surface rounded-lg p-4 border border-white/10">
                <p className="text-sm text-gray-400 mb-1">Asesores</p>
                <p className="text-2xl font-bold text-white">
                  {result.stats.asesores}
                </p>
              </div>
              
              <div className="bg-dark-surface rounded-lg p-4 border border-white/10">
                <p className="text-sm text-gray-400 mb-1">Clientes Importados</p>
                <p className="text-2xl font-bold text-success">
                  {result.stats.clientes_importados}
                </p>
              </div>
              
              <div className="bg-dark-surface rounded-lg p-4 border border-white/10">
                <p className="text-sm text-gray-400 mb-1">Sin GPS (omitidos)</p>
                <p className="text-2xl font-bold text-warning">
                  {result.stats.clientes_omitidos}
                </p>
              </div>
              
              <div className="bg-dark-surface rounded-lg p-4 border border-white/10">
                <p className="text-sm text-gray-400 mb-1">Total Procesado</p>
                <p className="text-2xl font-bold text-white">
                  {result.stats.total_procesado}
                </p>
              </div>
            </div>

            <div className="mt-4 flex gap-3">
              <a
                href="/admin/clientes"
                className="flex-1 bg-navy-accent hover:bg-navy-accent/90 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-center"
              >
                Ver Clientes →
              </a>
              <button
                onClick={() => setResult(null)}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Importar Otro
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-6 bg-danger/10 border border-danger/30 rounded-xl p-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-6 w-6 text-danger" />
              <div>
                <h3 className="text-lg font-semibold text-white mb-1">
                  Error en la Importación
                </h3>
                <p className="text-sm text-gray-300">{error}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
