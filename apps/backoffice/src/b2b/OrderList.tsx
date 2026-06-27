import { PackageOpen } from 'lucide-react';

import { fmtEurCompact } from '../lib/format.js';
import { type OrderView, relDays, statusLabel, statusTone } from './order-facets.js';

// Columna central del maestro-detalle: cabecera (recuento + importe + orden) y lista
// de pedidos. Cada fila es un único `<button data-testid="b2b-order-row">` (seleccionar
// → ficha), con la misma estructura que la fila de Clientes/Ventas (`.cust-row`): avatar
// (aquí teñido por estado) + cuerpo (cliente · ref · antigüedad) + total y estado.

interface OrderListProps {
  rows: OrderView[];
  total: number;
  /** Suma de los importes de las filas visibles (para «… · 4136 €»). */
  totalAmount: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  sortDesc: boolean;
  onToggleSort: () => void;
  now: number;
  hasFilters: boolean;
  onClearFilters: () => void;
}

export function OrderList({
  rows,
  total,
  totalAmount,
  selectedId,
  onSelect,
  sortDesc,
  onToggleSort,
  now,
  hasFilters,
  onClearFilters,
}: OrderListProps) {
  return (
    <div className="pl-list" data-testid="b2b-orders">
      <div className="pl-list-head">
        <span className="cust-list-count">
          {rows.length} de {total} pedido{total !== 1 ? 's' : ''}
          <span className="ped-list-sum cust-num"> · {fmtEurCompact(totalAmount)}</span>
        </span>
        <button
          type="button"
          className="cust-sort"
          onClick={onToggleSort}
          data-testid="b2b-orders-sort"
        >
          Fecha {sortDesc ? '↓' : '↑'}
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="cust-empty" data-testid="b2b-orders-table">
          <PackageOpen size={20} aria-hidden="true" />
          <span className="cust-empty-title">Sin pedidos para estos filtros</span>
          {hasFilters && (
            <button type="button" className="ventas-btn" onClick={onClearFilters}>
              Limpiar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="pl-list-scroll" data-testid="b2b-orders-table">
          {rows.map((o) => {
            const tone = statusTone(o.status);
            return (
              <button
                key={o.id}
                type="button"
                className={`cust-row${o.id === selectedId ? ' is-selected' : ''}`}
                onClick={() => onSelect(o.id)}
                aria-pressed={o.id === selectedId}
                data-testid="b2b-order-row"
              >
                <span className="cust-avatar ped-sw" data-status={tone} aria-hidden="true">
                  {o.seq}
                </span>
                <span className="cust-row-body">
                  <span className="cust-row-name">{o.customerName}</span>
                  <span className="cust-row-sub">
                    <span className="cust-num">{o.ref}</span>
                    <span className="cust-row-dot">·</span>
                    <span className="cust-num">{relDays(o.createdAt, now)}</span>
                  </span>
                </span>
                <span className="cust-row-end">
                  <span className="cust-row-billed cust-num">{fmtEurCompact(o.total)}</span>
                  <span className="ped-row-status">
                    <span className="ped-dot" data-status={tone} aria-hidden="true" />
                    {statusLabel(o.status)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
