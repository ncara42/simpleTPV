import { ApiError, type Sale, type SaleTicket } from '@simpletpv/auth';
import { Button, Select } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Check, Download, Printer, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';

import { usePageHeader } from './lib/pageHeader.js';
import { downloadReceiptHtml, printReceiptHtml } from './lib/receipt.js';
import { createReturn, listReturns } from './lib/returns.js';
import { findSaleByTicket, getReceiptHtml, getTicket, listSales } from './lib/sales.js';

export function TicketsPanel({ storeId }: { storeId: string | null }) {
  usePageHeader('Tickets emitidos', 'Histórico de ventas de la tienda activa');
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
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
  const visible = useMemo(
    () =>
      items.filter(
        (s) =>
          (!statusFilter || s.status === statusFilter) &&
          (!methodFilter || s.paymentMethod === methodFilter),
      ),
    [items, statusFilter, methodFilter],
  );

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
      const returnedByLine = new Map<string, number>();
      for (const r of previous) {
        for (const l of r.lines) {
          returnedByLine.set(l.saleLineId, (returnedByLine.get(l.saleLineId) ?? 0) + Number(l.qty));
        }
      }
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
        <div className="table-panel">
          <div className="users-toolbar">
            <div className="sales-filters">
              <span className="search-field">
                <input
                  className="catalog-search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Ticket, importe, vendedor o producto…"
                  data-testid="tickets-search"
                />
              </span>
              <Select
                className="catalog-search"
                value={statusFilter}
                onChange={setStatusFilter}
                ariaLabel="Filtrar por estado"
                data-testid="tickets-status-filter"
                options={[
                  { value: '', label: 'Todos los estados' },
                  { value: 'COMPLETED', label: 'Completados' },
                  { value: 'VOIDED', label: 'Anulados' },
                ]}
              />
              <Select
                className="catalog-search"
                value={methodFilter}
                onChange={setMethodFilter}
                ariaLabel="Filtrar por método"
                data-testid="tickets-method-filter"
                options={[
                  { value: '', label: 'Todos los métodos' },
                  { value: 'CASH', label: 'Efectivo' },
                  { value: 'CARD', label: 'Tarjeta' },
                ]}
              />
            </div>
          </div>
          {sales.isLoading ? (
            <p className="catalog-empty">Cargando…</p>
          ) : items.length === 0 ? (
            <p className="catalog-empty">Sin tickets.</p>
          ) : visible.length === 0 ? (
            <p className="catalog-empty">Sin tickets que coincidan con el filtro.</p>
          ) : (
            <table className="catalog-table" data-testid="tickets-list">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Fecha</th>
                  <th>Método</th>
                  <th>Estado</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr
                    key={item.id}
                    data-testid="ticket-row"
                    onClick={() => {
                      setSelectedId(item.id);
                      setReturning(false);
                    }}
                  >
                    <td>
                      <strong>{item.ticketNumber}</strong>
                    </td>
                    <td className="muted">{new Date(item.createdAt).toLocaleString()}</td>
                    <td>{methodLabel(item.paymentMethod)}</td>
                    <td>{statusBadge(item.status)}</td>
                    <td className="tabular-nums">{Number(item.total).toFixed(2)} €</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function methodLabel(method: string): string {
  if (method === 'CASH') return 'Efectivo';
  if (method === 'CARD') return 'Tarjeta';
  return method;
}

function statusBadge(status: string) {
  const voided = status === 'VOIDED';
  return (
    <span className={`order-state ${voided ? 'voided' : 'received'}`} data-testid="ticket-status">
      <span className="order-state__icon">
        {voided ? (
          <Ban size={13} strokeWidth={2.5} aria-hidden="true" />
        ) : (
          <Check size={13} strokeWidth={3} aria-hidden="true" />
        )}
      </span>
      {voided ? 'Anulado' : 'Completado'}
    </span>
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
