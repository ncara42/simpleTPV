import { TriangleAlert } from 'lucide-react';

import type { TransferActionKind, TransferDetail } from './transfer-view.js';

// Panel de detalle EN LÍNEA de un traspaso (acordeón): se despliega bajo la fila al
// pulsarla. Muestra meta en rejilla, productos (recibido/enviado) + total + nota de
// incidencia, la línea de tiempo del traspaso y la acción real disponible. Reemplaza
// al antiguo cajón lateral; reutiliza las clases `.tr-meta-*`/`.tr-line*`/`.tr-tl-*`.

interface TransferRowDetailProps {
  detail: TransferDetail;
  onAction: (kind: TransferActionKind) => void;
  pending: boolean;
}

export function TransferRowDetail({ detail, onAction, pending }: TransferRowDetailProps) {
  return (
    <div className="tr-detail" data-testid="transfer-detail">
      <div className="tr-detail-grid">
        {detail.meta.map((m) => (
          <div className="tr-meta-item" key={m.label}>
            <span className="tr-meta-label">{m.label}</span>
            <span className="tr-meta-value">{m.value}</span>
          </div>
        ))}
      </div>

      <div className="tr-detail-cols">
        <div className="tr-detail-col">
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
              <TriangleAlert size={14} aria-hidden="true" />
              {detail.incidenceNote}
            </div>
          )}
        </div>

        <div className="tr-detail-col">
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
      </div>

      {detail.action && (
        <div className="tr-detail-actions">
          <button
            type="button"
            className="tr-detail-btn"
            disabled={pending}
            onClick={() => detail.action && onAction(detail.action.kind)}
            data-testid="transfer-action"
          >
            {detail.action.label} traspaso
          </button>
        </div>
      )}
    </div>
  );
}
