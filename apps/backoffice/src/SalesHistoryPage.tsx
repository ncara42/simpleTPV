import { usePageHeader } from '@simpletpv/ui';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { CsvActionButton } from './components/CsvActionButton.js';
import { ImportExportModal } from './components/ImportExportModal.js';
import { PeriodSegmented } from './components/PeriodSegmented.js';
import { listSales } from './lib/admin.js';
import type { DashboardPeriod } from './lib/dashboard.js';
import { useFeatures } from './lib/features.js';
import { usePageActions } from './lib/pageActions.js';
import { usePageNav } from './lib/pageNav.js';
import { parsePeriod, periodToRange } from './lib/period.js';
import { collectSale, getReceiptHtml, getTicket } from './lib/sales.js';
import {
  CHANNEL_LABELS,
  COBRO_LABELS,
  cobroStatusOf,
  cobroTotals,
  computeSalesFacets,
  computeSavedViews,
  customerOf,
  EMPTY_SALES_FACETS,
  type FacetKey,
  filterSales,
  hasActiveFilters,
  METHOD_LABELS,
  type SalesFacetState,
  type SavedViewId,
  type SortDir,
  sortSalesByDate,
  todayIso,
  toggleInSet,
} from './sales/sales-facets.js';
import { SalesDetail } from './sales/SalesDetail.js';
import { SalesFacets } from './sales/SalesFacets.js';
import { SalesList } from './sales/SalesList.js';

// Tope de ventas cargadas por periodo. El backend acota cada página a 100; el ledger
// es client-driven (facetas/recuentos/chips/búsqueda se calculan en el cliente sobre
// este conjunto). Si el periodo tiene más, se afina con filtros o se acota el periodo.
const LEDGER_PAGE_SIZE = 100;

const hourFmt = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });

// Cabeceras de exportación del ledger de Ventas.
const exportHeaders = [
  'Nº ticket',
  'Hora',
  'Cliente',
  'Tienda',
  'Vendedor',
  'Canal',
  'Método',
  'Estado cobro',
  'Importe (€)',
];

