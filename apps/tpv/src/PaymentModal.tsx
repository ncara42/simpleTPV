import { useState } from 'react';

import { eur } from './lib/format';

export interface PaymentData {
  paymentMethod: 'CASH' | 'CARD';
  cashGiven?: number;
  // Factura completa F1: NIF + razón social del destinatario. Van juntos o ninguno
  // (si se omiten, la venta es un ticket = factura simplificada F2).
  customerTaxId?: string;
  customerName?: string;
}

const MAX_TAX_ID = 20;
const MAX_NAME = 120;

interface PaymentModalProps {
  total: number;
  onConfirm: (payment: PaymentData) => void;
  onCancel: () => void;
  busy: boolean;
}

const BILLS = [5, 10, 20, 50, 100, 200];

// Importes sugeridos para el pago en efectivo: los próximos redondeos de 5 y 10
// y los billetes comunes que cubren el total. Deduplicado, ordenado y limitado
// a 3 chips (más el chip "Exacto") para no recargar la card.
function quickAmounts(total: number): number[] {
  const candidates = [
    Math.ceil(total / 5) * 5,
    Math.ceil(total / 10) * 10,
    ...BILLS.filter((bill) => bill >= total),
  ];
  return Array.from(new Set(candidates))
    .filter((amount) => amount > total)
    .sort((a, b) => a - b)
    .slice(0, 3);
}

const methodClass = (active: boolean) =>
  [
    'h-12 rounded-full border text-sm font-semibold transition-colors active:translate-y-[0.5px]',
    active
      ? 'border-[var(--ui-brand)] bg-[var(--ui-brand-soft)] text-[var(--ui-brand-ink)]'
      : 'border-[var(--ui-border)] bg-[var(--ui-surface)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-subtle)]',
  ].join(' ');

const chipClass = (active: boolean) =>
  [
    'h-9 rounded-full border px-1 text-sm font-medium tabular-nums whitespace-nowrap transition-colors active:translate-y-[0.5px]',
    active
      ? 'border-[var(--ui-brand)] bg-[var(--ui-brand-soft)] text-[var(--ui-brand-ink)]'
      : 'border-[var(--ui-border)] bg-[var(--ui-surface)] text-[var(--ui-text)] hover:bg-[var(--ui-surface-subtle)]',
  ].join(' ');

const fieldClass =
  'h-12 w-full rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 text-base text-[var(--ui-text)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--ui-text-muted)] focus:border-[var(--ui-brand)] focus:shadow-[var(--ui-focus)]';

