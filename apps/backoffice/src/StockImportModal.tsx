import { useRef, useState } from 'react';

import { listStores, type Store } from './lib/admin.js';
import { adjustStock, getGlobalStock, type StockGlobalRow } from './lib/stock.js';

interface Props {
  onClose: () => void;
  onImported: () => void;
}

interface RowError {
  row: number;
  message: string;
}

interface ImportSummary {
  ok: number;
  errors: RowError[];
}

function parseCsvRows(csv: string): Array<Record<string, string>> {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  const header = lines[0]!.split(',').map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const obj: Record<string, string> = {};
    header.forEach((h, i) => {
      obj[h] = (cells[i] ?? '').trim();
    });
    return obj;
  });
}

export function StockImportModal({ onClose, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setSummary(null);
    setLoading(true);
    try {
      const csv = await file.text();
      const rows = parseCsvRows(csv);
      if (rows.length === 0) {
        setError('El fichero está vacío o no tiene el formato correcto.');
        setLoading(false);
        return;
      }

      // Cargamos productos y tiendas para resolver nombres → IDs
      const [stockRows, stores]: [StockGlobalRow[], Store[]] = await Promise.all([
        getGlobalStock(),
        listStores(),
      ]);

      const storeByName = new Map(stores.map((s) => [s.name.toLowerCase(), s]));
      const productByName = new Map(stockRows.map((r) => [r.productName.toLowerCase(), r]));

      const errors: RowError[] = [];
      let ok = 0;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        const rowNum = i + 2;
        const productRaw = (row.producto ?? row.product ?? row.name ?? '').toLowerCase();
        const storeRaw = (row.tienda ?? row.store ?? '').toLowerCase();
        const qtyRaw = row.cantidad ?? row.quantity ?? row.qty ?? '';
        const qty = Number(qtyRaw);

        if (!productRaw) {
          errors.push({ row: rowNum, message: 'Falta el producto' });
          continue;
        }
        if (!storeRaw) {
          errors.push({ row: rowNum, message: 'Falta la tienda' });
          continue;
        }
        if (!qtyRaw || Number.isNaN(qty) || qty < 0) {
          errors.push({ row: rowNum, message: 'Cantidad inválida' });
          continue;
        }

        const product = productByName.get(productRaw);
        if (!product) {
          errors.push({ row: rowNum, message: `Producto no encontrado: "${productRaw}"` });
          continue;
        }

        const store = storeByName.get(storeRaw);
        if (!store) {
          errors.push({ row: rowNum, message: `Tienda no encontrada: "${storeRaw}"` });
          continue;
        }

        try {
          await adjustStock({
            productId: product.productId,
            storeId: store.id,
            newQuantity: qty,
            reason: 'Carga de stock inicial (importación CSV)',
          });
          ok++;
        } catch {
          errors.push({
            row: rowNum,
            message: `Error al ajustar "${productRaw}" en "${storeRaw}"`,
          });
        }
      }

      setSummary({ ok, errors });
      if (ok > 0) onImported();
    } catch {
      setError('No se pudo procesar el fichero. Comprueba el formato e inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: '26rem' }}>
        <h3>Cargar stock inicial desde CSV</h3>
        <p style={{ marginBottom: '0.75rem', opacity: 0.7, fontSize: '0.88rem' }}>
          El fichero debe tener cabecera con las columnas: <code>producto,tienda,cantidad</code>. El
          nombre del producto y la tienda deben coincidir exactamente con los del sistema (o usar el
          SKU como producto).
        </p>

        <a
          href="data:text/csv;charset=utf-8,producto%2Ctienda%2Ccantidad%0AProducto%20ejemplo%2CTienda%20Centro%2C50"
          download="plantilla_stock.csv"
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

        {!summary && (
          <button
            className="btn-primary"
            style={{ width: '100%', marginBottom: '0.5rem' }}
            disabled={loading}
            onClick={() => inputRef.current?.click()}
          >
            {loading ? 'Cargando…' : 'Seleccionar fichero CSV'}
          </button>
        )}

        {loading && (
          <p style={{ textAlign: 'center', opacity: 0.6, fontSize: '0.85rem' }}>
            Procesando filas, por favor espera…
          </p>
        )}

        {error && <p className="form-error">{error}</p>}

        {summary && (
          <div style={{ marginTop: '0.75rem' }}>
            <p style={{ color: summary.ok > 0 ? 'var(--tpv-teal-500, #14b8a6)' : undefined }}>
              ✓ {summary.ok} ajuste{summary.ok !== 1 ? 's' : ''} de stock realizados correctamente.
            </p>
            {summary.errors.length > 0 && (
              <div style={{ marginTop: '0.5rem' }}>
                <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                  {summary.errors.length} fila{summary.errors.length !== 1 ? 's' : ''} con error:
                </p>
                <ul style={{ fontSize: '0.85rem', paddingLeft: '1.2rem', opacity: 0.8 }}>
                  {summary.errors.map((e) => (
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
                setSummary(null);
                if (inputRef.current) inputRef.current.value = '';
              }}
            >
              Cargar otro fichero
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
