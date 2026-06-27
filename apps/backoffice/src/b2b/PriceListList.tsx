import { Tags } from 'lucide-react';

import { fmtEurCompact } from '../lib/format.js';
import { type PriceListView, swCode, tipoLabel } from './pricelist-facets.js';

// Columna central del maestro-detalle: cabecera (recuento + orden) y lista de
// tarifas. Cada fila es un único `<button data-testid="b2b-pricelist-row">`
// (seleccionar → ficha), con la misma estructura que la fila de Clientes/Ventas
// (`.cust-row`). La edición/borrado viven en la cabecera de la ficha.

interface PriceListListProps {
  rows: PriceListView[];
  total: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  sortAsc: boolean;
  onToggleSort: () => void;
  hasFilters: boolean;
  onClearFilters: () => void;
}

export function PriceListList({
  rows,
  total,
  selectedId,
  onSelect,
  sortAsc,
  onToggleSort,
  hasFilters,
  onClearFilters,
}: PriceListListProps) {
  return (
    <div className="pl-list" data-testid="b2b-pricelists">
      <div className="pl-list-head">
        <span className="cust-list-count">
          {rows.length} de {total} tarifa{total !== 1 ? 's' : ''}
        </span>
        <button type="button" className="cust-sort" onClick={onToggleSort}>
          Facturado {sortAsc ? '↑' : '↓'}
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="cust-empty" data-testid="b2b-pricelists-table">
          <Tags size={20} aria-hidden="true" />
          <span className="cust-empty-title">Sin tarifas para estos filtros</span>
          {hasFilters && (
            <button type="button" className="ventas-btn" onClick={onClearFilters}>
              Limpiar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="pl-list-scroll" data-testid="b2b-pricelists-table">
          {rows.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`cust-row${t.id === selectedId ? ' is-selected' : ''}`}
              onClick={() => onSelect(t.id)}
              aria-pressed={t.id === selectedId}
              data-testid="b2b-pricelist-row"
            >
              <span className="cust-avatar" aria-hidden="true">
                {swCode(t.name)}
              </span>
              <span className="cust-row-body">
                <span className="cust-row-name">{t.name}</span>
                <span className="cust-row-sub">
                  <span>{tipoLabel(t.tipo)}</span>
                  <span className="cust-row-dot">·</span>
                  <span className="cust-num">{t.itemCount} prod.</span>
                </span>
              </span>
              <span className="cust-row-end">
                <span className="cust-row-billed cust-num">{fmtEurCompact(t.billed12m)}</span>
                <span className="cust-row-saldo cust-num" data-tone="muted">
                  {t.customerCount} cliente{t.customerCount !== 1 ? 's' : ''}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
