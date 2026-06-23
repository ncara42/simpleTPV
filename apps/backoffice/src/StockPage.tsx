import { usePageHeader } from '@simpletpv/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { api } from './lib/auth.js';
import { GlobalStockSection } from './stock/GlobalStockSection.js';

export function StockPage({
  initialStoreId,
  initialSearch,
  search,
  onSearchChange,
  familyId,
  onFamilyChange,
}: {
  initialStoreId?: string | null;
  initialSearch?: string | null;
  // S-02 fase E — filtro compartido del shell de Inventario (controlado).
  search?: string;
  onSearchChange?: (value: string) => void;
  familyId?: string;
  onFamilyChange?: (value: string) => void;
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

  // S-12: 'Inventario' es el término visible del dominio de existencias ('Stock'
  // deja de usarse como nombre de página). El título visible lo pinta el shell
  // desde el label de navigation.ts; esto alimenta el contexto de cabecera.
  usePageHeader('Inventario', 'Existencias por tienda en tiempo real');

  return (
    <section className="catalog" data-testid="stock-page">
      <GlobalStockSection
        initialStoreId={initialStoreId ?? null}
        initialSearch={initialSearch ?? null}
        {...(search !== undefined ? { search } : {})}
        {...(onSearchChange ? { onSearchChange } : {})}
        {...(familyId !== undefined ? { familyId } : {})}
        {...(onFamilyChange ? { onFamilyChange } : {})}
      />
    </section>
  );
}
