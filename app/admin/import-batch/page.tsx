'use client';

import { useState } from 'react';
import { Upload, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

export default function AdminImportBatch() {
  const [file, setFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>('');
  const [stats, setStats] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
      setStats(null);
      
      // Leer como texto
      const text = await selectedFile.text();
      setCsvText(text);
    }
  };

  const handleImport = async () => {
    if (!csvText) {
      setError('Selecciona un archivo primero');
      return;
    }

    setLoading(true);
    setError(null);
    setProgress(0);
    setStatus('Iniciando importación...');

    try {
      // PASO 1: Parsear CSV
      setStatus('Parseando CSV...');
      const parseResponse = await fetch('/api/admin/import-csv-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'parse', csvText }),
      });

      const parseData = await parseResponse.json();
      
      if (!parseResponse.ok) {
        throw new Error(parseData.error || 'Error parseando CSV');
      }

      const total = parseData.total;
      setStatus(`Encontradas ${total} filas. Importando...`);

      // PASO 2: Importar por lotes
      let offset = 0;
      let totalImportados = 0;
      let totalOmitidos = 0;
      
      while (true) {
        const batchResponse = await fetch('/api/admin/import-csv-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            action: 'import-batch', 
            csvText, 
            offset 
          }),
        });

        const batchData = await batchResponse.json();
        
        if (!batchResponse.ok) {
          throw new Error(batchData.error || 'Error en lote');
        }

        totalImportados += batchData.imported;
        totalOmitidos += batchData.omitted;
        
        setProgress(batchData.progress);
        setStatus(`Progreso: ${batchData.progress}% - Importados: ${totalImportados} | Omitidos: ${totalOmitidos}`);

        if (!batchData.hasMore) {
          // Terminado
          setStats({
            clientes_importados: totalImportados,
            clientes_omitidos: totalOmitidos,
            total_procesado: total
          });
          setStatus('✅ Importación completada');
          break;
        }

        offset = batchData.offset;
      }

      setFile(null);
      setCsvText('');
      
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
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Importación por Lotes
          </h1>
          <p className="text-gray-400">
            Importa archivos grandes sin problemas de timeout
          </p>
        </div>

        <div className="bg-dark-surface rounded-xl border border-white/10 p-8">
          <div className="flex items-center gap-3 mb-6">
            <Upload className="h-6 w-6 text-navy-accent" />
            <h2 className="text-xl font-semibold text-white">
              Importar CSV Grande
            </h2>
          </div>

          <div className="border-2 border-dashed border-white/20 rounded-lg p-12 text-center mb-6 hover:border-navy-accent transition-colors">
            <input
              id="file-input"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
              disabled={loading}
            />
            
            {!file ? (
              <label htmlFor="file-input" className="cursor-pointer">
                <Upload className="h-12 w-12 text-gray-500 mx-auto mb-4" />
                <p className="text-white mb-2">
                  Click para seleccionar archivo CSV
                </p>
                <p className="text-sm text-gray-500">
                  Formato soportado: .csv (cualquier tamaño)
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
              </div>
            )}
          </div>

          {loading && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-400">{status}</span>
                <span className="text-sm font-mono text-white">{progress}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
                <div 
                  className="bg-success h-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                >
                  <div className="h-full w-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                </div>
              </div>
            </div>
          )}

          <button
            onClick={handleImport}
            disabled={!file || loading}
            className="w-full bg-success hover:bg-success/90 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Importando por lotes...
              </>
            ) : (
              <>
                <Upload className="h-5 w-5" />
                Iniciar Importación
              </>
            )}
          </button>
        </div>

        {stats && (
          <div className="mt-6 bg-success/10 border border-success/30 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle className="h-6 w-6 text-success" />
              <h3 className="text-lg font-semibold text-white">
                Importación Completada
              </h3>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-dark-surface rounded-lg p-4 border border-white/10">
                <p className="text-sm text-gray-400 mb-1">Importados</p>
                <p className="text-2xl font-bold text-success">
                  {stats.clientes_importados}
                </p>
              </div>
              
              <div className="bg-dark-surface rounded-lg p-4 border border-white/10">
                <p className="text-sm text-gray-400 mb-1">Sin GPS (omitidos)</p>
                <p className="text-2xl font-bold text-warning">
                  {stats.clientes_omitidos}
                </p>
              </div>
              
              <div className="bg-dark-surface rounded-lg p-4 border border-white/10">
                <p className="text-sm text-gray-400 mb-1">Total</p>
                <p className="text-2xl font-bold text-white">
                  {stats.total_procesado}
                </p>
              </div>
            </div>

            <div className="mt-4">
              <a
                href="/admin/clientes"
                className="block w-full bg-navy-accent hover:bg-navy-accent/90 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-center"
              >
                Ver Clientes →
              </a>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-6 bg-danger/10 border border-danger/30 rounded-xl p-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-6 w-6 text-danger" />
              <div>
                <h3 className="text-lg font-semibold text-white mb-1">
                  Error
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
