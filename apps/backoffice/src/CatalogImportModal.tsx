import { useRef, useState } from 'react';

import { importProductsCsv, type ImportResult } from './lib/products.js';

interface Props {
  onClose: () => void;
  onImported: () => void;
}

export function CatalogImportModal({ onClose, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const csv = await file.text();
      const res = await importProductsCsv(csv);
      setResult(res);
      if (res.inserted > 0) onImported();
    } catch {
      setError('No se pudo importar el archivo. Comprueba el formato e inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: '24rem' }}>
        <h3>Importar catálogo desde CSV</h3>
        <p style={{ marginBottom: '0.75rem', opacity: 0.7, fontSize: '0.88rem' }}>
          El fichero debe tener cabecera con las columnas: <code>name,salePrice,sku,barcode</code>.
          Solo <code>name</code> y <code>salePrice</code> son obligatorios.
        </p>

        <a
          href="data:text/csv;charset=utf-8,name%2CsalePrice%2Csku%2Cbarcode%0AProducto%20ejemplo%2C9.99%2CSKU-001%2C8412345678901"
          download="plantilla_catalogo.csv"
          style={{
            fontSize: '0.82rem',
            color: 'var(--tpv-teal-500, #14b8a6)',
            display: 'inline-block',
            marginBottom: '1rem',
          }}
        >
          ↓ Descargar plantilla CSV
        </a>

        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />

        {!result && (
          <button
            className="btn-primary"
            style={{ width: '100%', marginBottom: '0.5rem' }}
            disabled={loading}
            onClick={() => inputRef.current?.click()}
          >
            {loading ? 'Importando…' : 'Seleccionar fichero CSV'}
          </button>
        )}

        {error && <p className="form-error">{error}</p>}

        {result && (
          <div style={{ marginTop: '0.75rem' }}>
            <p style={{ color: result.inserted > 0 ? 'var(--tpv-teal-500, #14b8a6)' : undefined }}>
              ✓ {result.inserted} producto{result.inserted !== 1 ? 's' : ''} importado
              {result.inserted !== 1 ? 's' : ''} correctamente.
            </p>
            {result.errors.length > 0 && (
              <div style={{ marginTop: '0.5rem' }}>
                <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                  {result.errors.length} fila{result.errors.length !== 1 ? 's' : ''} con error:
                </p>
                <ul style={{ fontSize: '0.85rem', paddingLeft: '1.2rem', opacity: 0.8 }}>
                  {result.errors.map((e) => (
                    <li key={e.row}>
                      Fila {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <button
              className="btn-primary"
              style={{ width: '100%', marginTop: '0.75rem' }}
              onClick={() => {
                setResult(null);
                if (inputRef.current) inputRef.current.value = '';
              }}
            >
              Importar otro fichero
            </button>
          </div>
        )}

        <div className="modal-foot" style={{ marginTop: '1rem' }}>
          <button onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
