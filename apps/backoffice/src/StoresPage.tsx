import './stores/stores.css';

import { Button, usePageHeader } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useConfirm } from './components/ConfirmProvider.js';
import { PeriodSegmented } from './components/PeriodSegmented.js';
import { createStore, deleteStore, listStores, type Store, updateStore } from './lib/admin.js';
import { exportRowsToCsv } from './lib/csv.js';
import type { DashboardPeriod } from './lib/dashboard.js';
import { getSalesByStore } from './lib/dashboard.js';
import { listDevices } from './lib/devices.js';
import { formErrorMessage } from './lib/form-error.js';
import { fmtEur } from './lib/format.js';
import { usePageActions } from './lib/pageActions.js';
import { usePageNav } from './lib/pageNav.js';
import { parsePeriod, PERIOD_OPTIONS } from './lib/period.js';
import { listStoreLog } from './lib/time-clock.js';
import { useTableShellHeight } from './lib/useTableShellHeight.js';
import { StoreDetailPanel } from './stores/StoreDetailPanel.js';
import { type StoreForm, StoreFormModal } from './stores/StoreFormModal.js';
import { StoreList } from './stores/StoreList.js';
import { StoreOpsPanel } from './stores/StoreOpsPanel.js';
import { StorePricesModal } from './stores/StorePricesModal.js';

// Etiqueta del periodo para el hero de ventas de la ficha («Ventas · Hoy»).
const PERIOD_LABEL: Record<DashboardPeriod, string> = {
  today: 'Hoy',
  yesterday: 'Ayer',
  week: 'Semana',
  month: 'Mes',
  year: 'Año',
};
// El diseño pide Hoy/7 días/Mes; el sistema real solo entiende Hoy/Semana(ISO)/Mes/Año
// (lib/period.ts), así que se usa el subconjunto y la semántica REALES (sin inventar
// una "semana de 7 días" que no existe en ningún otro sitio de la app).
const STORE_PERIOD_OPTIONS = PERIOD_OPTIONS.filter((o) =>
  (['today', 'week', 'month'] as DashboardPeriod[]).includes(o.value),
);

