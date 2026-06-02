import { useEffect, useMemo, useRef, useState } from 'react';

import { DEMO_FAMILIES, DEMO_SALES, type DemoSaleRow, SALE_SELLERS } from './demo/demoData.js';
import { fmtEur } from './lib/format.js';

const hour = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });
const PAYMENT_LABEL: Record<string, string> = { CASH: 'Efectivo', CARD: 'Tarjeta' };
const PAGE = 20; // tamaño de bloque del scroll infinito

interface Filters {
  storeId: string;
  sellerId: string;
  familyId: string;
}
const NO_FILTERS: Filters = { storeId: '', sellerId: '', familyId: '' };

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

  // Conjunto filtrado completo (sin paginar): por tienda, vendedor y familia.
  const filtered = useMemo(
    () =>
      DEMO_SALES.filter(
        (s) =>
          (!filters.storeId || s.storeId === filters.storeId) &&
          (!filters.sellerId || s.sellerId === filters.sellerId) &&
          (!filters.familyId || s.familyId === filters.familyId),
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
    if (!filters.storeId && !filters.sellerId && !filters.familyId) return;
    const name =
      [
        STORE_OPTIONS.find(([id]) => id === filters.storeId)?.[1],
        SALE_SELLERS.find((s) => s.id === filters.sellerId)?.name,
        DEMO_FAMILIES.find((f) => f.id === filters.familyId)?.name,
      ]
        .filter(Boolean)
        .join(' · ') || 'Todas';
    if (views.some((v) => v.name === name)) return;
    persistViews([...views, { name, ...filters }]);
  };
  const removeView = (name: string): void => persistViews(views.filter((v) => v.name !== name));

  const hasFilters = Boolean(filters.storeId || filters.sellerId || filters.familyId);

  return (
    <section className="catalog">
      <header className="catalog-head">
        <div>
          <h2>Ventas</h2>
          <p className="catalog-sub">Historial de tickets · scroll infinito</p>
        </div>
        <div className="catalog-actions">
          <button onClick={() => exportCsv(filtered)} data-testid="sales-export-csv">
            Exportar CSV
          </button>
        </div>
      </header>

      <div className="sales-filters">
        <select
          className="catalog-search"
          value={filters.storeId}
          onChange={(e) => setFilter({ storeId: e.target.value })}
          data-testid="sales-store"
        >
          <option value="">Todas las tiendas</option>
          {STORE_OPTIONS.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <select
          className="catalog-search"
          value={filters.sellerId}
          onChange={(e) => setFilter({ sellerId: e.target.value })}
          data-testid="sales-seller"
        >
          <option value="">Todos los vendedores</option>
          {SALE_SELLERS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          className="catalog-search"
          value={filters.familyId}
          onChange={(e) => setFilter({ familyId: e.target.value })}
          data-testid="sales-family"
        >
          <option value="">Todas las familias</option>
          {DEMO_FAMILIES.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        {hasFilters && (
          <button
            className="link-btn"
            onClick={() => setFilters(NO_FILTERS)}
            data-testid="sales-clear"
          >
            Limpiar
          </button>
        )}
        <button className="link-btn" onClick={saveView} data-testid="sales-save-view">
          Guardar vista
        </button>
      </div>

      {views.length > 0 && (
        <div className="sales-views" data-testid="sales-views">
          {views.map((v) => (
            <span key={v.name} className="sales-view-chip">
              <button
                className="sales-view-apply"
                onClick={() =>
                  setFilters({ storeId: v.storeId, sellerId: v.sellerId, familyId: v.familyId })
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
                  <td>
                    {sale.ticketNumber}
                    {sale.status === 'VOIDED' && <span className="sale-tag-voided">Anulada</span>}
                  </td>
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
    </section>
  );
}
