import { useQuery } from '@tanstack/react-query';
import { Check, MessageCircle, TriangleAlert } from 'lucide-react';

import { listTransferMessages } from '../lib/stock.js';
import type { TransferActionKind, TransferDetail } from './transfer-view.js';

// Panel de detalle EN LÍNEA de un traspaso (acordeón): meta en rejilla, productos
// (recibido/enviado) + total y, debajo, un RESUMEN de la revisión de recepción («Todo
// en perfecto estado» o «N incidencias»). El detalle completo —comentarios y fotos—
// vive en el chat (pop-up) que se abre desde el botón de comentarios de la fila.

interface TransferRowDetailProps {
  detail: TransferDetail;
  onAction: (kind: TransferActionKind) => void;
  pending: boolean;
  /** Abre el chat (pop-up) de comentarios de este traspaso. */
  onOpenChat: () => void;
}

export function TransferRowDetail({
  detail,
  onAction,
  pending,
  onOpenChat,
}: TransferRowDetailProps) {
  const incidents = detail.incidents.length;
  // Recuento de mensajes para el botón «Ver N mensajes» (solo si hay incidencias).
  const { data: messages = [] } = useQuery({
    queryKey: ['transfer-messages', detail.id],
    queryFn: () => listTransferMessages(detail.id),
    enabled: detail.reviewState === 'incidents',
  });

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

          {/* Resumen de la revisión; los comentarios/fotos están en el chat de la fila. */}
          <section className="tr-review" data-testid="transfer-review">
            <h4 className="tr-section-title">Revisión de recepción</h4>
            {detail.reviewState === 'pending' ? (
              <p className="tr-review-pending">Pendiente de recepción.</p>
            ) : detail.reviewState === 'perfect' ? (
              <div className="tr-review-ok" data-testid="transfer-review-ok">
                <span className="tr-review-tick" aria-hidden="true">
                  <Check size={14} strokeWidth={3} />
                </span>
                Todo en perfecto estado
              </div>
            ) : (
              <div className="tr-review-bad" data-testid="transfer-review-incidents">
                <TriangleAlert size={14} aria-hidden="true" />
                <span>
                  {incidents} {incidents === 1 ? 'incidencia' : 'incidencias'}
                </span>
                <button
                  type="button"
                  className="tr-review-chat"
                  onClick={onOpenChat}
                  data-testid="transfer-review-chat"
                >
                  <MessageCircle size={13} aria-hidden="true" />
                  Ver {messages.length} {messages.length === 1 ? 'mensaje' : 'mensajes'}
                </button>
              </div>
            )}
          </section>
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
