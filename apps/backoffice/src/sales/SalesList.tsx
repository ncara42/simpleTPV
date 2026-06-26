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
} from './sales-facets.js';

const hourFmt = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });

interface SalesListProps {
  rows: SalesViewRow[];
  chips: CobroChips;
  showSummary: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Nº de ventas del periodo que NO se cargaron (tope de página); 0 si todas. */
  capExtra: number;
  hasFilters: boolean;
  onClearFilters: () => void;
}

export function SalesList({
  rows,
  chips,
  showSummary,
  selectedId,
  onSelect,
  capExtra,
  hasFilters,
  onClearFilters,
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

      <div className="ventas-list-head">
        <span className="ventas-list-count" data-testid="sales-count">
          {rows.length} ventas
        </span>
        <span className="ventas-list-sort">Recientes ↓</span>
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
        </div>
      )}

      {capExtra > 0 && (
        <div className="ventas-cap-note" data-testid="sales-cap-note">
          Mostrando las {rows.length} ventas más recientes · {capExtra} más en el periodo. Afina con
          los filtros o acota el periodo.
        </div>
      )}
    </div>
  );
}
