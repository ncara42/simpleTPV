import { useState } from 'react';

import type { CartItem } from './lib/cart.js';

interface DiscountModalProps {
  items: CartItem[];
  onApplyLine: (productId: string, pct: number) => void;
  onApplyTicket: (d: { pct?: number; amt?: number }) => void;
  onCancel: () => void;
}

type Mode = 'line' | 'ticket';
type TicketKind = 'pct' | 'amt';

export function DiscountModal({ items, onApplyLine, onApplyTicket, onCancel }: DiscountModalProps) {
  const [mode, setMode] = useState<Mode>('line');
  const [productId, setProductId] = useState<string>(items[0]?.productId ?? '');
  const [pct, setPct] = useState('');
  const [ticketKind, setTicketKind] = useState<TicketKind>('pct');
  const [ticketValue, setTicketValue] = useState('');

  function parse(v: string): number {
    const n = Number(v.replace(',', '.'));
    return Number.isNaN(n) ? 0 : n;
  }

  function handleApply() {
    if (mode === 'line') {
      if (!productId) return;
      onApplyLine(productId, parse(pct));
    } else if (ticketKind === 'pct') {
      onApplyTicket({ pct: parse(ticketValue) });
    } else {
      onApplyTicket({ amt: parse(ticketValue) });
    }
  }

  return (
    <div className="pay-overlay" role="dialog" aria-modal="true" data-testid="discount-modal">
      <div className="pay-modal">
        <h2 className="pay-title">Descuento</h2>

        <div className="pay-methods">
          <button
            type="button"
            className={`pay-method ${mode === 'line' ? 'active' : ''}`}
            onClick={() => setMode('line')}
            data-testid="disc-line"
          >
            Por línea
          </button>
          <button
            type="button"
            className={`pay-method ${mode === 'ticket' ? 'active' : ''}`}
            onClick={() => setMode('ticket')}
            data-testid="disc-ticket"
          >
            Por ticket
          </button>
        </div>

        {mode === 'line' ? (
          <div className="disc-fields">
            <label className="pay-field">
              Línea
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                data-testid="disc-item"
              >
                {items.map((i) => (
                  <option key={i.productId} value={i.productId}>
                    {i.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="pay-field">
              Descuento (%)
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step="1"
                value={pct}
                onChange={(e) => setPct(e.target.value)}
                data-testid="disc-pct"
                autoFocus
              />
            </label>
          </div>
        ) : (
          <div className="disc-fields">
            <div className="pay-methods">
              <button
                type="button"
                className={`pay-method ${ticketKind === 'pct' ? 'active' : ''}`}
                onClick={() => setTicketKind('pct')}
                data-testid="disc-ticket-pct"
              >
                %
              </button>
              <button
                type="button"
                className={`pay-method ${ticketKind === 'amt' ? 'active' : ''}`}
                onClick={() => setTicketKind('amt')}
                data-testid="disc-ticket-amt"
              >
                Importe
              </button>
            </div>
            {ticketKind === 'pct' ? (
              <label className="pay-field">
                Descuento (%)
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step="1"
                  value={ticketValue}
                  onChange={(e) => setTicketValue(e.target.value)}
                  data-testid="disc-pct"
                  autoFocus
                />
              </label>
            ) : (
              <label className="pay-field">
                Descuento (€)
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={ticketValue}
                  onChange={(e) => setTicketValue(e.target.value)}
                  data-testid="disc-amt"
                  autoFocus
                />
              </label>
            )}
          </div>
        )}

        <div className="pay-actions">
          <button type="button" className="pay-cancel" onClick={onCancel} data-testid="disc-cancel">
            Cancelar
          </button>
          <button
            type="button"
            className="pay-confirm"
            onClick={handleApply}
            data-testid="disc-apply"
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}