export function SalesHistoryPage({ initialStoreId }: { initialStoreId?: string | null }) {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // El periodo es URL-state (?period=): sobrevive al reload y es compartible. Por defecto
  // arranca en «Hoy» (sin ?period= en la URL) — es la línea base de la vista.
  const urlPeriod = parsePeriod(searchParams.get('period'), 'today');
  const [period, setPeriodState] = useState<DashboardPeriod | ''>(urlPeriod);

  const [view, setView] = useState<SavedViewId>('all');
  // Orden del ledger por fecha (cliente): el backend solo sirve DESC fijo. Por
  // defecto «Recientes» (más reciente primero), igual que el orden del servidor.
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [facets, setFacets] = useState<SalesFacetState>(EMPTY_SALES_FACETS);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Deep-link de tienda ("Ver ventas" desde Tiendas): acota el ledger en servidor.
  const [serverStoreId, setServerStoreId] = useState<string | null>(initialStoreId ?? null);
  const [dataModal, setDataModal] = useState<'export' | null>(null);

  const features = useFeatures();
  usePageHeader('Ventas', 'Historial de tickets y facturas · cobro y estado en un vistazo');

  const periodRange = period ? periodToRange(period) : {};
  // El servidor topa cada página a 100 (MAX_SALES_PAGE_SIZE); para ver más se acumulan
  // páginas en cliente (el ledger es client-driven: facetas/recuentos/chips/búsqueda/orden
  // se calculan sobre el conjunto cargado). `totalItems` indica cuándo dejar de pedir.
  const query = useInfiniteQuery({
    queryKey: ['sales-ledger', period, serverStoreId],
    queryFn: ({ pageParam }) =>
      listSales({
        ...periodRange,
        ...(serverStoreId ? { storeId: serverStoreId } : {}),
        page: pageParam,
        pageSize: LEDGER_PAGE_SIZE,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return loaded < lastPage.totalItems ? pages.length + 1 : undefined;
    },
    placeholderData: keepPreviousData,
  });
  const rows = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  const totalItems = query.data?.pages[0]?.totalItems ?? 0;
  const remaining = Math.max(0, totalItems - rows.length);

  const today = todayIso();
  const facetGroups = useMemo(() => computeSalesFacets(rows, today), [rows, today]);
  const savedViews = useMemo(() => computeSavedViews(rows, today), [rows, today]);
  const filtered = useMemo(
    () => filterSales(rows, view, facets, search, today),
    [rows, view, facets, search, today],
  );
  const sorted = useMemo(() => sortSalesByDate(filtered, sortDir), [filtered, sortDir]);
  const chips = useMemo(() => cobroTotals(filtered, today), [filtered, today]);
  const selected = sorted.find((r) => r.id === selectedId) ?? sorted[0] ?? null;

  // Detalle del ticket (desglose de líneas) de la venta seleccionada.
  const ticketQuery = useQuery({
    queryKey: ['sale-ticket', selected?.id],
    queryFn: () => getTicket(selected!.id),
    enabled: Boolean(selected),
  });

  const collectMut = useMutation({
    mutationFn: (saleId: string) => collectSale(saleId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sales-ledger'] });
    },
  });

  const setPeriod = (next: DashboardPeriod | ''): void => {
    setPeriodState(next);
    setSelectedId(null);
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

  const toggleFacet = (key: FacetKey, optKey: string): void =>
    setFacets((f) => ({ ...f, [key]: toggleInSet(f[key] as ReadonlySet<string>, optKey) }));

  const toggleSort = (): void => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));

  const filtersActive =
    hasActiveFilters(view, facets, search) || period !== 'today' || serverStoreId !== null;

  const clearFilters = (): void => {
    setView('all');
    setFacets(EMPTY_SALES_FACETS);
    setSearch('');
    setServerStoreId(null);
    setSelectedId(null);
    setPeriodState('today');
    setSearchParams(
      (prev) => {
        const updated = new URLSearchParams(prev);
        updated.delete('period');
        return updated;
      },
      { replace: true },
    );
  };

  // «Ver factura»: el recibo (HTML, generado y escapado por el backend con CSP
  // estricta) exige Bearer. Se abre una pestaña en blanco SINCRÓNICAMENTE (evita el
  // bloqueo de pop-ups) y, al llegar el HTML, se navega a un blob URL (sin
  // document.write). El blob se revoca al cargar para no fugar memoria.
  const viewInvoice = (saleId: string): void => {
    const win = window.open('', '_blank');
    void getReceiptHtml(saleId)
      .then((html) => {
        if (!win) return;
        const blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
        win.addEventListener('load', () => URL.revokeObjectURL(blobUrl), { once: true });
        win.location.href = blobUrl;
      })
      .catch(() => win?.close());
  };

  const buildExportRows = async (): Promise<string[][]> =>
    sorted.map((r) => [
      String(r.ticketNumber),
      hourFmt.format(new Date(r.createdAt)),
      customerOf(r),
      r.storeName,
      r.sellerName,
      CHANNEL_LABELS[r.channel] ?? r.channel,
      METHOD_LABELS[r.paymentMethod] ?? r.paymentMethod,
      COBRO_LABELS[cobroStatusOf(r)],
      Number(r.total).toFixed(2),
    ]);

  // El filtro de periodo vive en el slot IZQUIERDO del topbar (pageNav), igual que las
  // pestañas de Inventario; la acción Exportar queda en el clúster derecho (pageActions).
  usePageNav(
    <div className="sales-period-filter" data-testid="sales-period">
      <PeriodSegmented value={period as DashboardPeriod} onChange={setPeriod} label="Periodo" />
    </div>,
  );

  usePageActions(
    features.data_export ? (
      <CsvActionButton
        kind="export"
        label="Exportar"
        onClick={() => setDataModal('export')}
        testId="sales-export"
      />
    ) : null,
  );

  return (
    <div className="ventas-page" data-testid="sales-page">
      <div className="ventas-card">
        <div className="ventas-layout">
          <SalesFacets
            search={search}
            onSearchChange={setSearch}
            savedViews={savedViews}
            view={view}
            onView={setView}
            facetGroups={facetGroups}
            facets={facets}
            onToggleFacet={toggleFacet}
            showClear={filtersActive}
            onClear={clearFilters}
          />
          <SalesList
            rows={sorted}
            chips={chips}
            showSummary
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
            hasFilters={filtersActive}
            onClearFilters={clearFilters}
            sortDir={sortDir}
            onToggleSort={toggleSort}
            remaining={remaining}
            onLoadMore={() => void query.fetchNextPage()}
            loadingMore={query.isFetchingNextPage}
          />
          <SalesDetail
            row={selected}
            ticket={ticketQuery.data ?? null}
            ticketLoading={ticketQuery.isLoading}
            collecting={collectMut.isPending}
            onCollect={(id) => collectMut.mutate(id)}
            onViewInvoice={viewInvoice}
          />
        </div>
      </div>

      {dataModal && (
        <ImportExportModal
          title="Ventas"
          initialMode={dataModal}
          onClose={() => setDataModal(null)}
          testId="sales-data-modal"
          exportConfig={{
            headers: exportHeaders,
            getRows: buildExportRows,
            filenameBase: 'ventas',
          }}
        />
      )}
    </div>
  );
}
