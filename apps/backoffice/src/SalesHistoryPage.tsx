import { Badge, DataTable, type DataTableColumn, Select, usePageHeader } from '@simpletpv/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { CsvActionButton } from './components/CsvActionButton.js';
import { PeriodSegmented } from './components/PeriodSegmented.js';
import { useTableColumns } from './components/useTableColumns.js';
import {
  listSales,
  listStores,
  listUsers,
  type SalesQueryInput,
  type SalesViewRow,
} from './lib/admin.js';
import { exportRowsToCsv } from './lib/csv.js';
import type { DashboardPeriod } from './lib/dashboard.js';
import { type FamilyNode, listFamilies } from './lib/families.js';
import { useFeatures } from './lib/features.js';
import { fmtEur, fmtRate } from './lib/format.js';
import { usePageActions } from './lib/pageActions.js';
import { isDashboardPeriod, PERIOD_OPTIONS, periodToRange } from './lib/period.js';
import { SalesStats } from './sales/SalesStats.js';

const hour = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });
const PAYMENT_LABEL: Record<string, string> = { CASH: 'Efectivo', CARD: 'Tarjeta' };
const STATUS_LABEL: Record<string, string> = { COMPLETED: 'Completadas', VOIDED: 'Anuladas' };
const PAGE_SIZE = 20;

interface Filters {
  storeId: string;
  sellerId: string;
  familyId: string;
  status: string;
  // S-11: periodo relativo (Hoy/Ayer/Semana/Mes/Año). '' = sin filtro (todo el histórico).
  // Comparte el tipo `DashboardPeriod` con el Dashboard para una semántica idéntica.
  period: DashboardPeriod | '';
}
const NO_FILTERS: Filters = { storeId: '', sellerId: '', familyId: '', status: '', period: '' };

interface SavedView extends Filters {
  name: string;
}
const VIEWS_KEY = 'bo.sales.views';

function loadViews(): SavedView[] {
  try {
    const raw = localStorage.getItem(VIEWS_KEY);
    if (!raw) return [];
    // Tolerancia (S-11): las vistas guardadas ANTES de añadir `period` no traen el campo;
    // degradan a '' (sin periodo) sin romper. Se normaliza al cargar.
    const parsed = JSON.parse(raw) as Array<Partial<SavedView> & { name: string }>;
    return parsed.map((v) => ({
      name: v.name,
      storeId: v.storeId ?? '',
      sellerId: v.sellerId ?? '',
      familyId: v.familyId ?? '',
      status: v.status ?? '',
      period: isDashboardPeriod(v.period) ? v.period : '',
    }));
  } catch {
    return [];
  }
}

// Aplana el árbol de familias a una lista plana {id, name} para el selector,
// indentando los hijos para reflejar la jerarquía.
function flattenFamilies(nodes: FamilyNode[], depth = 0): { id: string; name: string }[] {
  return nodes.flatMap((n) => [
    { id: n.id, name: depth > 0 ? `${'  '.repeat(depth)}${n.name}` : n.name },
    ...flattenFamilies(n.children, depth + 1),
  ]);
}

