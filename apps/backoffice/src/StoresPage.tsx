import { Button } from '@simpletpv/ui';
import { usePageHeader } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useConfirm } from './components/ConfirmProvider.js';
import { createStore, deleteStore, listStores, type Store, updateStore } from './lib/admin.js';
import { getSalesToday } from './lib/dashboard.js';
import { formErrorMessage } from './lib/form-error.js';
import { StoreCard } from './stores/StoreCard.js';
import { StoreDetailModal } from './stores/StoreDetailModal.js';
import { type StoreForm, StoreFormModal } from './stores/StoreFormModal.js';
import { StorePricesModal } from './stores/StorePricesModal.js';

export type StoreSalesPeriod = 'today' | 'week' | 'month';

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
  const confirm = useConfirm();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Store | null>(null);
  const period: StoreSalesPeriod = 'today';
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
  // Edición y borrado REALES (I-10): el backend ya tenía PATCH/DELETE.
  const updateMut = useMutation({
    mutationFn: ({ id, form }: { id: string; form: StoreForm }) =>
      updateStore(id, {
        name: form.name,
        code: form.code,
        ...(form.address ? { address: form.address } : { address: null }),
      }),
    onSuccess: () => {
      setEditing(null);
      setDetail(null);
      invalidate();
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteStore(id),
    onSuccess: () => {
      setDetail(null);
      invalidate();
    },
  });
  const askDelete = async (s: Store): Promise<void> => {
    const ok = await confirm({
      title: 'Borrar tienda',
      message: `¿Borrar la tienda "${s.name}"? Si tiene ventas o stock asociados no se podrá.`,
      confirmLabel: 'Borrar',
      danger: true,
    });
    if (ok) deleteMut.mutate(s.id);
  };

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
        <Button
          className="stock-tabs-action"
          onClick={() => setCreating(true)}
          data-testid="new-store"
          icon={<Plus size={16} aria-hidden="true" />}
        >
          Nueva tienda
        </Button>
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
          onEdit={() => setEditing(detail)}
          onDelete={() => void askDelete(detail)}
          deleteError={
            deleteMut.isError ? formErrorMessage(deleteMut.error, 'No se pudo borrar.') : null
          }
          onClose={() => setDetail(null)}
        />
      )}

      {editing && (
        <StoreFormModal
          initial={{ name: editing.name, code: editing.code, address: editing.address ?? '' }}
          onClose={() => setEditing(null)}
          onSubmit={(f) => updateMut.mutate({ id: editing.id, form: f })}
          pending={updateMut.isPending}
          error={
            updateMut.isError ? formErrorMessage(updateMut.error, 'No se pudo guardar.') : null
          }
        />
      )}

      {pricesFor && <StorePricesModal store={pricesFor} onClose={() => setPricesFor(null)} />}
    </section>
  );
}
