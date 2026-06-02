import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { listSales, listStores } from './lib/admin.js';

// Fecha de hoy en formato YYYY-MM-DD (hora local) para el valor por defecto del
// filtro. Coincide con el formato que valida el DTO de la API.
function today(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const hour = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });

const PAYMENT_LABEL: Record<string, string> = { CASH: 'Efectivo', CARD: 'Tarjeta' };

function exportCsv(
  items: Array<{
    ticketNumber: string;
    createdAt: string;
    total: string | number;
    paymentMethod: string;
    status: string;
  }>,
  date: string,
) {
  const header = 'Nº ticket,Hora,Importe (€),Método,Estado';
  const rows = items.map((s) =>
    [
      s.ticketNumber,
      hour.format(new Date(s.createdAt)),
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
  a.download = `ventas_${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function SalesHistoryPage() {
  const [storeId, setStoreId] = useState('');
  const [date, setDate] = useState(today());
  const [page, setPage] = useState(1);

  const { data: stores = [] } = useQuery({ queryKey: ['stores'], queryFn: listStores });

  const { data, isLoading } = useQuery({
    queryKey: ['sales', storeId, date, page],
    queryFn: () =>
      listSales({
        ...(storeId ? { storeId } : {}),
        ...(date ? { date } : {}),
        page,
      }),
    placeholderData: keepPreviousData,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.totalItems / data.pageSize)) : 1;

  return (
    <section className="catalog">
      <header className="catalog-head">
        <div>
          <h2>Ventas</h2>
          <p className="catalog-sub">Historial de tickets · hoy</p>
        </div>
        <div className="catalog-actions">
          <select
            className="catalog-search"
            value={storeId}
            onChange={(e) => {
              setStoreId(e.target.value);
              setPage(1);
            }}
            data-testid="sales-store"
          >
            <option value="">Todas las tiendas</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="catalog-search"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setPage(1);
            }}
            data-testid="sales-date"
          />
          {data && data.items.length > 0 && (
            <button onClick={() => exportCsv(data.items, date)} data-testid="sales-export-csv">
              Exportar CSV
            </button>
          )}
        </div>
      </header>

      {isLoading ? (
        <p className="catalog-empty">Cargando…</p>
      ) : !data || data.items.length === 0 ? (
        <p className="catalog-empty" data-testid="sales-empty">
          Sin ventas para los filtros seleccionados.
        </p>
      ) : (
        <table className="catalog-table" data-testid="sales-table">
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Tienda</th>
              <th>Líneas</th>
              <th>Pago</th>
              <th>Total</th>
              <th>Hora</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((sale) => (
              <tr
                key={sale.id}
                className={sale.status === 'VOIDED' ? 'sale-voided' : undefined}
                data-testid="sales-row"
              >
                <td>
                  {sale.ticketNumber}
                  {sale.status === 'VOIDED' && <span className="sale-tag-voided">Anulada</span>}
                </td>
                <td className="muted">{(sale as { storeName?: string }).storeName ?? '—'}</td>
                <td>{(sale as { lines?: number }).lines ?? '—'}</td>
                <td className="muted">{PAYMENT_LABEL[sale.paymentMethod] ?? sale.paymentMethod}</td>
                <td>{eur.format(Number(sale.total))}</td>
                <td className="muted">{hour.format(new Date(sale.createdAt))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr data-testid="sales-totals">
              <td colSpan={3}>{data.totals.count} tickets</td>
              <td colSpan={3}>Total del día: {eur.format(Number(data.totals.totalAmount))}</td>
            </tr>
          </tfoot>
        </table>
      )}

      <div className="sales-pager" data-testid="sales-pager">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          data-testid="sales-prev"
        >
          Anterior
        </button>
        <span className="muted">
          Página {data?.page ?? page} de {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
          data-testid="sales-next"
        >
          Siguiente
        </button>
      </div>
    </section>
  );
}
