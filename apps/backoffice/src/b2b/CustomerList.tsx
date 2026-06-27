import { Users } from 'lucide-react';

import { useScrollShadow } from '../hooks/use-scroll-shadow.js';
import { fmtEur } from '../lib/format.js';
import { type CustomerView, initials, relOrderDate } from './customer-facets.js';

// Columna central del maestro-detalle: cards de resumen, cabecera (recuento + orden)
// y lista de clientes. Cada fila es un único `<button data-testid="b2b-customer-row">`
// (seleccionar → ficha), igual que la fila de Ventas. El borrado vive en la cabecera
// de la ficha (botón «Borrar»), no por fila.

interface CustomerListProps {
  rows: CustomerView[];
  total: number;
  /** Totales de la cartera filtrada para las cards de resumen (como Ventas). */
  summary: { billed: number; balance: number; overdue: number };
  selectedId: string | null;
  onSelect: (id: string) => void;
  sortAsc: boolean;
  onToggleSort: () => void;
  now: number;
  hasFilters: boolean;
  onClearFilters: () => void;
}

/** Mini-resumen de cartera en la fila: vencido > saldo > al día. */
function saldoMini(c: CustomerView): { text: string; tone: string } {
  if (c.overdue > 0) return { text: `${fmtEur(c.overdue)} venc.`, tone: 'danger' };
  if (c.balance > 0) return { text: fmtEur(c.balance), tone: 'plain' };
  return { text: 'al día', tone: 'muted' };
}

export function CustomerList({
  rows,
  total,
  summary,
  selectedId,
  onSelect,
  sortAsc,
  onToggleSort,
  now,
  hasFilters,
  onClearFilters,
}: CustomerListProps) {
  const { scrollRef, sentinelRef, showShadow } = useScrollShadow();
  return (
    <div className="cust-list" data-testid="b2b-customers">
      {/* Cards de resumen de la cartera filtrada (mismo lenguaje visual que Ventas:
          verde/ámbar/rojo), encima del contador de clientes. */}
      <div className="ventas-summary" data-testid="b2b-customers-summary">
        <div className="ventas-chip" data-tone="paid">
          <span className="ventas-chip-label">Facturado</span>
          <strong className="ventas-chip-value" data-testid="b2b-summary-billed">
            {fmtEur(summary.billed)}
          </strong>
        </div>
        <div className="ventas-chip" data-tone="pending">
          <span className="ventas-chip-label">Saldo</span>
          <strong className="ventas-chip-value" data-testid="b2b-summary-balance">
            {fmtEur(summary.balance)}
          </strong>
        </div>
        <div className="ventas-chip" data-tone="overdue">
          <span className="ventas-chip-label">Vencido</span>
          <strong className="ventas-chip-value" data-testid="b2b-summary-overdue">
            {fmtEur(summary.overdue)}
          </strong>
        </div>
      </div>

      <div className={`cust-list-body scroll-shadow-host${showShadow ? ' has-scroll-shadow' : ''}`}>
        <div className="cust-list-head">
          <span className="cust-list-count">
            {rows.length} de {total} cliente{total !== 1 ? 's' : ''}
          </span>
          <button type="button" className="cust-sort" onClick={onToggleSort}>
            Facturado {sortAsc ? '↑' : '↓'}
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="cust-empty" data-testid="b2b-customers-table">
            <Users size={20} aria-hidden="true" />
            <span className="cust-empty-title">Sin clientes para estos filtros</span>
            {hasFilters && (
              <button type="button" className="ventas-btn" onClick={onClearFilters}>
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          <div className="cust-list-scroll" data-testid="b2b-customers-table" ref={scrollRef}>
            {rows.map((c) => {
              const tariff = c.priceList?.name ?? 'PVP';
              const mini = saldoMini(c);
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`cust-row${c.id === selectedId ? ' is-selected' : ''}`}
                  onClick={() => onSelect(c.id)}
                  aria-pressed={c.id === selectedId}
                  data-testid="b2b-customer-row"
                >
                  <span className="cust-avatar" aria-hidden="true">
                    {initials(c.name)}
                  </span>
                  <span className="cust-row-body">
                    <span className="cust-row-name">{c.name}</span>
                    <span className="cust-row-sub">
                      <span>{tariff}</span>
                      <span className="cust-row-dot">·</span>
                      <span className="cust-num">{relOrderDate(c.lastOrderAt, now)}</span>
                    </span>
                  </span>
                  <span className="cust-row-end">
                    <span className="cust-row-billed cust-num">{fmtEur(c.billed12m)}</span>
                    <span className="cust-row-saldo cust-num" data-tone={mini.tone}>
                      {mini.text}
                    </span>
                  </span>
                </button>
              );
            })}
            <span className="scroll-shadow-sentinel" ref={sentinelRef} aria-hidden="true" />
          </div>
        )}
      </div>
    </div>
  );
}
