import { useState } from 'react';

import { listStores } from './lib/admin.js';
import { listProducts } from './lib/products.js';
import { getGlobalStock } from './lib/stock.js';

interface CheckResult {
  label: string;
  status: 'ok' | 'error' | 'pending';
  detail?: string;
}

async function runChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // 1. API responde
  try {
    const res = await fetch('/health');
    if (res.ok) {
      results.push({ label: 'API responde (/health)', status: 'ok' });
    } else {
      results.push({
        label: 'API responde (/health)',
        status: 'error',
        detail: `HTTP ${res.status}`,
      });
    }
  } catch (e) {
    results.push({ label: 'API responde (/health)', status: 'error', detail: String(e) });
  }

  // 2. Hay tiendas configuradas
  try {
    const stores = await listStores();
    if (stores.length > 0) {
      results.push({
        label: 'Tiendas configuradas',
        status: 'ok',
        detail: `${stores.length} tienda${stores.length !== 1 ? 's' : ''}`,
      });
    } else {
      results.push({
        label: 'Tiendas configuradas',
        status: 'error',
        detail: 'No hay tiendas. Crea al menos una.',
      });
    }
  } catch {
    results.push({
      label: 'Tiendas configuradas',
      status: 'error',
      detail: 'No se pudo consultar.',
    });
  }

  // 3. Hay productos en el catálogo
  try {
    const products = await listProducts();
    if (products.length > 0) {
      results.push({
        label: 'Catálogo con productos',
        status: 'ok',
        detail: `${products.length} producto${products.length !== 1 ? 's' : ''}`,
      });
    } else {
      results.push({
        label: 'Catálogo con productos',
        status: 'error',
        detail: 'No hay productos. Importa el catálogo.',
      });
    }
  } catch {
    results.push({
      label: 'Catálogo con productos',
      status: 'error',
      detail: 'No se pudo consultar.',
    });
  }

  // 4. Hay stock cargado
  try {
    const stock = await getGlobalStock();
    const withStock = stock.filter((r) => r.total > 0);
    if (withStock.length > 0) {
      results.push({
        label: 'Stock inicial cargado',
        status: 'ok',
        detail: `${withStock.length} producto${withStock.length !== 1 ? 's' : ''} con stock > 0`,
      });
    } else {
      results.push({
        label: 'Stock inicial cargado',
        status: 'error',
        detail: 'Todo el stock está a 0. Carga el stock inicial.',
      });
    }
  } catch {
    results.push({
      label: 'Stock inicial cargado',
      status: 'error',
      detail: 'No se pudo consultar.',
    });
  }

  return results;
}

const STATUS_ICON: Record<CheckResult['status'], string> = {
  ok: '✓',
  error: '✗',
  pending: '…',
};

const STATUS_COLOR: Record<CheckResult['status'], string> = {
  ok: 'var(--tpv-teal-500, #14b8a6)',
  error: '#ef4444',
  pending: '#888',
};

export function SystemPage() {
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  async function handleRun() {
    setRunning(true);
    setDone(false);
    setChecks([]);
    const results = await runChecks();
    setChecks(results);
    setRunning(false);
    setDone(true);
  }

  const allOk = done && checks.every((c) => c.status === 'ok');
  const hasErrors = done && checks.some((c) => c.status === 'error');

  return (
    <section className="catalog">
      <header className="catalog-head">
        <h2>Verificación del sistema</h2>
        <button
          className="btn-primary"
          onClick={() => void handleRun()}
          disabled={running}
          data-testid="run-smoke-tests"
        >
          {running ? 'Comprobando…' : 'Ejecutar comprobaciones'}
        </button>
      </header>

      <p style={{ opacity: 0.65, marginBottom: '1.5rem', fontSize: '0.9rem' }}>
        Verifica que el sistema está listo para operar: API activa, tiendas, catálogo y stock
        cargados.
      </p>

      {checks.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.5rem' }}>
          {checks.map((c) => (
            <li
              key={c.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.65rem 0',
                borderBottom: '1px solid var(--tpv-line, #e4e2db)',
              }}
              data-testid={`check-${c.status}`}
            >
              <span
                style={{
                  fontWeight: 700,
                  fontSize: '1.1rem',
                  color: STATUS_COLOR[c.status],
                  minWidth: '1.25rem',
                  textAlign: 'center',
                }}
              >
                {STATUS_ICON[c.status]}
              </span>
              <span style={{ flex: 1 }}>{c.label}</span>
              {c.detail && <span style={{ opacity: 0.6, fontSize: '0.85rem' }}>{c.detail}</span>}
            </li>
          ))}
        </ul>
      )}

      {allOk && (
        <div
          style={{
            padding: '1rem',
            borderRadius: '0.6rem',
            background: 'rgba(20,184,166,0.08)',
            color: 'var(--tpv-teal-500, #14b8a6)',
            fontWeight: 600,
          }}
          data-testid="smoke-ok"
        >
          ✓ Sistema listo para operar.
        </div>
      )}

      {hasErrors && (
        <div
          style={{
            padding: '1rem',
            borderRadius: '0.6rem',
            background: 'rgba(239,68,68,0.08)',
            color: '#ef4444',
            fontWeight: 600,
          }}
          data-testid="smoke-errors"
        >
          Hay comprobaciones fallidas. Resuelve los errores antes de operar en producción.
        </div>
      )}
    </section>
  );
}
