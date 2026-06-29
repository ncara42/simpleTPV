import { ArrowRight, Copy, Pause, Pencil, Play, Tag, Trash2 } from 'lucide-react';

import { useScrollShadow } from '../hooks/use-scroll-shadow.js';
import { promoStatus, type Promotion } from '../lib/promotions.js';
import {
  condClause,
  condShort,
  dateRange,
  daysBetween,
  discPhrase,
  discShort,
  statusMeta,
} from './promo-facets.js';

// Columna derecha: ficha de la promoción. Stats (descuento · condición · duración ·
// estado) y la regla aplicada como cláusula condición → recompensa. El estado vacío
// reutiliza el lenguaje visual de la ficha de Ventas (`.ventas-detail-blank`).

interface PromotionDetailProps {
  promo: Promotion | null;
  today: string;
  onEdit: (promo: Promotion) => void;
  onTogglePause: (promo: Promotion) => void;
  onDuplicate: (promo: Promotion) => void;
  onDelete: (promo: Promotion) => void;
}

export function PromotionDetail({
  promo,
  today,
  onEdit,
  onTogglePause,
  onDuplicate,
  onDelete,
}: PromotionDetailProps) {
  const { scrollRef, sentinelRef, showShadow } = useScrollShadow();

  if (!promo) {
    return (
      <div className="promo-detail" data-testid="promo-detail">
        <div className="ventas-detail-blank">
          <Tag size={22} aria-hidden="true" />
          <span className="ventas-detail-blank-title">Selecciona una promoción</span>
          <span className="ventas-detail-blank-text">
            Elige una promoción de la lista para ver su regla, vigencia y actividad.
          </span>
        </div>
      </div>
    );
  }

  const p = promo;
  const status = promoStatus(p, today);
  const meta = statusMeta(status);
  const total = daysBetween(p.startDate, p.endDate);

  const stats: Array<{ label: string; value: string; tone: string }> = [
    { label: 'Descuento', value: discShort(p), tone: 'brand' },
    { label: 'Condición', value: condShort(p), tone: 'plain' },
    { label: 'Duración', value: `${total} días`, tone: 'plain' },
    { label: 'Estado', value: meta.label, tone: meta.status },
  ];

  return (
    <div
      className={`promo-detail scroll-shadow-host${showShadow ? ' has-scroll-shadow' : ''}`}
      data-testid="promo-detail"
    >
      <div className="promo-detail-head">
        <div className="promo-detail-id">
          <span className="promo-avatar promo-avatar--lg" aria-hidden="true">
            <Tag size={18} />
          </span>
          <div className="promo-detail-titles">
            <div className="promo-detail-name-row">
              <span className="promo-detail-name" data-testid="promo-detail-name">
                {p.name}
              </span>
            </div>
            <div className="promo-detail-sub">
              <span>{condShort(p)}</span>
              <span className="promo-row-dot">·</span>
              <span className="promo-num">{dateRange(p.startDate, p.endDate)}</span>
            </div>
          </div>
        </div>
        <div className="promo-detail-actions">
          <button
            type="button"
            className="promo-act-btn"
            onClick={() => onEdit(p)}
            title="Editar"
            aria-label="Editar promoción"
            data-testid="promo-edit"
          >
            <Pencil size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="promo-act-btn"
            onClick={() => onTogglePause(p)}
            title={p.active ? 'Pausar' : 'Activar'}
            aria-label={p.active ? 'Pausar promoción' : 'Activar promoción'}
            data-testid="promo-toggle-pause"
          >
            {p.active ? (
              <Pause size={15} aria-hidden="true" />
            ) : (
              <Play size={15} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className="promo-act-btn"
            onClick={() => onDuplicate(p)}
            title="Duplicar"
            aria-label="Duplicar promoción"
            data-testid="promo-duplicate"
          >
            <Copy size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="promo-act-btn promo-act-btn--danger"
            onClick={() => onDelete(p)}
            title="Borrar"
            aria-label="Borrar promoción"
            data-testid="promo-delete"
          >
            <Trash2 size={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="promo-detail-body" ref={scrollRef}>
        <div className="promo-stats">
          {stats.map((s) => (
            <div className="promo-stat" key={s.label}>
              <span className="promo-stat-label">{s.label}</span>
              <span className="promo-stat-value promo-num" data-tone={s.tone}>
                {s.value}
              </span>
            </div>
          ))}
        </div>

        <div className="promo-rule">
          <div className="promo-rule-head">
            <span className="promo-rule-title">Regla aplicada</span>
            <span className="promo-rule-note">Se evalúa en cada ticket del TPV</span>
          </div>
          <div className="promo-rule-body">
            <div className="promo-rule-cell">
              <span className="promo-rule-cell-label">Si se cumple</span>
              <span className="promo-rule-cell-text">{condClause(p)}</span>
            </div>
            <span className="promo-rule-arrow" aria-hidden="true">
              <ArrowRight size={20} />
            </span>
            <div className="promo-rule-cell promo-rule-cell--reward">
              <span className="promo-rule-cell-label">El cliente recibe</span>
              <span className="promo-rule-reward promo-num">{discPhrase(p)}</span>
            </div>
          </div>
        </div>
        <span className="scroll-shadow-sentinel" ref={sentinelRef} aria-hidden="true" />
      </div>
    </div>
  );
}
