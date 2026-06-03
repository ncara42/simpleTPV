import { ApiError, type Sale, type SaleTicket } from '@simpletpv/auth';
import { Button } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Printer, RotateCcw, Search } from 'lucide-react';
import { useState } from 'react';

import { createReturn, listReturns } from './lib/returns.js';
import { findSaleByTicket, getTicket, listSales } from './lib/sales.js';

export function TicketsPanel({ storeId }: { storeId: string | null }) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
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

  function setQty(lineId: string, qty: number) {
    setQtys((prev) => ({ ...prev, [lineId]: Math.max(0, qty) }));
  }

  return (
    <div className="tickets-view" data-testid="tickets-view">
      <div className="tickets-head">
        <div>
          <h2>Tickets emitidos</h2>
          <p>Histórico de ventas de la tienda activa</p>
        </div>
        <div className="tickets-search">
          <Search size={16} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ticket, importe, vendedor o producto..."
            data-testid="tickets-search"
          />
        </div>
      </div>

      <div className="tickets-layout">
        <div className="tickets-list" data-testid="tickets-list">
          {sales.isLoading ? (
            <p className="sale-empty">Cargando...</p>
          ) : sales.data?.items.length === 0 ? (
            <p className="sale-empty">Sin tickets.</p>
          ) : (
            sales.data?.items.map((item) => (
              <button
                key={item.id}
                className={`ticket-row${selectedId === item.id ? ' active' : ''}`}
                onClick={() => {
                  setSelectedId(item.id);
                  setReturning(false);
                }}
                data-testid="ticket-row"
              >
                <span>
                  <strong>{item.ticketNumber}</strong>
                  <small>{new Date(item.createdAt).toLocaleString()}</small>
                </span>
                <span className="tabular-nums">{Number(item.total).toFixed(2)} €</span>
              </button>
            ))
          )}
        </div>

        <div className="ticket-detail" data-testid="ticket-detail">
          {!selectedId ? (
            <p className="sale-empty">Selecciona un ticket.</p>
          ) : ticket.isLoading ? (
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
              onPrint={() => window.print()}
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
      </div>
    </div>
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
  onPrint,
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
  onPrint: () => void;
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
        <Button variant="secondary" size="sm" onClick={onPrint} data-testid="ticket-reprint">
          <Printer size={14} />
          Reimprimir
        </Button>
        {!returning && sale?.status !== 'VOIDED' && (
          <Button size="sm" onClick={onStartReturn} data-testid="ticket-return-start">
            <RotateCcw size={14} />
            Gestionar devolución
          </Button>
        )}
      </div>
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
