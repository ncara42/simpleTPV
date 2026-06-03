import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { api } from './lib/auth.js';
import { listAlerts } from './lib/stock.js';
import { AlertsSection } from './stock/AlertsSection.js';
import { GlobalStockSection } from './stock/GlobalStockSection.js';
import { TransfersSection } from './stock/TransfersSection.js';

type Section = 'global' | 'alerts' | 'transfers';

export function StockPage() {
  const qc = useQueryClient();
  const [section, setSection] = useState<Section>('global');

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

      {section === 'global' && <GlobalStockSection />}
      {section === 'alerts' && <AlertsSection />}
      {section === 'transfers' && <TransfersSection />}
    </section>
  );
}