// Mapea los filtros de la UI a la query de listSales (sellerId → userId, igual que
// findSales): solo se incluyen los activos. El periodo se traduce a date|from|to vía
// `periodToRange` (S-11): Hoy/Ayer → un día (`date`); Semana/Mes/Año → rango (`from`/`to`).
function toQuery(filters: Filters): SalesQueryInput {
  return {
    ...(filters.storeId ? { storeId: filters.storeId } : {}),
    ...(filters.sellerId ? { userId: filters.sellerId } : {}),
    ...(filters.familyId ? { familyId: filters.familyId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.period ? periodToRange(filters.period) : {}),
  };
}

function downloadCsv(items: SalesViewRow[]): void {
  const headers: string[] = [
    'Nº ticket',
    'Hora',
    'Tienda',
    'Vendedor',
    'Importe (€)',
    'Método',
    'Estado',
  ];
  const rows: string[][] = items.map((s) => [
    String(s.ticketNumber),
    hour.format(new Date(s.createdAt)),
    s.storeName,
    s.sellerName,
    Number(s.total).toFixed(2),
    PAYMENT_LABEL[s.paymentMethod] ?? s.paymentMethod,
    s.status === 'VOIDED' ? 'Anulada' : 'Completada',
  ]);
  exportRowsToCsv('ventas.csv', headers, rows);
}

const columns: DataTableColumn<SalesViewRow>[] = [
  { key: 'ticketNumber', header: 'Ticket' },
  { key: 'storeName', header: 'Tienda' },
  { key: 'sellerName', header: 'Vendedor' },
  {
    key: 'paymentMethod',
    header: 'Pago',
    render: (r) => PAYMENT_LABEL[r.paymentMethod] ?? r.paymentMethod,
  },
  {
    key: 'status',
    header: 'Estado',
    render: (r) =>
      r.status === 'VOIDED' ? (
        <Badge variant="danger">Anulada</Badge>
      ) : (
        <Badge variant="success">Completada</Badge>
      ),
  },
  { key: 'total', header: 'Total', align: 'right', render: (r) => fmtEur(Number(r.total)) },
  { key: 'createdAt', header: 'Hora', render: (r) => hour.format(new Date(r.createdAt)) },
];

export function SalesHistoryPage({ initialStoreId }: { initialStoreId?: string | null }) {
  // El periodo es URL-state (F0c): ?period= sobrevive al reload y es compartible/back-navegable.
  // El resto de filtros sigue siendo estado local (no había deep-link previo para ellos).
  const [searchParams, setSearchParams] = useSearchParams();
  const urlPeriod: DashboardPeriod | '' = isDashboardPeriod(searchParams.get('period'))
    ? (searchParams.get('period') as DashboardPeriod)
    : '';
  const [filters, setFilters] = useState<Filters>({
    ...NO_FILTERS,
    ...(initialStoreId ? { storeId: initialStoreId } : {}),
    period: urlPeriod,
  });
  const [page, setPage] = useState(1);
  const [views, setViews] = useState<SavedView[]>(() => loadViews());
  // Feature flag (#127 B): oculta el export si el módulo está apagado a nivel org.
  const features = useFeatures();

  // Al cambiar un filtro se vuelve a la primera página.
  const setFilter = (patch: Partial<Filters>): void => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  // El periodo, además de filtro, persiste en ?period= (preservando el resto de params).
  const setPeriod = (next: DashboardPeriod | ''): void => {
    setFilter({ period: next });
    setSearchParams(
      (prev) => {
        const updated = new URLSearchParams(prev);
        if (next) updated.set('period', next);
        else updated.delete('period');
        return updated;
      },
      { replace: true },
    );
  };

  const query = useQuery({
    queryKey: ['sales-history', filters, page],
    queryFn: () => listSales({ ...toQuery(filters), page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const data = query.data;
  const totals = data?.totals;

  // Opciones de los filtros, desde la API real (IT-09): tiendas, vendedores y familias.
  const { data: stores = [] } = useQuery({ queryKey: ['stores'], queryFn: listStores });
  const { data: sellers = [] } = useQuery({ queryKey: ['users'], queryFn: listUsers });
  const { data: families = [] } = useQuery({ queryKey: ['families'], queryFn: listFamilies });
  const familyOptions = flattenFamilies(families);

  usePageHeader('Ventas', 'Historial de tickets');

  // Columnas configurables por usuario (IT-16/D-04): hook compartido con el resto
  // de tablas; persistido en 'table.sales.columns'.
  const {
    effectiveColumns,
    editor: columnsEditor,
    editorOpen: columnsEditorOpen,
    toggleEditor: toggleColumnsEditor,
  } = useTableColumns('table.sales.columns', columns, {
    editorTestId: 'sales-columns-editor',
    title: 'Columnas de la tabla',
  });

  const hasFilters = Boolean(
    filters.storeId || filters.sellerId || filters.familyId || filters.status || filters.period,
  );
  const periodLabel = (p: DashboardPeriod | ''): string | undefined =>
    PERIOD_OPTIONS.find((o) => o.value === p)?.label;

  const persistViews = (next: SavedView[]): void => {
    setViews(next);
    try {
      localStorage.setItem(VIEWS_KEY, JSON.stringify(next));
    } catch {
      /* almacenamiento no disponible: la vista solo vive en memoria */
    }
  };
  const saveView = (): void => {
    if (!hasFilters) return;
    const name =
      [
        stores.find((s) => s.id === filters.storeId)?.name,
        sellers.find((s) => s.id === filters.sellerId)?.name,
        familyOptions.find((f) => f.id === filters.familyId)?.name.trim(),
        STATUS_LABEL[filters.status],
        periodLabel(filters.period),
      ]
        .filter(Boolean)
        .join(' · ') || 'Todas';
    if (views.some((v) => v.name === name)) return;
    persistViews([...views, { name, ...filters }]);
  };
  const removeView = (name: string): void => persistViews(views.filter((v) => v.name !== name));
  const applyView = (v: SavedView): void => {
    setFilters({
      storeId: v.storeId,
      sellerId: v.sellerId,
      familyId: v.familyId,
      status: v.status,
      period: v.period,
    });
    // El periodo es URL-state: aplicar una vista guardada también lo refleja en ?period=.
    setSearchParams(
      (prev) => {
        const updated = new URLSearchParams(prev);
        if (v.period) updated.set('period', v.period);
        else updated.delete('period');
        return updated;
      },
      { replace: true },
    );
    setPage(1);
  };

  // "Limpiar" resetea todos los filtros, incluido el periodo y su ?period= en la URL.
  const clearFilters = (): void => {
    setFilters(NO_FILTERS);
    setSearchParams(
      (prev) => {
        const updated = new URLSearchParams(prev);
        updated.delete('period');
        return updated;
      },
      { replace: true },
    );
    setPage(1);
  };

  // Exporta TODO el conjunto filtrado (no solo la página visible).
  const exportCsv = async (): Promise<void> => {
    const all = await listSales({ ...toQuery(filters), page: 1, pageSize: 100000 });
    downloadCsv(all.items);
  };

  const toolbar = (
    <>
      <div className="sales-filters">
        {/* S-11: filtro de periodo como un filtro más de la tabla (P063), etiqueta visible
            "Periodo" (P066). Alimenta `from`/`to`/`date` de listSales vía periodToRange y vive
            en ?period= (URL-state). El periodo activo se quita con "Limpiar". */}
        <div className="sales-period-filter" data-testid="sales-period">
          <span className="sales-period-label">Periodo</span>
          {/* `filters.period` puede ser '' (sin periodo): el cast es inocuo porque ningún
              segmento iguala '' → ninguno queda activo (aria-pressed=false en todos). */}
          <PeriodSegmented
            value={filters.period as DashboardPeriod}
            onChange={setPeriod}
            label="Periodo"
          />
        </div>
        <Select
          className="catalog-search"
          value={filters.storeId}
          onChange={(value) => setFilter({ storeId: value })}
          ariaLabel="Filtrar por tienda"
          data-testid="sales-store"
          options={[
            { value: '', label: 'Todas las tiendas' },
            ...stores.map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
        <Select
          className="catalog-search"
          value={filters.sellerId}
          onChange={(value) => setFilter({ sellerId: value })}
          ariaLabel="Filtrar por vendedor"
          data-testid="sales-seller"
          options={[
            { value: '', label: 'Todos los vendedores' },
            ...sellers.map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
        <Select
          className="catalog-search"
          value={filters.familyId}
          onChange={(value) => setFilter({ familyId: value })}
          ariaLabel="Filtrar por familia"
          data-testid="sales-family"
          options={[
            { value: '', label: 'Todas las familias' },
            ...familyOptions.map((f) => ({ value: f.id, label: f.name })),
          ]}
        />
        <Select
          className="catalog-search"
          value={filters.status}
          onChange={(value) => setFilter({ status: value })}
          ariaLabel="Filtrar por estado"
          data-testid="sales-status"
          options={[
            { value: '', label: 'Todos los estados' },
            { value: 'COMPLETED', label: 'Completadas' },
            { value: 'VOIDED', label: 'Anuladas' },
          ]}
        />
        {hasFilters && (
          <>
            <button
              type="button"
              className="users-sel-btn"
              onClick={clearFilters}
              data-testid="sales-clear"
            >
              Limpiar
            </button>
            <button
              type="button"
              className="users-sel-btn"
              onClick={saveView}
              data-testid="sales-save-view"
            >
              Guardar vista
            </button>
          </>
        )}
      </div>
    </>
  );

  const footer = (
    <div className="sales-totals" data-testid="sales-totals">
      <span>{totals?.count ?? 0} tickets</span>
      <span>
        Total: <strong>{fmtEur(Number(totals?.totalAmount ?? 0))}</strong>
      </span>
      <span>Margen medio: {fmtRate(totals?.avgMarginPct)}</span>
      <span>Descuento medio: {fmtRate(totals?.avgDiscountPct)}</span>
    </div>
  );

  usePageActions(
    <>
      {features.data_export && (
        <CsvActionButton
          kind="export"
          label="Exportar CSV"
          onClick={() => void exportCsv()}
          testId="sales-export"
        />
      )}
      <button
        type="button"
        className={`float-action-btn${columnsEditorOpen ? ' is-active' : ''}`}
        onClick={toggleColumnsEditor}
        aria-label="Ajustar columnas"
        title="Columnas"
        aria-expanded={columnsEditorOpen}
        data-testid="sales-columns-toggle"
      >
        <SlidersHorizontal size={17} aria-hidden="true" />
      </button>
    </>,
  );

  return (
    <section className="catalog">
      {views.length > 0 && (
        <div className="sales-views" data-testid="sales-views">
          {views.map((v) => (
            <span key={v.name} className="sales-view-chip">
              <button
                className="sales-view-apply"
                onClick={() => applyView(v)}
                data-testid="sales-view-apply"
              >
                {v.name}
              </button>
              <button
                className="sales-view-remove"
                onClick={() => removeView(v.name)}
                aria-label={`Eliminar vista ${v.name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {columnsEditor}

      {/* S-10: estadísticas embebidas (KPIs + serie temporal) con los MISMOS filtros
          que la tabla (incluido el periodo de S-11). Misma `toQuery(filters)` que
          alimenta `listSales`, así KPIs/gráfica y tabla se recalculan a la vez. */}
      <SalesStats query={toQuery(filters)} />

      <DataTable
        columns={effectiveColumns}
        rows={data?.items ?? []}
        rowKey={(r) => r.id}
        loading={query.isLoading}
        toolbar={toolbar}
        footer={footer}
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          totalItems: data?.totalItems ?? 0,
          onPageChange: setPage,
        }}
        emptyState={
          <span data-testid="sales-empty">Sin ventas para los filtros seleccionados.</span>
        }
        data-testid="sales-table"
      />
    </section>
  );
}
