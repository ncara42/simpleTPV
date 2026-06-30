import { ApiError, type Sale, type SaleSummary, type SaleTicket } from '@simpletpv/auth';
import { Button } from '@simpletpv/ui';
import { usePageHeader } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Check, ChevronDown, Download, Printer, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';

import { eur } from './lib/format.js';
import { downloadReceiptHtml, printReceiptHtml } from './lib/receipt.js';
import { createReturn, listReturns } from './lib/returns.js';
import { findSaleByTicket, getReceiptHtml, getTicket, listSales } from './lib/sales.js';
import { returnedBySaleLine } from './return/aggregate.js';

// Vistas (selección única) y métodos (multi-selección) del carril de facetas, igual
// que las "Vistas guardadas" + facetas del Catálogo del backoffice.
type TicketView = 'all' | 'completed' | 'voided';
const VIEWS: ReadonlyArray<{ key: TicketView; label: string }> = [
  { key: 'all', label: 'Todos los tickets' },
  { key: 'completed', label: 'Completados' },
  { key: 'voided', label: 'Anulados' },
];
const METHOD_ORDER: readonly string[] = ['CASH', 'CARD', 'DIRECT_DEBIT', 'TRANSFER', 'BIZUM'];

// Grupo de tickets de un mismo día (cabecera plegable: fecha · nº · total).
interface DayGroup {
  key: string;
  label: string;
  ts: number;
  rows: SaleSummary[];
  total: number;
}

