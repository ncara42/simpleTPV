import { Search } from 'lucide-react';

import type { SalesViewRow } from '../lib/admin.js';
import { fmtEur } from '../lib/format.js';
import {
  avatarBg,
  avatarOf,
  CHANNEL_SHORT,
  COBRO_LABELS,
  type CobroChips,
  cobroStatusOf,
  customerOf,
  type SortDir,
} from './sales-facets.js';

const hourFmt = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });

interface SalesListProps {
  rows: SalesViewRow[];
  chips: CobroChips;
  showSummary: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  hasFilters: boolean;
  onClearFilters: () => void;
  sortDir: SortDir;
  onToggleSort: () => void;
  remaining: number;
  onLoadMore: () => void;
  loadingMore: boolean;
}

export function SalesList({
  rows,
  chips,
  showSummary,
  selectedId,
  onSelect,
  hasFilters,
  onClearFilters,
  sortDir,
  onToggleSort,
  remaining,
  onLoadMore,
  loadingMore,
}: SalesListProps) {
  return (
    <div className="ventas-list" data-testid="sales-list">
      {showSummary && (
        <div className="ventas-summary" data-testid="sales-summary">
          <div className="ventas-chip" data-tone="paid">
            <span className="ventas-chip-label">Cobrado</span>
            <strong className="ventas-chip-value" data-testid="sales-chip-paid">
              {fmtEur(chips.paid)}
            </strong>
          </div>
          <div className="ventas-chip" data-tone="pending">
            <span className="ventas-chip-label">Pendiente</span>
            <strong className="ventas-chip-value" data-testid="sales-chip-pending">
              {fmtEur(chips.pending)}
            </strong>
          </div>
          <div className="ventas-chip" data-tone="overdue">
            <span className="ventas-chip-label">Vencido</span>
            <strong className="ventas-chip-value" data-testid="sales-chip-overdue">
              {fmtEur(chips.overdue)}
            </strong>
          </div>
        </div>
      )}

      <div className="ventas-list-body">
        <div className="ventas-list-head">
          <span className="ventas-list-count" data-testid="sales-count">
            {rows.length} ventas
          </span>
          <button
            type="button"
            className="ventas-list-sort"
            onClick={onToggleSort}
            data-testid="sales-sort"
            aria-label={
              sortDir === 'desc' ? 'Ordenar por más antiguas' : 'Ordenar por más recientes'
            }
          >
            {sortDir === 'desc' ? 'Recientes ↓' : 'Antiguas ↑'}
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="ventas-empty" data-testid="sales-empty">
            <Search size={20} aria-hidden="true" />
            <span className="ventas-empty-title">Sin ventas para estos filtros</span>
            {hasFilters && (
              <button type="button" className="ventas-btn" onClick={onClearFilters}>
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          <div className="ventas-list-scroll">
            {rows.map((row) => {
              const cobro = cobroStatusOf(row);
              const avatar = avatarOf(row);
              return (
                <button
                  key={row.id}
                  type="button"
                  className={`ventas-row${row.id === selectedId ? ' is-selected' : ''}`}
                  onClick={() => onSelect(row.id)}
                  data-testid="sales-row"
                >
                  <span
                    className="ventas-avatar"
                    style={{ ['--avatar-bg' as string]: avatarBg(avatar.tone) }}
                    aria-hidden="true"
                  >
                    {avatar.initials}
                  </span>
                  <span className="ventas-row-main">
                    <span className="ventas-row-name">{customerOf(row)}</span>
                    <span className="ventas-row-sub">
                      <span className="ventas-ticket">#{row.ticketNumber}</span> ·{' '}
                      {hourFmt.format(new Date(row.createdAt))} ·{' '}
                      {CHANNEL_SHORT[row.channel] ?? row.channel}
                    </span>
                  </span>
                  <span className="ventas-row-end">
                    <span className={`ventas-row-total${cobro === 'void' ? ' is-void' : ''}`}>
                      {fmtEur(Number(row.total))}
                    </span>
                    <span className="ventas-pill" data-cobro={cobro}>
                      {COBRO_LABELS[cobro]}
                    </span>
                  </span>
                </button>
              );
            })}

            {remaining > 0 && (
              <div className="ventas-list-more">
                <button
                  type="button"
                  className="ventas-btn"
                  onClick={onLoadMore}
                  disabled={loadingMore}
                  data-testid="sales-load-more"
                >
                  {loadingMore ? 'Cargando…' : `Cargar más · ${remaining} restantes`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
