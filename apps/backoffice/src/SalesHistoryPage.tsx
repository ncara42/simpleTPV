import { Badge, DataTable, type DataTableColumn, Select } from '@simpletpv/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { useTableColumns } from './components/useTableColumns.js';
import {
  listSales,
  listStores,
  listUsers,
  type SalesQueryInput,
  type SalesViewRow,
} from './lib/admin.js';
import { type FamilyNode, listFamilies } from './lib/families.js';
import { useFeatures } from './lib/features.js';
import { fmtEur, fmtRate } from './lib/format.js';
import { usePageHeader } from './lib/pageHeader.js';

const hour = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });
const PAYMENT_LABEL: Record<string, string> = { CASH: 'Efectivo', CARD: 'Tarjeta' };
const STATUS_LABEL: Record<string, string> = { COMPLETED: 'Completadas', VOIDED: 'Anuladas' };
const PAGE_SIZE = 20;

interface Filters {
  storeId: string;
  sellerId: string;
  familyId: string;
  status: string;
}
const NO_FILTERS: Filters = { storeId: '', sellerId: '', familyId: '', status: '' };

interface SavedView extends Filters {
  name: string;
}
const VIEWS_KEY = 'bo.sales.views';

function loadViews(): SavedView[] {
  try {
    const raw = localStorage.getItem(VIEWS_KEY);
    return raw ? (JSON.parse(raw) as SavedView[]) : [];
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
// findSales): solo se incluyen los activos.
function toQuery(filters: Filters): SalesQueryInput {
  return {
    ...(filters.storeId ? { storeId: filters.storeId } : {}),
    ...(filters.sellerId ? { userId: filters.sellerId } : {}),
    ...(filters.familyId ? { familyId: filters.familyId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
  };
}

function downloadCsv(items: SalesViewRow[]): void {
  const header = 'Nº ticket,Hora,Tienda,Vendedor,Importe (€),Método,Estado';
  const rows = items.map((s) =>
    [
      s.ticketNumber,
      hour.format(new Date(s.createdAt)),
      s.storeName,
      s.sellerName,
      Number(s.total).toFixed(2),
      PAYMENT_LABEL[s.paymentMethod] ?? s.paymentMethod,
      s.status === 'VOIDED' ? 'Anulada' : 'Completada',
    ].join(','),
  );
  const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ventas.csv';
  a.click();
  URL.revokeObjectURL(url);
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
  const [filters, setFilters] = useState<Filters>(
    initialStoreId ? { ...NO_FILTERS, storeId: initialStoreId } : NO_FILTERS,
  );
  const [page, setPage] = useState(1);
  const [views, setViews] = useState<SavedView[]>(() => loadViews());
  // Feature flag (#127 B): oculta el export si el módulo está apagado a nivel org.
  const features = useFeatures();

  // Al cambiar un filtro se vuelve a la primera página.
  const setFilter = (patch: Partial<Filters>): void => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
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
    filters.storeId || filters.sellerId || filters.familyId || filters.status,
  );

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
    });
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
              onClick={() => {
                setFilters(NO_FILTERS);
                setPage(1);
              }}
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
      {features.data_export && (
        <button
          className="btn-primary sales-export"
          onClick={() => void exportCsv()}
          data-testid="sales-export-csv"
        >
          Exportar CSV
        </button>
      )}
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

      <div className="config-bar">
        <button
          type="button"
          className="config-trigger"
          onClick={toggleColumnsEditor}
          data-testid="sales-columns-toggle"
          aria-expanded={columnsEditorOpen}
        >
          Columnas
        </button>
      </div>
      {columnsEditor}

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