export function PaymentModal({ total, onConfirm, onCancel, busy }: PaymentModalProps) {
  const [method, setMethod] = useState<'CASH' | 'CARD'>('CASH');
  const [given, setGiven] = useState('');
  const [wantsInvoice, setWantsInvoice] = useState(false);
  const [taxId, setTaxId] = useState('');
  const [customerName, setCustomerName] = useState('');

  const givenNum = Number(given.replace(',', '.'));
  const givenValid = given !== '' && !Number.isNaN(givenNum) && givenNum >= total;
  const change = givenValid ? givenNum - total : 0;
  // Factura completa F1: si se pide, NIF y razón social son obligatorios (van
  // juntos o ninguno; así el backend nunca recibe solo uno).
  const taxIdTrim = taxId.trim();
  const nameTrim = customerName.trim();
  const invoiceReady = !wantsInvoice || (taxIdTrim !== '' && nameTrim !== '');
  const canConfirm = !busy && (method === 'CARD' || givenValid) && invoiceReady;

  const quick = quickAmounts(total);
  const isAmount = (amount: number) =>
    given !== '' && !Number.isNaN(givenNum) && Math.abs(givenNum - amount) < 0.005;

  function handleConfirm() {
    if (!canConfirm) return;
    const fiscal =
      wantsInvoice && taxIdTrim !== '' && nameTrim !== ''
        ? { customerTaxId: taxIdTrim, customerName: nameTrim }
        : {};
    if (method === 'CASH') {
      onConfirm({ paymentMethod: 'CASH', cashGiven: givenNum, ...fiscal });
    } else {
      onConfirm({ paymentMethod: 'CARD', ...fiscal });
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      data-testid="payment-modal"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-[var(--ui-radius-xl)] border border-[var(--ui-border)] bg-[var(--ui-surface)] shadow-[0_6px_22px_-10px_rgba(0,0,0,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--ui-border)] px-5 py-4">
          <h2 className="text-base font-semibold text-[var(--ui-text)]">Cobrar</h2>
          <div
            className="text-2xl font-bold tabular-nums tracking-tight text-[var(--ui-text)]"
            data-testid="pay-total"
          >
            {eur(total)} €
          </div>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMethod('CASH')}
              data-testid="pay-cash"
              className={methodClass(method === 'CASH')}
            >
              Efectivo
            </button>
            <button
              type="button"
              onClick={() => setMethod('CARD')}
              data-testid="pay-card"
              className={methodClass(method === 'CARD')}
            >
              Tarjeta
            </button>
          </div>

          {method === 'CASH' && (
            <div className="space-y-3">
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: `repeat(${quick.length + 1}, minmax(0, 1fr))` }}
              >
                <button
                  type="button"
                  onClick={() => setGiven(String(total))}
                  className={chipClass(isAmount(total))}
                >
                  Exacto
                </button>
                {quick.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setGiven(String(amount))}
                    className={chipClass(isAmount(amount))}
                  >
                    {amount} €
                  </button>
                ))}
              </div>

              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={given}
                onChange={(e) => setGiven(e.target.value)}
                data-testid="cash-given"
                placeholder="Entregado"
                aria-label="Entregado"
                autoFocus
                className="h-12 w-full rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 text-lg tabular-nums text-[var(--ui-text)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--ui-text-muted)] focus:border-[var(--ui-brand)] focus:shadow-[var(--ui-focus)] [appearance:textfield] [&::-webkit-outer-spin-button]:[appearance:none] [&::-webkit-inner-spin-button]:[appearance:none]"
              />

              <div className="flex items-center justify-between rounded-full bg-[var(--ui-surface-subtle)] px-5 py-3 text-sm">
                <span className="text-lg font-medium text-[var(--ui-text-muted)]">Cambio</span>
                <span
                  className="text-lg font-bold tabular-nums text-[var(--ui-brand-ink)]"
                  data-testid="cash-change"
                >
                  {eur(change)} €
                </span>
              </div>
            </div>
          )}

          {/* Factura completa F1: NIF + razón social del destinatario (opcional;
              sin esto el cobro emite un ticket = factura simplificada F2). */}
          <div className="space-y-3 border-t border-[var(--ui-border)] pt-4">
            <button
              type="button"
              onClick={() => setWantsInvoice((v) => !v)}
              aria-pressed={wantsInvoice}
              data-testid="pay-invoice-toggle"
              className={`${methodClass(wantsInvoice)} w-full px-4`}
            >
              {wantsInvoice ? 'Factura con NIF' : 'Añadir NIF para factura'}
            </button>
            {wantsInvoice && (
              <div className="space-y-2">
                <input
                  type="text"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  maxLength={MAX_TAX_ID}
                  autoCapitalize="characters"
                  autoComplete="off"
                  data-testid="invoice-tax-id"
                  placeholder="NIF / CIF"
                  aria-label="NIF del cliente"
                  className={fieldClass}
                />
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  maxLength={MAX_NAME}
                  autoComplete="off"
                  data-testid="invoice-name"
                  placeholder="Razón social / Nombre"
                  aria-label="Razón social o nombre del cliente"
                  className={fieldClass}
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 border-t border-[var(--ui-border)] p-5">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            data-testid="pay-cancel"
            className="h-12 flex-1 rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface)] text-sm font-medium text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-subtle)] active:translate-y-[0.5px] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            data-testid="pay-confirm"
            className="h-12 flex-1 rounded-full bg-[var(--ui-primary)] text-sm font-semibold text-[var(--ui-primary-fg)] transition-colors hover:bg-[var(--ui-primary-hover)] active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? 'Cobrando…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}
