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

type StatusFilter = 'all' | 'activa' | 'dormida';

const PERIODS: { id: StoreSalesPeriod; label: string }[] = [
  { id: 'today', label: 'Hoy' },
  { id: 'week', label: '7 días' },
  { id: 'month', label: 'Mes' },
];

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'activa', label: 'Activas' },
  { id: 'dormida', label: 'Dormidas' },
];

// Etiqueta de la cifra de ventas en lenguaje natural (la card es para no técnicos).
const SALES_LABEL: Record<StoreSalesPeriod, string> = {
  today: 'Ventas de hoy',
  week: 'Ventas · últimos 7 días',
  month: 'Ventas de este mes',
};

function salesOf(storeId: string, period: StoreSalesPeriod): number {
  return DEMO_STORE_SALES[storeId]?.[period] ?? 0;
}

export function StoresPage() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [period, setPeriod] = useState<StoreSalesPeriod>('today');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  // Override local del estado activa/dormida (demo: no hay backend que persista).
  const [activeOverrides, setActiveOverrides] = useState<Record<string, boolean>>({});
  // Estado operativo (fichaje) y dispositivo por tienda; editable en local (demo).
  const [ops, setOps] = useState<Record<string, StoreOps>>(() =>
    Object.fromEntries(Object.entries(DEMO_STORE_OPS).map(([k, v]) => [k, { ...v }])),
  );
  const [detail, setDetail] = useState<Store | null>(null);

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

  const isActive = (s: Store): boolean => activeOverrides[s.id] ?? s.active;
  const toggleActive = (s: Store): void =>
    setActiveOverrides((prev) => ({ ...prev, [s.id]: !(prev[s.id] ?? s.active) }));

  const opsOf = (id: string): StoreOps | undefined => ops[id];
  const patchOps = (id: string, patch: Partial<StoreOps>): void =>
    setOps((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...patch } } : prev));

  // Orden por ventas del periodo (desc) + filtro por estado administrativo (#101, #103).
  const visibleStores = useMemo(() => {
    return [...stores]
      .filter((s) => {
        const active = activeOverrides[s.id] ?? s.active;
        if (statusFilter === 'activa') return active;
        if (statusFilter === 'dormida') return !active;
        return true;
      })
      .sort((a, b) => salesOf(b.id, period) - salesOf(a.id, period));
  }, [stores, statusFilter, period, activeOverrides]);

  usePageHeader('Tiendas', `${stores.length} ubicaciones`);

  return (
    <section className="catalog">
      <div className="stores-toolbar">
        <div className="bo-tabs" role="tablist" aria-label="Filtrar por estado">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`bo-tab ${statusFilter === f.id ? 'active' : ''}`}
              onClick={() => setStatusFilter(f.id)}
              data-testid={`store-filter-${f.id}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="stores-period">
          <div className="bo-tabs" role="tablist" aria-label="Ordenar por ventas del periodo">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`bo-tab ${period === p.id ? 'active' : ''}`}
                onClick={() => setPeriod(p.id)}
                data-testid={`store-period-${p.id}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            className="btn-primary stock-tabs-action"
            onClick={() => setCreating(true)}
            data-testid="new-store"
          >
            Nueva tienda
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="catalog-empty">Cargando…</p>
      ) : stores.length === 0 ? (
        <p className="catalog-empty" data-testid="stores-empty">
          Sin tiendas. Crea la primera.
        </p>
      ) : visibleStores.length === 0 ? (
        <p className="catalog-empty" data-testid="stores-filter-empty">
          Ninguna tienda con ese estado.
        </p>
      ) : (
        <div className="store-grid" data-testid="stores-grid">
          {visibleStores.map((s) => (
            <StoreCard
              key={s.id}
              store={s}
              active={isActive(s)}
              sales={salesOf(s.id, period)}
              periodLabel={SALES_LABEL[period]}
              onSelect={() => setDetail(s)}
              onToggleActive={() => toggleActive(s)}
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
    </section>
  );
}
