import { usePageHeader } from '@simpletpv/ui';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { CsvActionButton } from './components/CsvActionButton.js';
import { ImportExportModal } from './components/ImportExportModal.js';
import { PeriodSegmented } from './components/PeriodSegmented.js';
import { listSales } from './lib/admin.js';
import type { DashboardPeriod } from './lib/dashboard.js';
import { useFeatures } from './lib/features.js';
import { usePageActions } from './lib/pageActions.js';
import { isDashboardPeriod, periodToRange } from './lib/period.js';
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
  todayIso,
  toggleInSet,
} from './sales/sales-facets.js';
import { SalesDetail } from './sales/SalesDetail.js';
import { SalesFacets } from './sales/SalesFacets.js';
import { SalesList } from './sales/SalesList.js';

// Tope de ventas cargadas por periodo. El backend acota cada página a 100; el ledger
// es client-driven (facetas/recuentos/chips/búsqueda se calculan en el cliente sobre
// este conjunto). Si el periodo tiene más, se avisa (cap-note) y se afina con filtros.
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

  // El periodo es URL-state (?period=): sobrevive al reload y es compartible.
  const urlPeriod: DashboardPeriod | '' = isDashboardPeriod(searchParams.get('period'))
    ? (searchParams.get('period') as DashboardPeriod)
    : '';
  const [period, setPeriodState] = useState<DashboardPeriod | ''>(urlPeriod);

  const [view, setView] = useState<SavedViewId>('all');
  const [facets, setFacets] = useState<SalesFacetState>(EMPTY_SALES_FACETS);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Deep-link de tienda ("Ver ventas" desde Tiendas): acota el ledger en servidor.
  const [serverStoreId, setServerStoreId] = useState<string | null>(initialStoreId ?? null);
  const [dataModal, setDataModal] = useState<'export' | null>(null);

  const features = useFeatures();
  usePageHeader('Ventas', 'Historial de tickets y facturas · cobro y estado en un vistazo');

  const periodRange = period ? periodToRange(period) : {};
  const query = useQuery({
    queryKey: ['sales-ledger', period, serverStoreId],
    queryFn: () =>
      listSales({
        ...periodRange,
        ...(serverStoreId ? { storeId: serverStoreId } : {}),
        page: 1,
        pageSize: LEDGER_PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });
  const rows = query.data?.items ?? [];
  const totalItems = query.data?.totalItems ?? 0;
  const capExtra = Math.max(0, totalItems - rows.length);

  const today = todayIso();
  const facetGroups = useMemo(() => computeSalesFacets(rows, today), [rows, today]);
  const savedViews = useMemo(() => computeSavedViews(rows, today), [rows, today]);
  const filtered = useMemo(
    () => filterSales(rows, view, facets, search, today),
    [rows, view, facets, search, today],
  );
  const chips = useMemo(() => cobroTotals(filtered, today), [filtered, today]);
  const selected = filtered.find((r) => r.id === selectedId) ?? filtered[0] ?? null;

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

  const filtersActive =
    hasActiveFilters(view, facets, search) || period !== '' || serverStoreId !== null;

  const clearFilters = (): void => {
    setView('all');
    setFacets(EMPTY_SALES_FACETS);
    setSearch('');
    setServerStoreId(null);
    setSelectedId(null);
    setPeriodState('');
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
    filtered.map((r) => [
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

  usePageActions(
    <div className="ventas-topbar-actions">
      <div className="sales-period-filter" data-testid="sales-period">
        <PeriodSegmented value={period as DashboardPeriod} onChange={setPeriod} label="Periodo" />
      </div>
      {features.data_export && (
        <CsvActionButton
          kind="export"
          label="Exportar"
          onClick={() => setDataModal('export')}
          testId="sales-export"
        />
      )}
    </div>,
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
            rows={filtered}
            chips={chips}
            showSummary
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
            capExtra={capExtra}
            hasFilters={filtersActive}
            onClearFilters={clearFilters}
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
