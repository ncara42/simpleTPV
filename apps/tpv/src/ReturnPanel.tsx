import { ApiError, type Sale } from '@simpletpv/auth';
import { Button } from '@simpletpv/ui';
import { useState } from 'react';

import { BlindReturnPanel } from './BlindReturnPanel.js';
import { createReturn, listReturns } from './lib/returns.js';
import { findSaleByTicket } from './lib/sales.js';
import { returnedBySaleLine } from './return/aggregate.js';
import { ReturnLines } from './return/ReturnLines.js';

export function ReturnPanel() {
  const [ticketNumber, setTicketNumber] = useState('');
  const [sale, setSale] = useState<Sale | null>(null);
  const [returned, setReturned] = useState<Map<string, number>>(new Map());
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ total: number } | null>(null);

  async function onSearch() {
    const tn = ticketNumber.trim();
    if (!tn) return;
    setSearching(true);
    setSearchError(null);
    setError(null);
    setSale(null);
    setDone(null);
    try {
      const found = await findSaleByTicket(tn);
      const prev = await listReturns(found.id);
      setSale(found);
      setReturned(returnedBySaleLine(prev));
      setQtys({});
      setReason('');
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setSearchError('No se ha encontrado ningún ticket con ese número.');
      } else {
        setSearchError('Error al buscar el ticket. Inténtalo de nuevo.');
      }
    } finally {
      setSearching(false);
    }
  }

  function setQty(saleLineId: string, qty: number, max: number) {
    const clamped = Math.max(0, Math.min(qty, max));
    setQtys((prev) => ({ ...prev, [saleLineId]: clamped }));
  }

  const selected = sale
    ? sale.lines.map((l) => ({ saleLineId: l.id, qty: qtys[l.id] ?? 0 })).filter((l) => l.qty > 0)
    : [];

  const reasonEmpty = reason.trim().length === 0;
  const canConfirm = !!sale && selected.length > 0 && !reasonEmpty && !busy;

  async function onConfirm() {
    if (!sale || !canConfirm) return;
    setBusy(true);
    setError(null);
    try {
      const result = await createReturn({
        saleId: sale.id,
        reason: reason.trim(),
        lines: selected,
      });
      setDone({ total: Number(result.total) });
    } catch (e) {
      if (e instanceof ApiError && (e.status === 400 || e.status === 403)) {
        setError(e.body ?? 'No se pudo registrar la devolución.');
      } else {
        setError('Error al registrar la devolución. Inténtalo de nuevo.');
      }
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setTicketNumber('');
    setSale(null);
    setReturned(new Map());
    setQtys({});
    setReason('');
    setSearchError(null);
    setError(null);
    setDone(null);
  }

  if (done) {
    return (
      <div className="mx-auto max-w-xl space-y-4" data-testid="return-panel">
        <div className="rounded-lg border border-green-200 bg-green-50 p-5">
          <p className="text-sm font-semibold text-green-700">Devolución registrada</p>
          <p
            className="mt-1 text-2xl font-bold tabular-nums text-green-800"
            data-testid="return-done"
          >
            {done.total.toFixed(2)} € devueltos
          </p>
        </div>
        <Button variant="secondary" className="w-full" onClick={reset} data-testid="return-new">
          Nueva devolución
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-4" data-testid="return-panel">
      <h2 className="text-sm font-semibold text-neutral-700">Devolución contra ticket</h2>

      {/* Búsqueda */}
      <div className="flex gap-2">
        <input
          className="h-9 flex-1 rounded-lg border border-[var(--ui-border)] bg-white px-3 text-sm outline-none placeholder:text-neutral-400 focus:border-neutral-400"
          placeholder="Nº de ticket (p.ej. T01-000001)"
          value={ticketNumber}
          onChange={(e) => setTicketNumber(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSearch()}
          data-testid="return-ticket-input"
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={onSearch}
          disabled={searching || ticketNumber.trim().length === 0}
          data-testid="return-search"
        >
          {searching ? 'Buscando…' : 'Buscar'}
        </Button>
      </div>

      {searchError && (
        <p className="text-sm text-red-600" data-testid="return-search-error">
          {searchError}
        </p>
      )}

      {sale && (
        <>
          <ReturnLines lines={sale.lines} qtys={qtys} returned={returned} onSetQty={setQty} />

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-neutral-500">Motivo (obligatorio)</span>
            <textarea
              className="min-h-[4rem] w-full resize-y rounded-lg border border-[var(--ui-border)] bg-white px-3 py-2 text-sm outline-none placeholder:text-neutral-400 focus:border-neutral-400"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Motivo de la devolución…"
              data-testid="return-reason"
            />
          </label>

          <Button
            className="w-full"
            onClick={onConfirm}
            disabled={!canConfirm}
            data-testid="return-confirm"
          >
            {busy ? 'Registrando…' : 'Confirmar devolución'}
          </Button>

          {error && (
            <p className="text-sm text-red-600" data-testid="return-error">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}

// Vista de Devolución calcada al mockup: toggle + buscador + estado vacío.
export function ReturnsView() {
  const [mode, setMode] = useState<'ticket' | 'blind'>('ticket');
  const [query, setQuery] = useState('');

  return (
    <div className="return-view" data-testid="return-view">
      <div className="return-view-head">
        <h2 className="return-view-title">Devolución</h2>
        <p className="return-view-sub">Reintegro con o sin ticket</p>
      </div>

      <div className="return-toggle">
        <button
          className={`return-toggle-btn${mode === 'ticket' ? ' active' : ''}`}
          onClick={() => setMode('ticket')}
          data-testid="return-mode-ticket"
        >
          Con ticket
        </button>
        <button
          className={`return-toggle-btn${mode === 'blind' ? ' active' : ''}`}
          onClick={() => setMode('blind')}
          data-testid="return-mode-blind"
        >
          Sin ticket
        </button>
      </div>

      {mode === 'ticket' ? (
        <>
          <div className="return-view-search">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              className="return-view-input"
              placeholder="Nº de ticket, fecha o producto…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              data-testid="return-ticket-search"
            />
          </div>
          <div className="return-empty" data-testid="return-empty">
            <span className="return-empty-icon" aria-hidden="true">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12a9 9 0 1 1-6.2-8.6" />
                <path d="M21 3v6h-6" />
              </svg>
            </span>
            <p className="return-empty-title">Busca el ticket original</p>
            <p className="return-empty-text">
              Escanea el QR del ticket o introduce su número para empezar la devolución.
            </p>
          </div>
        </>
      ) : (
        <BlindReturnPanel />
      )}
    </div>
  );
}
