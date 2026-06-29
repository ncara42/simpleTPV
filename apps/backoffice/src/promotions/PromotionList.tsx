import { Tag } from 'lucide-react';

import { useScrollShadow } from '../hooks/use-scroll-shadow.js';
import { promoStatus, type Promotion } from '../lib/promotions.js';
import {
  condShort,
  dateRange,
  discShort,
  type PromoChips,
  type PromoSortMode,
  statusMeta,
} from './promo-facets.js';

// Columna central del maestro-detalle: chips de resumen (activas · programadas ·
// inactivas), cabecera (recuento + orden) y lista de promociones. Cada fila es un
// único `<button>` (seleccionar → ficha), espejo de la fila de Ventas/Clientes. El
// borrado/pausa viven en la cabecera de la ficha, no por fila.

interface PromotionListProps {
  rows: Promotion[];
  total: number;
  chips: PromoChips;
  today: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  sortMode: PromoSortMode;
  onToggleSort: () => void;
  hasFilters: boolean;
  onClearFilters: () => void;
}

export function PromotionList({
  rows,
  total,
  chips,
  today,
  selectedId,
  onSelect,
  sortMode,
  onToggleSort,
  hasFilters,
  onClearFilters,
}: PromotionListProps) {
  const { scrollRef, sentinelRef, showShadow } = useScrollShadow();
  return (
    <div className="promo-list" data-testid="promo-list">
      {/* Chips de resumen del conjunto filtrado: estado del catálogo de un vistazo. */}
      <div className="promo-summary" data-testid="promo-summary">
        <div className="promo-stat-chip" data-tone="activa">
          <span className="promo-stat-chip-label">Activas</span>
          <strong className="promo-stat-chip-value" data-testid="promo-chip-activa">
            {chips.activa}
          </strong>
        </div>
        <div className="promo-stat-chip" data-tone="programada">
          <span className="promo-stat-chip-label">Programadas</span>
          <strong className="promo-stat-chip-value" data-testid="promo-chip-programada">
            {chips.programada}
          </strong>
        </div>
        <div className="promo-stat-chip" data-tone="inactiva">
          <span className="promo-stat-chip-label">Inactivas</span>
          <strong className="promo-stat-chip-value" data-testid="promo-chip-inactiva">
            {chips.inactiva}
          </strong>
        </div>
      </div>

      <div
        className={`promo-list-body scroll-shadow-host${showShadow ? ' has-scroll-shadow' : ''}`}
      >
        <div className="promo-list-head">
          <span className="promo-list-count" data-testid="promo-count">
            {rows.length} de {total} {total === 1 ? 'promoción' : 'promociones'}
          </span>
          <button
            type="button"
            className="promo-sort"
            onClick={onToggleSort}
            data-testid="promo-sort"
          >
            Orden: {sortMode === 'estado' ? 'Estado' : 'Vigencia'}
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="promo-empty" data-testid="promo-empty">
            <Tag size={20} aria-hidden="true" />
            <span className="promo-empty-title">Sin promociones para estos filtros</span>
            {hasFilters && (
              <button type="button" className="ventas-btn" onClick={onClearFilters}>
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          <div className="promo-list-scroll" data-testid="promo-rows" ref={scrollRef}>
            {rows.map((p) => {
              const meta = statusMeta(promoStatus(p, today));
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`promo-row${p.id === selectedId ? ' is-selected' : ''}`}
                  onClick={() => onSelect(p.id)}
                  aria-pressed={p.id === selectedId}
                  data-testid="promo-row"
                >
                  <span className="promo-avatar" aria-hidden="true">
                    <Tag size={15} />
                  </span>
                  <span className="promo-row-body">
                    <span className="promo-row-name">{p.name}</span>
                    <span className="promo-row-sub">
                      <span>{condShort(p)}</span>
                      <span className="promo-row-dot">·</span>
                      <span className="promo-num">{dateRange(p.startDate, p.endDate)}</span>
                    </span>
                  </span>
                  <span className="promo-row-end">
                    <span className={`promo-badge promo-${meta.status}`} data-testid="promo-status">
                      {meta.label}
                    </span>
                    <span className="promo-discount">{discShort(p)}</span>
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
