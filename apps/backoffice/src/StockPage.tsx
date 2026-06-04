import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { api } from './lib/auth.js';
import { listAlerts } from './lib/stock.js';
import { AlertsSection } from './stock/AlertsSection.js';
import { GlobalStockSection } from './stock/GlobalStockSection.js';
import { TransfersSection } from './stock/TransfersSection.js';

// Iconos de línea para la banda de KPIs de stock (24×24, currentColor).
function StockIcon({ name }: { name: 'units' | 'out' | 'low' | 'transit' }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  if (name === 'units') {
    return (
      <svg {...common}>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <path d="m3.3 7 8.7 5 8.7-5M12 22V12" />
      </svg>
    );
  }
  if (name === 'out') {
    return (
      <svg {...common}>
        <path d="m21.7 18-9-15.6a2 2 0 0 0-3.4 0L0.3 18a2 2 0 0 0 1.7 3h18a2 2 0 0 0 1.7-3z" />
        <path d="M12 9v4M12 17h.01" />
      </svg>
    );
  }
  if (name === 'low') {
    return (
      <svg {...common}>
        <path d="M16 17h6v-6M22 17l-8.5-8.5-5 5L2 7" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M14 18V6a1 1 0 0 0-1-1H2a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h1" />
      <path d="M14 9h4l3 3v5a1 1 0 0 1-1 1h-1M9 18h6" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </svg>
  );
}

type Section = 'global' | 'alerts' | 'transfers';

export function StockPage() {
  const qc = useQueryClient();
  const [section, setSection] = useState<Section>('global');
  const [creatingTransfer, setCreatingTransfer] = useState(false);

  // Contador del subtab "Alertas" (badge). Comparte queryKey con AlertsSection.
  const { data: alertCount = [] } = useQuery({
    queryKey: ['stock-alerts'],
    queryFn: () => listAlerts(),
  });

  // Tiempo real (#33): el SSE invalida las queries de stock/alertas al recibir
  // los eventos, así el panel se actualiza sin recargar.
  useEffect(() => {
    const unsubscribe = api.subscribeEvents((event) => {
      if (event.type === 'stock.changed') {
        void qc.invalidateQueries({ queryKey: ['stock-global'] });
        void qc.invalidateQueries({ queryKey: ['stock-movements'] });
      } else if (event.type === 'alert.created') {
        void qc.invalidateQueries({ queryKey: ['stock-alerts'] });
      }
    });
    return unsubscribe;
  }, [qc]);

  return (
    <section className="catalog" data-testid="stock-page">
      <header className="catalog-head">
        <div>
          <h2>Stock</h2>
          <p className="catalog-sub">Stock por tienda en tiempo real</p>
        </div>
      </header>
      <div className="stock-tabs-row">
        <nav className="bo-tabs" data-testid="stock-subtabs">
          <button
            className={`bo-tab ${section === 'global' ? 'active' : ''}`}
            onClick={() => setSection('global')}
            data-testid="stock-tab-global"
          >
            Stock global
          </button>
          <button
            className={`bo-tab ${section === 'alerts' ? 'active' : ''}`}
            onClick={() => setSection('alerts')}
            data-testid="stock-tab-alerts"
          >
            Alertas
            {alertCount.length > 0 && <span className="subtab-badge">{alertCount.length}</span>}
          </button>
          <button
            className={`bo-tab ${section === 'transfers' ? 'active' : ''}`}
            onClick={() => setSection('transfers')}
            data-testid="stock-tab-transfers"
          >
            Traspasos
          </button>
        </nav>
        {section === 'transfers' && (
          <button
            type="button"
            className="btn-primary stock-tabs-action"
            onClick={() => setCreatingTransfer(true)}
            data-testid="new-transfer"
          >
            Nuevo traspaso
          </button>
        )}
      </div>

      {section === 'global' && <GlobalStockSection />}
      {section === 'alerts' && <AlertsSection />}
      {section === 'transfers' && (
        <TransfersSection creating={creatingTransfer} setCreating={setCreatingTransfer} />
      )}
    </section>
  );
}
