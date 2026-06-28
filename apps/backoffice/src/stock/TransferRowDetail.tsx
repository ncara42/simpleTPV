import { useQuery } from '@tanstack/react-query';
import { Check, TriangleAlert } from 'lucide-react';
import { useState } from 'react';

import { listTransferAttachments } from '../lib/stock.js';
import type { TransferActionKind, TransferDetail } from './transfer-view.js';

// Panel de detalle EN LÍNEA de un traspaso (acordeón): se despliega bajo la fila al
// pulsarla. Muestra meta en rejilla, productos (recibido/enviado) + total y, justo
// debajo de los productos, el cuadro «Revisión de recepción» (incidencias/comentarios
// + fotos, o «Todo en perfecto estado» con tick verde); a la derecha, la línea de
// tiempo. Y por último la acción real disponible.

interface TransferRowDetailProps {
  detail: TransferDetail;
  onAction: (kind: TransferActionKind) => void;
  pending: boolean;
}

export function TransferRowDetail({ detail, onAction, pending }: TransferRowDetailProps) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  // Fotos de la recepción: solo se consultan una vez recibido (antes no las hay).
  const { data: photos = [] } = useQuery({
    queryKey: ['transfer-attachments', detail.id],
    queryFn: () => listTransferAttachments(detail.id),
    enabled: detail.reviewState !== 'pending',
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

          {/* Revisión de recepción, justo debajo de los productos: comentarios/
              incidencias por línea + fotos; si no hubo nada, «Todo en perfecto
              estado» con tick verde. */}
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
              <ul className="tr-review-list" data-testid="transfer-review-incidents">
                {detail.incidents.map((inc, i) => (
                  <li className="tr-review-item" key={i}>
                    <TriangleAlert className="tr-review-ico" size={14} aria-hidden="true" />
                    <span className="tr-review-body">
                      <span className="tr-review-head">
                        <span className="tr-review-prod">{inc.product}</span>
                        <span className={`tr-review-qty${inc.short ? ' is-short' : ''}`}>
                          {inc.qtyLabel}
                        </span>
                      </span>
                      {inc.note && <span className="tr-review-note">{inc.note}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {photos.length > 0 ? (
              <div className="tr-photos" data-testid="transfer-photos">
                {photos.map((a) => (
                  <button
                    type="button"
                    className="tr-photo"
                    key={a.id}
                    onClick={() => setLightbox(a.dataUrl)}
                    title={a.caption ?? 'Foto de la recepción'}
                  >
                    <img src={a.dataUrl} alt={a.caption ?? 'Foto de la recepción'} loading="lazy" />
                  </button>
                ))}
              </div>
            ) : detail.reviewState !== 'pending' ? (
              <p className="tr-photos-empty">Sin fotos adjuntas.</p>
            ) : null}
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

      {lightbox && (
        <div
          className="tr-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Foto de la recepción"
          onClick={() => setLightbox(null)}
          data-testid="transfer-photo-lightbox"
        >
          <img src={lightbox} alt="Foto de la recepción" />
        </div>
      )}
    </div>
  );
}
