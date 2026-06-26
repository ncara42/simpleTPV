import { usePageHeader } from '@simpletpv/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { api } from './lib/auth.js';
import { ExistencesView } from './stock/ExistencesView.js';

export function StockPage({
  initialStoreId,
  search,
  onSearchChange,
}: {
  initialStoreId?: string | null;
  // S-02 fase E — filtro compartido del shell de Inventario (controlado).
  search?: string;
  onSearchChange?: (value: string) => void;
}) {
  const qc = useQueryClient();

  // Tiempo real (#33): el SSE invalida las queries de stock al recibir los eventos,
  // así la vista se actualiza sin recargar. Las alertas viven en Notificaciones.
  useEffect(() => {
    const unsubscribe = api.subscribeEvents((event) => {
      if (event.type === 'stock.changed') {
        void qc.invalidateQueries({ queryKey: ['stock-global'] });
        void qc.invalidateQueries({ queryKey: ['stock-movements'] });
      }
    });
    return unsubscribe;
  }, [qc]);

  // S-12: 'Inventario' es el término visible del dominio de existencias. El título lo
  // pinta el shell desde navigation.ts; esto alimenta el contexto de cabecera.
  usePageHeader('Inventario', 'Existencias por tienda en tiempo real');

  return (
    <ExistencesView
      initialStoreId={initialStoreId ?? null}
      {...(search !== undefined ? { search } : {})}
      {...(onSearchChange ? { onSearchChange } : {})}
    />
  );
}
