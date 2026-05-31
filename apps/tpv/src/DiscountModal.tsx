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
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      data-testid="discount-modal"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-[var(--ui-border)] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[var(--ui-border)] px-5 py-4">
          <h2 className="text-base font-semibold text-neutral-900">Descuento</h2>
        </div>

        <div className="space-y-4 p-5">
          {/* Tipo: por línea o por ticket */}
          <div className="grid grid-cols-2 gap-2">
            {(['line', 'ticket'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                data-testid={m === 'line' ? 'disc-line' : 'disc-ticket'}
                className={[
                  'h-9 rounded-lg border text-sm font-medium transition-colors',
                  mode === m
                    ? 'border-neutral-900 bg-neutral-900 text-white'
                    : 'border-[var(--ui-border)] bg-white text-neutral-600 hover:bg-neutral-50',
                ].join(' ')}
              >
                {m === 'line' ? 'Por línea' : 'Por ticket'}
              </button>
            ))}
          </div>

          {mode === 'line' ? (
            <div className="space-y-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-neutral-500">Línea</span>
                <select
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  data-testid="disc-item"
                  className="h-9 w-full rounded-lg border border-[var(--ui-border)] bg-white px-3 text-sm outline-none focus:border-neutral-400"
                >
                  {items.map((i) => (
                    <option key={i.productId} value={i.productId}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-neutral-500">Descuento (%)</span>
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
                  className="h-9 w-full rounded-lg border border-[var(--ui-border)] bg-white px-3 text-sm outline-none focus:border-neutral-400"
                />
              </label>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {(['pct', 'amt'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setTicketKind(k)}
                    data-testid={k === 'pct' ? 'disc-ticket-pct' : 'disc-ticket-amt'}
                    className={[
                      'h-9 rounded-lg border text-sm font-medium transition-colors',
                      ticketKind === k
                        ? 'border-neutral-900 bg-neutral-900 text-white'
                        : 'border-[var(--ui-border)] bg-white text-neutral-600 hover:bg-neutral-50',
                    ].join(' ')}
                  >
                    {k === 'pct' ? 'Porcentaje %' : 'Importe €'}
                  </button>
                ))}
              </div>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-neutral-500">
                  {ticketKind === 'pct' ? 'Descuento (%)' : 'Descuento (€)'}
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={ticketKind === 'pct' ? '1' : '0.01'}
                  value={ticketValue}
                  onChange={(e) => setTicketValue(e.target.value)}
                  data-testid={ticketKind === 'pct' ? 'disc-pct' : 'disc-amt'}
                  autoFocus
                  className="h-9 w-full rounded-lg border border-[var(--ui-border)] bg-white px-3 text-sm outline-none focus:border-neutral-400"
                />
              </label>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              data-testid="disc-cancel"
              className="h-10 flex-1 rounded-lg border border-[var(--ui-border)] bg-white text-sm font-medium text-neutral-600 hover:bg-neutral-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleApply}
              data-testid="disc-apply"
              className="h-10 flex-1 rounded-lg border border-neutral-900 bg-neutral-900 text-sm font-semibold text-white hover:bg-neutral-800"
            >
              Aplicar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
