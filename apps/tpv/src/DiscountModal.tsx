import { useEffect, useState } from 'react';

import type { CartItem } from './lib/cart.js';

type Mode = 'line' | 'ticket';
type Kind = 'pct' | 'amt';

interface DiscountModalProps {
  items: CartItem[];
  // Valores actuales del descuento de ticket, para precargar al editar.
  ticketDiscountPct: number;
  ticketDiscountAmt: number;
  // Punto de entrada opcional: al pulsar el descuento de una línea concreta el
  // modal abre directamente en esa línea para editarla.
  initialMode?: Mode;
  initialProductId?: string;
  onApplyLine: (productId: string, d: { pct?: number; amt?: number }) => void;
  onApplyTicket: (d: { pct?: number; amt?: number }) => void;
  onCancel: () => void;
}

function parse(v: string): number {
  const n = Number(v.replace(',', '.'));
  return Number.isNaN(n) ? 0 : n;
}

// Deriva el tipo (%/€) y el valor a mostrar del descuento actual de una línea.
function lineFields(item: CartItem | undefined): { kind: Kind; value: string } {
  if (item && item.discountAmt > 0) return { kind: 'amt', value: String(item.discountAmt) };
  if (item && item.discountPct > 0) return { kind: 'pct', value: String(item.discountPct) };
  return { kind: 'pct', value: '' };
}

export function DiscountModal({
  items,
  ticketDiscountPct,
  ticketDiscountAmt,
  initialMode = 'line',
  initialProductId,
  onApplyLine,
  onApplyTicket,
  onCancel,
}: DiscountModalProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [productId, setProductId] = useState<string>(initialProductId ?? items[0]?.productId ?? '');

  const [lineKind, setLineKind] = useState<Kind>('pct');
  const [lineValue, setLineValue] = useState('');

  const ticketInit =
    ticketDiscountAmt > 0
      ? { kind: 'amt' as Kind, value: String(ticketDiscountAmt) }
      : ticketDiscountPct > 0
        ? { kind: 'pct' as Kind, value: String(ticketDiscountPct) }
        : { kind: 'pct' as Kind, value: '' };
  const [ticketKind, setTicketKind] = useState<Kind>(ticketInit.kind);
  const [ticketValue, setTicketValue] = useState(ticketInit.value);

  // Precarga el descuento de la línea seleccionada (y se resincroniza al cambiar
  // de línea) para que el modal edite en vez de empezar siempre vacío.
  useEffect(() => {
    const item = items.find((i) => i.productId === productId);
    const f = lineFields(item);
    setLineKind(f.kind);
    setLineValue(f.value);
  }, [productId, items]);

  function handleApply() {
    if (mode === 'line') {
      if (!productId) return;
      onApplyLine(
        productId,
        lineKind === 'amt' ? { amt: parse(lineValue) } : { pct: parse(lineValue) },
      );
    } else {
      onApplyTicket(
        ticketKind === 'amt' ? { amt: parse(ticketValue) } : { pct: parse(ticketValue) },
      );
    }
  }

  function kindToggle(kind: Kind, set: (k: Kind) => void, testidPrefix: string) {
    return (
      <div className="grid grid-cols-2 gap-2">
        {(['pct', 'amt'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => set(k)}
            data-testid={`${testidPrefix}-${k}`}
            className={[
              'h-9 rounded-lg border text-sm font-medium transition-colors',
              kind === k
                ? 'border-neutral-900 bg-neutral-900 text-white'
                : 'border-[var(--ui-border)] bg-white text-neutral-600 hover:bg-neutral-50',
            ].join(' ')}
          >
            {k === 'pct' ? 'Porcentaje %' : 'Importe €'}
          </button>
        ))}
      </div>
    );
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
              {kindToggle(lineKind, setLineKind, 'disc-line')}
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-neutral-500">
                  {lineKind === 'pct' ? 'Descuento (%)' : 'Descuento (€)'}
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={lineKind === 'pct' ? 100 : undefined}
                  step={lineKind === 'pct' ? '1' : '0.01'}
                  value={lineValue}
                  onChange={(e) => setLineValue(e.target.value)}
                  data-testid="disc-line-value"
                  autoFocus
                  className="h-9 w-full rounded-lg border border-[var(--ui-border)] bg-white px-3 text-sm outline-none focus:border-neutral-400"
                />
              </label>
            </div>
          ) : (
            <div className="space-y-3">
              {kindToggle(ticketKind, setTicketKind, 'disc-ticket')}
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-neutral-500">
                  {ticketKind === 'pct' ? 'Descuento (%)' : 'Descuento (€)'}
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={ticketKind === 'pct' ? 100 : undefined}
                  step={ticketKind === 'pct' ? '1' : '0.01'}
                  value={ticketValue}
                  onChange={(e) => setTicketValue(e.target.value)}
                  data-testid="disc-ticket-value"
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
