import { Select } from '@simpletpv/ui';
import { useEffect, useMemo, useRef, useState } from 'react';

import { DEMO_FAMILIES, DEMO_SALES, type DemoSaleRow, SALE_SELLERS } from './demo/demoData.js';
import { fmtEur } from './lib/format.js';
import { usePageHeader } from './lib/pageHeader.js';

const hour = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });
const PAYMENT_LABEL: Record<string, string> = { CASH: 'Efectivo', CARD: 'Tarjeta' };
const STATUS_LABEL: Record<string, string> = { COMPLETED: 'Completadas', VOIDED: 'Anuladas' };
const PAGE = 20; // tamaño de bloque del scroll infinito

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

// Tiendas/vendedores/familias presentes en las ventas, para poblar los selectores.
const STORE_OPTIONS = Array.from(new Map(DEMO_SALES.map((s) => [s.storeId, s.storeName])));

function exportCsv(items: DemoSaleRow[]) {
  const header = 'Nº ticket,Hora,Tienda,Vendedor,Familia,Importe (€),Método,Estado';
  const rows = items.map((s) =>
    [
      s.ticketNumber,
      hour.format(new Date(s.createdAt)),
      s.storeName,
      s.sellerName,
      s.familyName,
      Number(s.total).toFixed(2),
      PAYMENT_LABEL[s.paymentMethod] ?? s.paymentMethod,
      s.status === 'VOIDED' ? 'Anulada' : 'Completada',
    ].join(','),
  );
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ventas.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function SalesHistoryPage() {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [visible, setVisible] = useState(PAGE);
  const [views, setViews] = useState<SavedView[]>(() => loadViews());
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const setFilter = (patch: Partial<Filters>): void => setFilters((f) => ({ ...f, ...patch }));

  // Conjunto filtrado completo (sin paginar): por tienda, vendedor, familia y estado.
  const filtered = useMemo(
    () =>
      DEMO_SALES.filter(
        (s) =>
          (!filters.storeId || s.storeId === filters.storeId) &&
          (!filters.sellerId || s.sellerId === filters.sellerId) &&
          (!filters.familyId || s.familyId === filters.familyId) &&
          (!filters.status || s.status === filters.status),
      ),
    [filters],
  );
  const filteredRef = useRef(filtered);
  filteredRef.current = filtered;

  // Reinicia el scroll al cambiar los filtros.
  useEffect(() => setVisible(PAGE), [filters]);

  const shown = filtered.slice(0, visible);
  const hasMore = visible < filtered.length;

  // Scroll infinito: cuando el centinela entra en viewport, carga otro bloque.
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        setVisible((v) => Math.min(filteredRef.current.length, v + PAGE));
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore]);

  // Totales del conjunto filtrado (solo COMPLETED suman importe).
  const totals = useMemo(() => {
    const completed = filtered.filter((s) => s.status !== 'VOIDED');
    return {
      count: filtered.length,
      amount: completed.reduce((acc, s) => acc + Number(s.total), 0),
    };
  }, [filtered]);

  const persistViews = (next: SavedView[]): void => {
    setViews(next);
    try {
      localStorage.setItem(VIEWS_KEY, JSON.stringify(next));
    } catch {
      /* almacenamiento no disponible: la vista solo vive en memoria */
    }
  };
  const saveView = (): void => {
    if (!filters.storeId && !filters.sellerId && !filters.familyId && !filters.status) return;
    const name =
      [
        STORE_OPTIONS.find(([id]) => id === filters.storeId)?.[1],
        SALE_SELLERS.find((s) => s.id === filters.sellerId)?.name,
        DEMO_FAMILIES.find((f) => f.id === filters.familyId)?.name,
        STATUS_LABEL[filters.status],
      ]
        .filter(Boolean)
        .join(' · ') || 'Todas';
    if (views.some((v) => v.name === name)) return;
    persistViews([...views, { name, ...filters }]);
  };
  const removeView = (name: string): void => persistViews(views.filter((v) => v.name !== name));

  const hasFilters = Boolean(
    filters.storeId || filters.sellerId || filters.familyId || filters.status,
  );

  usePageHeader('Ventas', 'Historial de tickets · scroll infinito');

  return (
    <section className="catalog">
      <div className="table-panel">
        <div className="users-toolbar sales-toolbar">
          <div className="sales-filters">
            <Select
              className="catalog-search"
              value={filters.storeId}
              onChange={(value) => setFilter({ storeId: value })}
              ariaLabel="Filtrar por tienda"
              data-testid="sales-store"
              options={[
                { value: '', label: 'Todas las tiendas' },
                ...STORE_OPTIONS.map(([id, name]) => ({ value: id, label: name })),
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
                ...SALE_SELLERS.map((s) => ({ value: s.id, label: s.name })),
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
                ...DEMO_FAMILIES.map((f) => ({ value: f.id, label: f.name })),
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
                  onClick={() => setFilters(NO_FILTERS)}
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
          <button
            className="btn-primary"
            onClick={() => exportCsv(filtered)}
            data-testid="sales-export-csv"
          >
            Exportar CSV
          </button>
        </div>

        {views.length > 0 && (
          <div className="sales-views" data-testid="sales-views">
            {views.map((v) => (
              <span key={v.name} className="sales-view-chip">
                <button
                  className="sales-view-apply"
                  onClick={() =>
                    setFilters({
                      storeId: v.storeId,
                      sellerId: v.sellerId,
                      familyId: v.familyId,
                      status: v.status ?? '',
                    })
                  }
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

        {filtered.length === 0 ? (
          <p className="catalog-empty" data-testid="sales-empty">
            Sin ventas para los filtros seleccionados.
          </p>
        ) : (
          <>
            <table className="catalog-table" data-testid="sales-table">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Tienda</th>
                  <th>Vendedor</th>
                  <th>Familia</th>
                  <th>Pago</th>
                  <th>Total</th>
                  <th>Hora</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((sale) => (
                  <tr
                    key={sale.id}
                    className={sale.status === 'VOIDED' ? 'sale-voided' : undefined}
                    data-testid="sales-row"
                  >
                    <td>{sale.ticketNumber}</td>
                    <td className="muted">{sale.storeName}</td>
                    <td className="muted">{sale.sellerName}</td>
                    <td className="muted">{sale.familyName}</td>
                    <td className="muted">
                      {PAYMENT_LABEL[sale.paymentMethod] ?? sale.paymentMethod}
                    </td>
                    <td>{fmtEur(Number(sale.total))}</td>
                    <td className="muted">{hour.format(new Date(sale.createdAt))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr data-testid="sales-totals">
                  <td colSpan={4}>{totals.count} tickets</td>
                  <td colSpan={3}>Total (completadas): {fmtEur(totals.amount)}</td>
                </tr>
              </tfoot>
            </table>

            {hasMore ? (
              <div ref={sentinelRef} className="sales-sentinel" data-testid="sales-sentinel">
                Cargando más…
              </div>
            ) : (
              <p className="sales-end muted" data-testid="sales-end">
                Mostrando {shown.length} de {filtered.length} tickets
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
