import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { api } from './lib/auth.js';
import { usePageHeader } from './lib/pageHeader.js';
import { GlobalStockSection } from './stock/GlobalStockSection.js';

export function StockPage({
  initialStoreId,
  initialSearch,
}: {
  initialStoreId?: string | null;
  initialSearch?: string | null;
}) {
  const qc = useQueryClient();

  // Tiempo real (#33): el SSE invalida las queries de stock al recibir los
  // eventos, así el panel se actualiza sin recargar. Las alertas viven ahora en
  // Notificaciones (su propio SSE), no aquí.
  useEffect(() => {
    const unsubscribe = api.subscribeEvents((event) => {
      if (event.type === 'stock.changed') {
        void qc.invalidateQueries({ queryKey: ['stock-global'] });
        void qc.invalidateQueries({ queryKey: ['stock-movements'] });
      }
    });
    return unsubscribe;
  }, [qc]);

  usePageHeader('Stock', 'Stock por tienda en tiempo real');

  return (
    <section className="catalog" data-testid="stock-page">
      <GlobalStockSection
        initialStoreId={initialStoreId ?? null}
        initialSearch={initialSearch ?? null}
      />
    </section>
  );
}
