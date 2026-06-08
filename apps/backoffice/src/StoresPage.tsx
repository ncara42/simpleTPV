import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import {
  DEMO_STORE_OPS,
  DEMO_STORE_SALES,
  type StoreOps,
  type StoreSalesPeriod,
} from './demo/demoData.js';
import { createStore, deleteStore, listStores, type Store } from './lib/admin.js';
import { usePageHeader } from './lib/pageHeader.js';
import { StoreCard } from './stores/StoreCard.js';
import { StoreDetailModal } from './stores/StoreDetailModal.js';
import { type StoreForm, StoreFormModal } from './stores/StoreFormModal.js';
import { StorePricesModal } from './stores/StorePricesModal.js';

// Etiqueta de la cifra de ventas en lenguaje natural (la card es para no técnicos).
const SALES_LABEL: Record<StoreSalesPeriod, string> = {
  today: 'Ventas de hoy',
  week: 'Ventas · últimos 7 días',
  month: 'Ventas de este mes',
};

function salesOf(storeId: string, period: StoreSalesPeriod): number {
  return DEMO_STORE_SALES[storeId]?.[period] ?? 0;
}

export function StoresPage({
  onOpenStoreView,
}: {
  onOpenStoreView: (view: 'stock' | 'sales', storeId: string) => void;
}) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  // El panel solo observa el estado (no lo modifica) y ordena por ventas de hoy.
  const period: StoreSalesPeriod = 'today';
  // Estado operativo (fichaje) y dispositivo por tienda; editable en local (demo).
  const [ops, setOps] = useState<Record<string, StoreOps>>(() =>
    Object.fromEntries(Object.entries(DEMO_STORE_OPS).map(([k, v]) => [k, { ...v }])),
  );
  const [detail, setDetail] = useState<Store | null>(null);
  // Precios retail por tienda (#127 A): la tienda cuyos overrides se están editando.
  const [pricesFor, setPricesFor] = useState<Store | null>(null);

  const { data: stores = [], isLoading } = useQuery({
    queryKey: ['stores'],
    queryFn: listStores,
  });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['stores'] });

  const createMut = useMutation({
    mutationFn: (s: StoreForm) =>
      createStore(
        s.address
          ? { name: s.name, code: s.code, address: s.address }
          : { name: s.name, code: s.code },
      ),
    onSuccess: () => {
      setCreating(false);
      invalidate();
    },
  });
  // La eliminación se conserva en lib (deleteStore) para el futuro; el mockup de
  // Tiendas no muestra el botón Borrar en las cards.
  void deleteStore;

  const opsOf = (id: string): StoreOps | undefined => ops[id];
  const patchOps = (id: string, patch: Partial<StoreOps>): void =>
    setOps((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...patch } } : prev));

  // Orden por ventas de hoy (desc). Sin filtros: el panel solo crea y observa.
  const visibleStores = useMemo(
    () => [...stores].sort((a, b) => salesOf(b.id, period) - salesOf(a.id, period)),
    [stores, period],
  );

  usePageHeader('Tiendas', `${stores.length} ubicaciones`);

  return (
    <section className="catalog">
      <div className="stores-toolbar">
        <button
          className="btn-primary stock-tabs-action"
          onClick={() => setCreating(true)}
          data-testid="new-store"
        >
          Nueva tienda
        </button>
      </div>

      {isLoading ? (
        <p className="catalog-empty">Cargando…</p>
      ) : stores.length === 0 ? (
        <p className="catalog-empty" data-testid="stores-empty">
          Sin tiendas. Crea la primera.
        </p>
      ) : (
        <div className="store-grid" data-testid="stores-grid">
          {visibleStores.map((s) => (
            <StoreCard
              key={s.id}
              store={s}
              active={s.active}
              sales={salesOf(s.id, period)}
              periodLabel={SALES_LABEL[period]}
              onSelect={() => setDetail(s)}
              onOpenStock={() => onOpenStoreView('stock', s.id)}
              onOpenSales={() => onOpenStoreView('sales', s.id)}
              onOpenPrices={() => setPricesFor(s)}
            />
          ))}
        </div>
      )}

      {creating && (
        <StoreFormModal
          onClose={() => setCreating(false)}
          onSubmit={(f) => createMut.mutate(f)}
          pending={createMut.isPending}
          error={createMut.isError}
        />
      )}

      {detail && (
        <StoreDetailModal
          store={detail}
          ops={opsOf(detail.id)}
          onPatchOps={(patch) => patchOps(detail.id, patch)}
          onClose={() => setDetail(null)}
        />
      )}

      {pricesFor && <StorePricesModal store={pricesFor} onClose={() => setPricesFor(null)} />}
    </section>
  );
}
