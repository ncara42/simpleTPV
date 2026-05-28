import { ApiError, type Return, type Sale } from '@simpletpv/auth';
import { useState } from 'react';

import { createReturn, listReturns } from './lib/returns.js';
import { findSaleByTicket } from './lib/sales.js';

// Suma lo ya devuelto por saleLineId a partir de las devoluciones previas.
function returnedBySaleLine(returns: Return[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of returns) {
    for (const l of r.lines) {
      map.set(l.saleLineId, (map.get(l.saleLineId) ?? 0) + Number(l.qty));
    }
  }
  return map;
}

export function ReturnPanel() {
  const [ticketNumber, setTicketNumber] = useState('');
  const [sale, setSale] = useState<Sale | null>(null);
  const [returned, setReturned] = useState<Map<string, number>>(new Map());
  // qty a devolver por saleLineId (0 = no devolver esa línea).
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  // Total devuelto tras confirmar (pantalla de confirmación).
  const [done, setDone] = useState<{ total: number } | null>(null);

  // Disponible por línea = qty vendida − ya devuelta.
  function available(line: Sale['lines'][number]): number {
    return Math.max(0, Number(line.qty) - (returned.get(line.id) ?? 0));
  }

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

  // Líneas seleccionadas para devolver (qty > 0).
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
      <div className="return-panel" data-testid="return-panel">
        <h2 className="cart-title">Devolución registrada</h2>
        <p className="return-done" data-testid="return-done">
          Total devuelto: <strong>{done.total.toFixed(2)} €</strong>
        </p>
        <button className="cart-create" onClick={reset} data-testid="return-new">
          Nueva devolución
        </button>
      </div>
    );
  }

  return (
    <div className="return-panel" data-testid="return-panel">
      <h2 className="cart-title">Devolución contra ticket</h2>

      <div className="return-search">
        <input
          className="sale-search"
          placeholder="Nº de ticket (p.ej. T01-000001)"
          value={ticketNumber}
          onChange={(e) => setTicketNumber(e.target.value)}
          data-testid="return-ticket-input"
        />
        <button
          className="cart-create"
          onClick={onSearch}
          disabled={searching || ticketNumber.trim().length === 0}
          data-testid="return-search"
        >
          {searching ? 'Buscando…' : 'Buscar'}
        </button>
      </div>
      {searchError && (
        <p className="cart-msg" data-testid="return-search-error">
          {searchError}
        </p>
      )}

      {sale && (
        <>
          <ul className="return-lines" data-testid="return-lines">
            {sale.lines.map((l) => {
              const max = available(l);
              const alreadyReturned = returned.get(l.id) ?? 0;
              return (
                <li key={l.id} className="return-line" data-testid="return-line">
                  <span className="return-line-name">{l.name}</span>
                  <span className="return-line-info">
                    Vendido: {Number(l.qty)} · Devuelto: {alreadyReturned} · Disponible: {max}
                  </span>
                  <span className="return-line-controls">
                    <button
                      onClick={() => setQty(l.id, (qtys[l.id] ?? 0) - 1, max)}
                      disabled={max === 0}
                      aria-label="Quitar uno"
                    >
                      −
                    </button>
                    <span className="return-line-qty" data-testid="return-line-qty">
                      {qtys[l.id] ?? 0}
                    </span>
                    <button
                      onClick={() => setQty(l.id, (qtys[l.id] ?? 0) + 1, max)}
                      disabled={max === 0 || (qtys[l.id] ?? 0) >= max}
                      aria-label="Añadir uno"
                    >
                      +
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>

          <label className="return-reason-field">
            Motivo (obligatorio)
            <textarea
              className="return-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Motivo de la devolución"
              data-testid="return-reason"
            />
          </label>

          <button
            className="cart-create"
            onClick={onConfirm}
            disabled={!canConfirm}
            data-testid="return-confirm"
          >
            {busy ? 'Registrando…' : 'Confirmar devolución'}
          </button>
          {error && (
            <p className="cart-msg" data-testid="return-error">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