export function StoresPage({
  onOpenStoreView,
}: {
  onOpenStoreView: (view: 'stock' | 'sales', storeId: string) => void;
}) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();

  const period = parsePeriod(searchParams.get('period'), 'today');
  const setPeriod = (next: DashboardPeriod): void => {
    setSearchParams(
      (prev) => {
        const updated = new URLSearchParams(prev);
        updated.set('period', next);
        return updated;
      },
      { replace: true },
    );
  };

  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Store | null>(null);
  const [pricesFor, setPricesFor] = useState<Store | null>(null);

  const { data: stores = [], isLoading } = useQuery({
    queryKey: ['stores'],
    queryFn: listStores,
  });
  // Ventas del periodo activo por tienda (#224): desglose real, no solo "hoy".
  const { data: salesRows } = useQuery({
    queryKey: ['sales-by-store', period],
    queryFn: () => getSalesByStore(period),
  });
  const salesByStore = useMemo(
    () => new Map((salesRows ?? []).map((r) => [r.storeId, r.revenue])),
    [salesRows],
  );

  // Búsqueda cliente (nombre/dirección/código) + orden por ventas del periodo (desc).
  const visibleStores = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? stores.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            (s.address ?? '').toLowerCase().includes(q) ||
            s.code.toLowerCase().includes(q),
        )
      : stores;
    return [...filtered].sort(
      (a, b) =>
        (salesByStore.get(b.id) ?? 0) - (salesByStore.get(a.id) ?? 0) ||
        a.name.localeCompare(b.name),
    );
  }, [stores, query, salesByStore]);

  // Tienda seleccionada vía URL (?store=); por defecto la de mayor ventas. La ficha
  // mantiene la selección aunque la búsqueda la saque de la lista visible (busca sobre
  // `stores`, no sobre `visibleStores`).
  const selectedId = searchParams.get('store') ?? visibleStores[0]?.id ?? null;
  const selected = stores.find((s) => s.id === selectedId) ?? visibleStores[0] ?? stores[0] ?? null;
  const selectStore = (id: string): void => {
    setSearchParams(
      (prev) => {
        const updated = new URLSearchParams(prev);
        updated.set('store', id);
        return updated;
      },
      { replace: true },
    );
  };

  // Dispositivos y registro de fichajes de la tienda seleccionada: elevados aquí (antes
  // vivían dentro de la modal) para pasarlos a AMBOS paneles (ficha + operativa) sin
  // duplicar peticiones.
  const { data: devices = [] } = useQuery({
    queryKey: ['devices', selected?.id],
    queryFn: () => listDevices(selected?.id),
    enabled: selected != null,
  });
  const { data: log = [] } = useQuery({
    queryKey: ['store-log', selected?.id],
    queryFn: () => listStoreLog(selected!.id),
    enabled: selected != null,
  });

  const invalidate = (): void => void qc.invalidateQueries({ queryKey: ['stores'] });

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
  const updateMut = useMutation({
    mutationFn: ({ id, form }: { id: string; form: StoreForm }) =>
      updateStore(id, {
        name: form.name,
        code: form.code,
        ...(form.address ? { address: form.address } : { address: null }),
      }),
    onSuccess: () => {
      setEditing(null);
      invalidate();
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteStore(id),
    onSuccess: () => {
      // Al borrar la seleccionada, se libera el `?store=` para que caiga a la
      // siguiente por defecto (mayor ventas) en vez de apuntar a un id borrado.
      setSearchParams(
        (prev) => {
          const updated = new URLSearchParams(prev);
          updated.delete('store');
          return updated;
        },
        { replace: true },
      );
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

  const handleExport = (): void => {
    const rows = visibleStores.map((s) => [
      s.name,
      s.address ?? '',
      s.active ? 'Activa' : 'Dormida',
      fmtEur(salesByStore.get(s.id) ?? 0),
    ]);
    exportRowsToCsv(
      'tiendas.csv',
      ['Nombre', 'Dirección', 'Estado', `Ventas ${PERIOD_LABEL[period]}`],
      rows,
    );
  };

  usePageHeader('Tiendas', `${stores.length} ubicaciones`);
  usePageNav(
    <PeriodSegmented
      value={period}
      onChange={setPeriod}
      options={STORE_PERIOD_OPTIONS}
      label="Periodo"
    />,
  );
  usePageActions(
    <>
      <button
        type="button"
        className="float-action-btn"
        onClick={handleExport}
        aria-label="Exportar CSV"
        title="Exportar CSV"
        data-testid="stores-export"
      >
        <Download size={17} aria-hidden="true" />
      </button>
      <Button
        onClick={() => setCreating(true)}
        data-testid="new-store"
        icon={<Plus size={16} aria-hidden="true" />}
      >
        Nueva tienda
      </Button>
    </>,
  );

  const shellHeight = useTableShellHeight();
  const q = query.trim();
  const countLabel = q
    ? `${visibleStores.length} de ${stores.length}`
    : `${stores.length} ubicaciones`;
  const totalStr = fmtEur(visibleStores.reduce((sum, s) => sum + (salesByStore.get(s.id) ?? 0), 0));

  return (
    <div className="stores-page" style={{ height: shellHeight }}>
      <div className="stores-card">
        {isLoading ? (
          <p className="catalog-empty">Cargando…</p>
        ) : stores.length === 0 ? (
          <p className="catalog-empty" data-testid="stores-empty">
            Sin tiendas. Crea la primera.
          </p>
        ) : (
          <div className="stores-layout">
            <StoreList
              stores={visibleStores}
              salesByStore={salesByStore}
              query={query}
              onSearch={setQuery}
              selectedId={selected?.id ?? null}
              onSelect={selectStore}
              countLabel={countLabel}
              totalStr={totalStr}
            />
            {selected && (
              <>
                <StoreDetailPanel
                  store={selected}
                  sales={salesByStore.get(selected.id) ?? 0}
                  periodCaption={`Ventas · ${PERIOD_LABEL[period]}`}
                  devices={devices}
                  log={log}
                  onEdit={() => setEditing(selected)}
                  onDelete={() => void askDelete(selected)}
                  deleteError={
                    deleteMut.isError
                      ? formErrorMessage(deleteMut.error, 'No se pudo borrar.')
                      : null
                  }
                  onOpenStock={() => onOpenStoreView('stock', selected.id)}
                  onOpenSales={() => onOpenStoreView('sales', selected.id)}
                  onOpenPrices={() => setPricesFor(selected)}
                />
                {/* `key` fuerza remount al cambiar de tienda: el panel deriva su estado
                    inicial (opsVerified/opsIncident/opsBaseline) de `store` vía useState,
                    que NO se re-sincroniza solo porque cambien las props. */}
                <StoreOpsPanel key={selected.id} store={selected} devices={devices} log={log} />
              </>
            )}
          </div>
        )}
      </div>

      {creating && (
        <StoreFormModal
          onClose={() => setCreating(false)}
          onSubmit={(f) => createMut.mutate(f)}
          pending={createMut.isPending}
          error={createMut.isError ? formErrorMessage(createMut.error, 'No se pudo crear.') : null}
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
    </div>
  );
}
