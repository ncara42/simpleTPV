import { useEffect, useState } from 'react';

import { eur } from './lib/format.js';

// Denominaciones EUR de mayor a menor, en CÉNTIMOS (enteros) para evitar errores
// de coma flotante al sumar (0.1 + 0.2 ≠ 0.3). El total se divide entre 100.
export const CASH_DENOMINATIONS: ReadonlyArray<{ cents: number; label: string }> = [
  { cents: 50000, label: '500 €' },
  { cents: 20000, label: '200 €' },
  { cents: 10000, label: '100 €' },
  { cents: 5000, label: '50 €' },
  { cents: 2000, label: '20 €' },
  { cents: 1000, label: '10 €' },
  { cents: 500, label: '5 €' },
  { cents: 200, label: '2 €' },
  { cents: 100, label: '1 €' },
  { cents: 50, label: '50 cts' },
  { cents: 20, label: '20 cts' },
  { cents: 10, label: '10 cts' },
  { cents: 5, label: '5 cts' },
  { cents: 2, label: '2 cts' },
  { cents: 1, label: '1 ct' },
];

// Partición para el arqueo: billetes (≥ 5 €) y monedas (< 5 €). Conserva el orden
// de mayor a menor de CASH_DENOMINATIONS; se usa para agrupar el conteo en dos columnas.
const CASH_NOTES = CASH_DENOMINATIONS.filter((d) => d.cents >= 500);
const CASH_COINS = CASH_DENOMINATIONS.filter((d) => d.cents < 500);

export type CashCounts = Record<string, number>;

// Total contado (en euros) a partir del número de piezas por denominación.
export function countedTotal(counts: CashCounts): number {
  const cents = CASH_DENOMINATIONS.reduce((acc, d) => acc + (counts[d.cents] ?? 0) * d.cents, 0);
  return cents / 100;
}

function loadCounts(key: string): CashCounts {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed as CashCounts;
    }
  } catch {
    // localStorage no disponible o JSON corrupto → empezamos en blanco.
  }
  return {};
}

/**
 * Contador de efectivo por denominaciones para el cierre de caja. El conteo en
 * curso se persiste en localStorage por `storageKey` (sesión + dispositivo), de
 * modo que sobrevive a cerrar y reabrir el panel; "Reiniciar conteo" lo vacía.
 * Reporta el total al padre vía `onTotalChange` para alimentar el cierre.
 */
export function CashCount({
  expected,
  storageKey,
  onTotalChange,
}: {
  expected: number;
  storageKey: string;
  onTotalChange: (total: number) => void;
}) {
  const [counts, setCounts] = useState<CashCounts>(() => loadCounts(storageKey));

  const total = countedTotal(counts);
  const difference = Math.round((total - expected) * 100) / 100;

  // Persiste el conteo y reporta el total. `onTotalChange` es un setState estable.
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(counts));
    } catch {
      // Sin localStorage el conteo sigue en memoria mientras el panel esté abierto.
    }
    onTotalChange(total);
  }, [counts, storageKey, total, onTotalChange]);

  function setCount(cents: number, n: number): void {
    setCounts((c) => ({ ...c, [cents]: Math.max(0, Math.floor(n) || 0) }));
  }
  function bump(cents: number, delta: number): void {
    setCounts((c) => ({ ...c, [cents]: Math.max(0, (c[cents] ?? 0) + delta) }));
  }

  const diffClass =
    difference > 0
      ? 'cash-diff-positive'
      : difference < 0
        ? 'cash-diff-negative'
        : 'cash-diff-zero';

  // Una fila de denominación: etiqueta, stepper −/+ y subtotal que solo aparece al
  // contar (> 0) para no saturar de "0,00 €". La clase is-active "enciende" la fila.
  const renderDenom = (d: { cents: number; label: string }) => {
    const n = counts[d.cents] ?? 0;
    return (
      <div
        className={`cash-count-row${n > 0 ? ' is-active' : ''}`}
        key={d.cents}
        data-testid="cash-count-row"
      >
        <span className="cash-count-denom">{d.label}</span>
        <div className="cash-count-stepper">
          <button type="button" aria-label={`Quitar ${d.label}`} onClick={() => bump(d.cents, -1)}>
            −
          </button>
          <input
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={n === 0 ? '' : n}
            onChange={(e) => setCount(d.cents, Number(e.target.value))}
            data-testid={`cash-count-${d.cents}`}
            aria-label={`Cantidad de ${d.label}`}
          />
          <button type="button" aria-label={`Añadir ${d.label}`} onClick={() => bump(d.cents, 1)}>
            +
          </button>
        </div>
        <span className="cash-count-sub tabular-nums">
          {n > 0 ? `${eur((n * d.cents) / 100)} €` : ''}
        </span>
      </div>
    );
  };

  return (
    <div className="cash-count" data-testid="cash-count">
      <div className="cash-count-groups">
        <section className="cash-count-group">
          <div className="cash-count-rows">{CASH_NOTES.map(renderDenom)}</div>
        </section>
        <section className="cash-count-group">
          <div className="cash-count-rows">{CASH_COINS.map(renderDenom)}</div>
        </section>
      </div>
      <div className="cash-count-foot">
        <div className="cash-count-summary">
          <div className="cash-count-metric">
            <span className="cash-count-metric-label">Total contado</span>
            <span className="cash-count-metric-value tabular-nums" data-testid="cash-count-total">
              {eur(total)} €
            </span>
          </div>
          <div className="cash-count-metric">
            <span className="cash-count-metric-label">Diferencia vs teórico</span>
            <span
              className={`cash-count-metric-value tabular-nums ${diffClass}`}
              data-testid="cash-count-diff"
            >
              {difference > 0 ? '+' : ''}
              {eur(difference)} €
            </span>
          </div>
        </div>
        <button
          type="button"
          className="cash-count-reset"
          onClick={() => setCounts({})}
          data-testid="cash-count-reset"
        >
          Reiniciar conteo
        </button>
      </div>
    </div>
  );
}
