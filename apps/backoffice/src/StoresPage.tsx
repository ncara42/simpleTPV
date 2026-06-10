import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { createStore, deleteStore, listStores, type Store } from './lib/admin.js';
import { getSalesToday } from './lib/dashboard.js';
import { formErrorMessage } from './lib/form-error.js';
import { usePageHeader } from './lib/pageHeader.js';
import { StoreCard } from './stores/StoreCard.js';
import { StoreDetailModal } from './stores/StoreDetailModal.js';
import { type StoreForm, StoreFormModal } from './stores/StoreFormModal.js';
import { StorePricesModal } from './stores/StorePricesModal.js';

export type StoreSalesPeriod = 'today' | 'week' | 'month';

export interface StoreOps {
  open: boolean;
  openedBy: string | null;
  openedSince: string | null;
  deviceType: 'ip' | 'token';
  deviceValue: string;
  deviceVerified: boolean;
}

const SALES_LABEL: Record<StoreSalesPeriod, string> = {
  today: 'Ventas de hoy',
  week: 'Ventas · últimos 7 días',
  month: 'Ventas de este mes',
};

export function StoresPage({
  onOpenStoreView,
}: {
  onOpenStoreView: (view: 'stock' | 'sales', storeId: string) => void;
}) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const period: StoreSalesPeriod = 'today';
  const [ops, setOps] = useState<Record<string, StoreOps>>({});
  const [detail, setDetail] = useState<Store | null>(null);
  const [pricesFor, setPricesFor] = useState<Store | null>(null);

  const { data: stores = [], isLoading } = useQuery({
    queryKey: ['stores'],
    queryFn: listStores,
  });
  // Ventas de hoy por tienda (GET /dashboard/sales-today) → métrica de la card + orden.
  const { data: salesToday } = useQuery({
    queryKey: ['dashboard-sales-today'],
    queryFn: () => getSalesToday(),
  });
  const salesByStore = useMemo(
    () => new Map((salesToday?.byStore ?? []).map((b) => [b.storeId, b.today])),
    [salesToday],
  );
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
  void deleteStore;

  const opsOf = (id: string): StoreOps | undefined => ops[id];
  const patchOps = (id: string, patch: Partial<StoreOps>): void =>
    setOps((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...patch } } : prev));

  // Orden por ventas de hoy (desc); empate o sin ventas → por nombre estable.
  const visibleStores = useMemo(
    () =>
      [...stores].sort(
        (a, b) =>
          (salesByStore.get(b.id) ?? 0) - (salesByStore.get(a.id) ?? 0) ||
          a.name.localeCompare(b.name),
      ),
    [stores, salesByStore],
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
              sales={salesByStore.get(s.id) ?? 0}
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
          error={createMut.isError ? formErrorMessage(createMut.error, 'No se pudo crear.') : null}
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
