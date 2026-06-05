import { Select } from '@simpletpv/ui';
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

// Toggle tipo píldora, calcado del methodClass del modal de cobrar (PaymentModal).
const segClass = (active: boolean) =>
  [
    'h-12 rounded-full border text-sm font-semibold transition-colors active:translate-y-[0.5px]',
    active
      ? 'border-[var(--ui-brand)] bg-[var(--ui-brand-soft)] text-[var(--ui-brand-ink)]'
      : 'border-[var(--ui-border)] bg-[var(--ui-surface)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-subtle)]',
  ].join(' ');

const numberInputClass =
  'h-12 w-full rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 text-lg tabular-nums text-[var(--ui-text)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--ui-text-muted)] focus:border-[var(--ui-brand)] focus:shadow-[var(--ui-focus)] [appearance:textfield] [&::-webkit-outer-spin-button]:[appearance:none] [&::-webkit-inner-spin-button]:[appearance:none]';

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
            className={segClass(kind === k)}
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
        className="w-full max-w-sm overflow-hidden rounded-[var(--ui-radius-xl)] border border-[var(--ui-border)] bg-[var(--ui-surface)] shadow-[0_6px_22px_-10px_rgba(0,0,0,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[var(--ui-border)] px-5 py-4">
          <h2 className="text-base font-semibold text-[var(--ui-text)]">Descuento</h2>
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
                className={segClass(mode === m)}
              >
                {m === 'line' ? 'Por línea' : 'Por ticket'}
              </button>
            ))}
          </div>

          {mode === 'line' ? (
            <div className="space-y-3">
              <Select
                value={productId}
                onChange={setProductId}
                options={items.map((i) => ({
                  value: i.productId,
                  label: i.name,
                }))}
                ariaLabel="Línea"
                data-testid="disc-item"
                className="w-full"
              />
              {kindToggle(lineKind, setLineKind, 'disc-line')}
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={lineKind === 'pct' ? 100 : undefined}
                step={lineKind === 'pct' ? '1' : '0.01'}
                value={lineValue}
                onChange={(e) => setLineValue(e.target.value)}
                data-testid="disc-line-value"
                placeholder="Descuento"
                aria-label="Descuento"
                autoFocus
                className={numberInputClass}
              />
            </div>
          ) : (
            <div className="space-y-3">
              {kindToggle(ticketKind, setTicketKind, 'disc-ticket')}
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={ticketKind === 'pct' ? 100 : undefined}
                step={ticketKind === 'pct' ? '1' : '0.01'}
                value={ticketValue}
                onChange={(e) => setTicketValue(e.target.value)}
                data-testid="disc-ticket-value"
                placeholder="Descuento"
                aria-label="Descuento"
                autoFocus
                className={numberInputClass}
              />
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-[var(--ui-border)] p-5">
          <button
            type="button"
            onClick={onCancel}
            data-testid="disc-cancel"
            className="h-12 flex-1 rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface)] text-sm font-medium text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-subtle)] active:translate-y-[0.5px] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleApply}
            data-testid="disc-apply"
            className="h-12 flex-1 rounded-full bg-[var(--ui-primary)] text-sm font-semibold text-[var(--ui-primary-fg)] transition-colors hover:bg-[var(--ui-primary-hover)] active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}