export function TicketsPanel({ storeId }: { storeId: string | null }) {
  usePageHeader('Tickets emitidos', 'Histórico de ventas de la tienda activa');
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [view, setView] = useState<TicketView>('all');
  const [methods, setMethods] = useState<ReadonlySet<string>>(new Set());
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [returning, setReturning] = useState(false);
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const sales = useQuery({
    queryKey: ['tickets', storeId, q],
    queryFn: () => listSales({ ...(storeId ? { storeId } : {}), ...(q.trim() ? { q } : {}) }),
    enabled: storeId !== null,
  });

  const items = useMemo(() => sales.data?.items ?? [], [sales.data]);

  // Recuentos de faceta (sobre el conjunto completo, antes de filtrar) como en el Catálogo.
  const viewCounts = useMemo(
    () => ({
      all: items.length,
      completed: items.filter((s) => s.status === 'COMPLETED').length,
      voided: items.filter((s) => s.status === 'VOIDED').length,
    }),
    [items],
  );
  const methodCounts = useMemo(() => {
    const counts: Record<string, number> = Object.fromEntries(METHOD_ORDER.map((m) => [m, 0]));
    for (const s of items) {
      const current = counts[s.paymentMethod];
      if (current !== undefined) counts[s.paymentMethod] = current + 1;
    }
    return counts;
  }, [items]);

  const visible = useMemo(
    () =>
      items.filter(
        (s) =>
          (view === 'all' ||
            (view === 'completed' && s.status === 'COMPLETED') ||
            (view === 'voided' && s.status === 'VOIDED')) &&
          (methods.size === 0 || methods.has(s.paymentMethod)),
      ),
    [items, view, methods],
  );

  // Agrupa los tickets por día (día más reciente primero; dentro, hora descendente).
  const groups = useMemo<DayGroup[]>(() => {
    const map = new Map<string, DayGroup>();
    for (const item of visible) {
      const d = new Date(item.createdAt);
      const key = d.toDateString();
      let g = map.get(key);
      if (!g) {
        const raw = d.toLocaleDateString('es-ES', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
        g = {
          key,
          label: raw.charAt(0).toUpperCase() + raw.slice(1),
          ts: d.getTime(),
          rows: [],
          total: 0,
        };
        map.set(key, g);
      }
      g.rows.push(item);
      g.total += Number(item.total);
    }
    const arr = [...map.values()].sort((a, b) => b.ts - a.ts);
    for (const g of arr) {
      g.rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return arr;
  }, [visible]);

  const toggleMethod = (m: string): void =>
    setMethods((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  const toggleGroup = (key: string): void =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const ticket = useQuery({
    queryKey: ['ticket-detail', selectedId],
    queryFn: () => getTicket(selectedId as string),
    enabled: selectedId !== null,
  });

  const selectedSummary = sales.data?.items.find((s) => s.id === selectedId);
  const saleQuery = useQuery({
    queryKey: ['ticket-sale', selectedSummary?.ticketNumber],
    queryFn: () => findSaleByTicket(selectedSummary!.ticketNumber),
    enabled: selectedSummary !== undefined,
  });
  const sale = saleQuery.data;

  const returnMutation = useMutation({
    mutationFn: async () => {
      if (!sale) throw new Error('Ticket no seleccionado');
      const previous = await listReturns(sale.id);
      const returnedByLine = returnedBySaleLine(previous);
      const lines = sale.lines
        .map((line) => ({
          saleLineId: line.id,
          qty: Math.min(qtys[line.id] ?? 0, Number(line.qty) - (returnedByLine.get(line.id) ?? 0)),
        }))
        .filter((line) => line.qty > 0);
      if (lines.length === 0) throw new Error('Selecciona al menos una línea');
      return createReturn({ saleId: sale.id, reason: reason.trim(), lines });
    },
    onSuccess: () => {
      setReturning(false);
      setQtys({});
      setReason('');
      setError(null);
      void qc.invalidateQueries({ queryKey: ['tickets'] });
    },
    onError: (e) => {
      setError(
        e instanceof ApiError ? (e.body ?? 'No se pudo registrar la devolución') : String(e),
      );
    },
  });

  // Documento fiscal (#123): genera la factura imprimible/descargable de la venta
  // seleccionada. En real descarga el HTML del servidor; en demo lo replica.
  const [docError, setDocError] = useState<string | null>(null);
  const docMutation = useMutation({
    mutationFn: async (mode: 'print' | 'download') => {
      if (!selectedId) throw new Error('Ticket no seleccionado');
      const html = await getReceiptHtml(selectedId);
      if (mode === 'print') {
        printReceiptHtml(html);
      } else {
        downloadReceiptHtml(html, `factura-${ticket.data?.ticketNumber ?? selectedId}.html`);
      }
    },
    onSuccess: () => setDocError(null),
    onError: (e) => {
      setDocError(e instanceof ApiError ? e.body || 'No se pudo generar la factura' : String(e));
    },
  });

  function setQty(lineId: string, qty: number) {
    setQtys((prev) => ({ ...prev, [lineId]: Math.max(0, qty) }));
  }

  function goBack() {
    setSelectedId(null);
    setReturning(false);
  }

  return (
    <div className="tickets-view" data-testid="tickets-view">
      {selectedId ? (
        <div className="ticket-detail" data-testid="ticket-detail">
          <div className="ticket-detail-head">
            <button className="link-btn" onClick={goBack} data-testid="ticket-back">
              ← Volver
            </button>
          </div>
          {ticket.isLoading ? (
            <p className="sale-empty">Cargando ticket...</p>
          ) : ticket.data ? (
            <TicketDetail
              ticket={ticket.data}
              returning={returning}
              {...(sale ? { sale } : {})}
              qtys={qtys}
              reason={reason}
              busy={returnMutation.isPending}
              error={error}
              docBusy={docMutation.isPending}
              docError={docError}
              onPrint={() => docMutation.mutate('print')}
              onDownload={() => docMutation.mutate('download')}
              onStartReturn={() => setReturning(true)}
              onCancelReturn={() => setReturning(false)}
              onReason={setReason}
              onQty={setQty}
              onConfirmReturn={() => returnMutation.mutate()}
            />
          ) : (
            <p className="sale-empty">No se pudo cargar el detalle.</p>
          )}
        </div>
      ) : (
        <div className="tickets-faceted">
          <div className="tickets-card">
            <div className="cat-layout">
              <aside
                className="cat-rail"
                aria-label="Filtros de tickets"
                data-testid="tickets-facets"
              >
                <span className="search-field cat-rail-search">
                  <input
                    className="catalog-search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Buscar ticket…"
                    data-testid="tickets-search"
                  />
                </span>

                <section className="cat-facet">
                  <h3 className="cat-facet-title">Vistas</h3>
                  {VIEWS.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      className={`cat-view${view === v.key ? ' is-active' : ''}`}
                      aria-pressed={view === v.key}
                      onClick={() => setView(v.key)}
                      data-testid={`tickets-view-${v.key}`}
                    >
                      <span className="cat-view-label">{v.label}</span>
                      <span className="cat-view-count">{viewCounts[v.key]}</span>
                    </button>
                  ))}
                </section>

                <section className="cat-facet">
                  <h3 className="cat-facet-title">Método de pago</h3>
                  {METHOD_ORDER.map((m) => (
                    <FacetOption
                      key={m}
                      checked={methods.has(m)}
                      onToggle={() => toggleMethod(m)}
                      label={methodLabel(m)}
                      count={methodCounts[m] ?? 0}
                    />
                  ))}
                </section>
              </aside>

              <div className="cat-main" data-testid="tickets-list">
                <table className="cat-table">
                  <colgroup>
                    <col />
                    <col className="cat-col-num" />
                    <col className="cat-col-mid" />
                    <col className="cat-col-mid" />
                    <col className="cat-col-num" />
                  </colgroup>
                  <thead className="cat-thead">
                    <tr>
                      <th className="cat-th cat-th-name">Ticket</th>
                      <th className="cat-th">Hora</th>
                      <th className="cat-th">Método</th>
                      <th className="cat-th">Estado</th>
                      <th className="cat-th cat-th-num">Total</th>
                    </tr>
                  </thead>
                  {groups.map((group) => {
                    const isCollapsed = collapsed.has(group.key);
                    return (
                      <tbody key={group.key} className="cat-group">
                        <tr className="cat-group-head" onClick={() => toggleGroup(group.key)}>
                          <td className="cat-group-cell" colSpan={5}>
                            <div className="cat-group-inner">
                              <ChevronDown
                                size={15}
                                className={`cat-group-caret${isCollapsed ? ' is-collapsed' : ''}`}
                                aria-hidden="true"
                              />
                              <span className="cat-group-name">{group.label}</span>
                              <span className="cat-group-count">
                                {group.rows.length} {group.rows.length === 1 ? 'ticket' : 'tickets'}
                              </span>
                              <span className="cat-group-units">{eur(group.total)} €</span>
                            </div>
                          </td>
                        </tr>
                        {!isCollapsed &&
                          group.rows.map((item) => (
                            <tr
                              key={item.id}
                              className="cat-row"
                              data-testid="ticket-row"
                              onClick={() => {
                                setSelectedId(item.id);
                                setReturning(false);
                              }}
                            >
                              <td className="cat-cell-name">{item.ticketNumber}</td>
                              <td className="cat-cell-mid">
                                {new Date(item.createdAt).toLocaleTimeString('es-ES', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </td>
                              <td className="cat-cell-mid">{methodLabel(item.paymentMethod)}</td>
                              <td className="cat-cell-state">{statusBadge(item.status)}</td>
                              <td className="cat-cell-num">{eur(Number(item.total))} €</td>
                            </tr>
                          ))}
                      </tbody>
                    );
                  })}
                </table>
                {groups.length === 0 && (
                  <div className="cat-empty" data-testid="tickets-empty">
                    {sales.isLoading
                      ? 'Cargando…'
                      : items.length === 0
                        ? 'Sin tickets.'
                        : 'Sin tickets que coincidan con el filtro.'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  DIRECT_DEBIT: 'Débito directo',
  TRANSFER: 'Transferencia',
  BIZUM: 'Bizum',
};

function methodLabel(method: string): string {
  return METHOD_LABELS[method] ?? method;
}

function statusBadge(status: string) {
  const voided = status === 'VOIDED';
  return (
    <span
      className={`cat-state-badge ${voided ? 'cat-state-void' : 'cat-state-ok'}`}
      data-testid="ticket-status"
    >
      {voided ? (
        <Ban size={12} strokeWidth={2.5} aria-hidden="true" />
      ) : (
        <Check size={12} strokeWidth={3} aria-hidden="true" />
      )}
      {voided ? 'Anulado' : 'Completado'}
    </span>
  );
}

// Opción de faceta (multi-selección) del carril, idéntica a la del Catálogo.
function FacetOption({
  checked,
  onToggle,
  label,
  count,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  count: number;
}) {
  return (
    <label className={`cat-facet-opt${checked ? ' is-checked' : ''}`}>
      <input
        type="checkbox"
        className="cat-facet-input"
        checked={checked}
        onChange={onToggle}
        data-testid={`tickets-method-${label}`}
      />
      <span className="cat-check" aria-hidden="true" />
      <span className="cat-facet-label">{label}</span>
      <span className="cat-facet-count">{count}</span>
    </label>
  );
}

function TicketDetail({
  ticket,
  returning,
  sale,
  qtys,
  reason,
  busy,
  error,
  docBusy,
  docError,
  onPrint,
  onDownload,
  onStartReturn,
  onCancelReturn,
  onReason,
  onQty,
  onConfirmReturn,
}: {
  ticket: SaleTicket;
  returning: boolean;
  sale?: Sale;
  qtys: Record<string, number>;
  reason: string;
  busy: boolean;
  error: string | null;
  docBusy: boolean;
  docError: string | null;
  onPrint: () => void;
  onDownload: () => void;
  onStartReturn: () => void;
  onCancelReturn: () => void;
  onReason: (v: string) => void;
  onQty: (lineId: string, qty: number) => void;
  onConfirmReturn: () => void;
}) {
  return (
    <div className="ticket-detail-card">
      <div className="ticket-detail-top">
        <div>
          <h3>{ticket.ticketNumber}</h3>
          <p>{ticket.store.name}</p>
        </div>
        <strong className="tabular-nums">{Number(ticket.total).toFixed(2)} €</strong>
      </div>
      <ul className="ticket-detail-lines">
        {ticket.lines.map((line, idx) => (
          <li key={`${line.name}-${idx}`}>
            <span>{line.name}</span>
            <span className="tabular-nums">
              {Number(line.qty)} x {Number(line.unitPrice).toFixed(2)} €
            </span>
          </li>
        ))}
      </ul>
      <div className="ticket-actions">
        <Button
          variant="secondary"
          size="sm"
          onClick={onPrint}
          disabled={docBusy}
          data-testid="ticket-print"
        >
          <Printer size={14} />
          {docBusy ? 'Generando…' : 'Imprimir factura'}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onDownload}
          disabled={docBusy}
          data-testid="ticket-download"
        >
          <Download size={14} />
          Descargar
        </Button>
        {!returning && sale?.status !== 'VOIDED' && (
          <Button size="sm" onClick={onStartReturn} data-testid="ticket-return-start">
            <RotateCcw size={14} />
            Gestionar devolución
          </Button>
        )}
      </div>
      {docError && (
        <p className="cash-error" data-testid="ticket-doc-error">
          {docError}
        </p>
      )}
      {returning && sale && (
        <div className="ticket-return" data-testid="ticket-return">
          <h4>Devolver líneas</h4>
          {sale.lines.map((line) => (
            <div className="ticket-return-line" key={line.id}>
              <span>{line.name}</span>
              <input
                type="number"
                min={0}
                max={Number(line.qty)}
                value={qtys[line.id] ?? 0}
                onChange={(e) => onQty(line.id, Number(e.target.value))}
                data-testid="ticket-return-qty"
              />
            </div>
          ))}
          <textarea
            value={reason}
            onChange={(e) => onReason(e.target.value)}
            placeholder="Motivo de devolución"
            data-testid="ticket-return-reason"
          />
          {error && <p className="cash-error">{error}</p>}
          <div className="ticket-actions">
            <Button variant="secondary" size="sm" onClick={onCancelReturn}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={busy || reason.trim().length === 0}
              onClick={onConfirmReturn}
              data-testid="ticket-return-confirm"
            >
              {busy ? 'Registrando...' : 'Confirmar devolución'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
