import { TriangleAlert, X } from 'lucide-react';

import type { TransferActionKind, TransferDetail } from './transfer-view.js';

// Ficha lateral (cajón) de un traspaso: cabecera (avatar de origen, nombre, ruta,
// icono de estado), meta en rejilla, productos con recibido/enviado + total + nota de
// incidencia, línea de tiempo del traspaso y la acción real disponible. Reutiliza el
// `.drawer-backdrop` y la animación `drawer-slide-in` del registro de tienda.

interface TransferDrawerProps {
  detail: TransferDetail;
  onClose: () => void;
  onAction: (kind: TransferActionKind) => void;
  pending: boolean;
}

export function TransferDrawer({ detail, onClose, onAction, pending }: TransferDrawerProps) {
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="tr-drawer"
        role="dialog"
        aria-label={`Traspaso ${detail.primary}`}
        onClick={(e) => e.stopPropagation()}
        data-testid="transfer-drawer"
      >
        <header className="tr-drawer-head">
          <div className="tr-drawer-id">
            <span className="tr-avatar" aria-hidden="true">
              {detail.avatarText}
            </span>
            <div className="tr-drawer-title">
              <span className="tr-drawer-primary">{detail.primary}</span>
              <span className="tr-drawer-route">{detail.routeLine}</span>
            </div>
          </div>
          <div className="tr-drawer-head-end">
            <span
              className={`tr-status-icon tr-status-icon--${detail.tone}`}
              title={detail.statusLabel}
              aria-label={detail.statusLabel}
            >
              {detail.glyph}
            </span>
            <button
              type="button"
              className="drawer-close"
              onClick={onClose}
              aria-label="Cerrar ficha"
              data-testid="transfer-drawer-close"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="tr-drawer-body">
          <div className="tr-meta-grid">
            {detail.meta.map((m) => (
              <div className="tr-meta-item" key={m.label}>
                <span className="tr-meta-label">{m.label}</span>
                <span className="tr-meta-value">{m.value}</span>
              </div>
            ))}
          </div>

          <div>
            <h4 className="tr-section-title">Productos del traspaso</h4>
            <div className="tr-lines">
              {detail.lines.map((l) => (
                <div className="tr-line" key={l.id}>
                  <span className="tr-line-info">
                    <span className="tr-line-name">{l.name}</span>
                    <span className="tr-line-sku">{l.sku}</span>
                  </span>
                  <span className={`tr-line-right${l.short ? ' is-short' : ''}`}>{l.right}</span>
                </div>
              ))}
              <div className="tr-line-total">
                <span className="tr-line-total-label">{detail.lineTotalLabel}</span>
                <span className="tr-line-total-value">{detail.unitsLabel}</span>
              </div>
            </div>
            {detail.hasIncidence && (
              <div className="tr-incid" data-testid="transfer-incidence">
                <TriangleAlert size={15} aria-hidden="true" />
                {detail.incidenceNote}
              </div>
            )}
          </div>

          <div>
            <h4 className="tr-section-title">Seguimiento del traspaso</h4>
            <div className="tr-timeline">
              {detail.timeline.map((step) => (
                <div className="tr-tl-step" key={step.label}>
                  <div className="tr-tl-rail">
                    <span className={`tr-tl-dot tr-tl-dot--${step.tone}`} aria-hidden="true">
                      {step.glyph}
                    </span>
                    {step.line && <span className="tr-tl-line" />}
                  </div>
                  <div className="tr-tl-body">
                    <span className="tr-tl-label">{step.label}</span>
                    <span className="tr-tl-when">{step.when}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {detail.action && (
            <div className="tr-drawer-actions">
              <button
                type="button"
                className="tr-drawer-btn"
                disabled={pending}
                onClick={() => detail.action && onAction(detail.action.kind)}
                data-testid="transfer-drawer-action"
              >
                {detail.action.label} traspaso
              </button>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
