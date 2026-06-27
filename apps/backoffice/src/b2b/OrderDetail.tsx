import type { WholesaleOrderDetail } from '@simpletpv/auth';
import { Check, PackageOpen, X } from 'lucide-react';

import { fmtEur } from '../lib/format.js';
import {
  fmtOrderDate,
  type OrderStatus,
  type OrderView,
  relDays,
  statusLabel,
  statusTone,
  stepperSteps,
} from './order-facets.js';

// Columna derecha: ficha del pedido. Cabecera (avatar de estado · referencia ·
// subtítulo + acciones con icono de estado), stepper de seguimiento, resumen, tabla de
// líneas con precio congelado y notas. Reutiliza el lenguaje visual de la ficha de
// Ventas (`.ventas-*`) y de Clientes (`.cust-*`); lo propio de pedidos vive en
// `pedidos.css`.
//
// Overrides del handoff:
//  · El title (referencia) y el subtítulo comparten el mismo line-height que el resto
//    del bloque de títulos (`.cust-detail-titles`, 1.2) — la referencia solo cambia la
//    familia a monospace, no el interlineado.
//  · Sin píldoras de estado en la cabecera: el estado se señala con el MISMO icono que
//    usa Ventas para el cobro (tick verde, círculo naranja…), junto a las acciones.

interface OrderDetailProps {
  order: OrderView | null;
  detail: WholesaleOrderDetail | null;
  detailLoading: boolean;
  busy: boolean;
  now: number;
  onAdvance: (next: OrderStatus) => void;
  onCancel: () => void;
}

/** Icono de estado reutilizando el lenguaje del icono de cobro de Ventas. */
function OrderStatusIcon({ status }: { status: OrderStatus }) {
  const tone = statusTone(status);
  if (tone === 'draft') {
    return (
      <span className="ped-status-icon" data-status="draft" aria-hidden="true">
        <span className="ped-status-dot" />
      </span>
    );
  }
  if (tone === 'cancelled') {
    return (
      <span className="ped-status-icon" data-status="cancelled" aria-hidden="true">
        <X size={11} strokeWidth={3} />
      </span>
    );
  }
  // confirmed (azul) · shipped (verde): tick.
  return (
    <span className="ped-status-icon" data-status={tone} aria-hidden="true">
      <Check size={11} strokeWidth={3} />
    </span>
  );
}

export function OrderDetail({
  order,
  detail,
  detailLoading,
  busy,
  now,
  onAdvance,
  onCancel,
}: OrderDetailProps) {
  if (!order) {
    return (
      <div className="pl-detail" data-testid="b2b-order-detail">
        <div className="ventas-detail-blank">
          <PackageOpen size={22} aria-hidden="true" />
          <span className="ventas-detail-blank-title">Selecciona un pedido</span>
          <span className="ventas-detail-blank-text">
            Elige un pedido de la lista para ver su seguimiento, el resumen y las líneas con precio
            congelado.
          </span>
        </div>
      </div>
    );
  }

  const o = order;
  const steps = stepperSteps(o.status);
  const lines = detail?.lines ?? [];
  const lineCount = detail ? lines.length : o.lineCount;
  const units = lines.reduce((n, l) => n + Math.round(Number(l.qty)), 0);
  const canConfirm = o.status === 'DRAFT';
  const canShip = o.status === 'CONFIRMED';
  const canCancel = o.status === 'DRAFT' || o.status === 'CONFIRMED';
  const isTerminal = !canCancel; // SHIPPED / CANCELLED → sin acciones

  const meta: Array<{ label: string; value: string }> = [
    { label: 'Fecha de creación', value: fmtOrderDate(o.createdAt) },
    { label: 'Antigüedad', value: relDays(o.createdAt, now) },
    { label: 'Tarifa aplicada', value: o.tariffName },
    { label: 'Líneas · unidades', value: `${lineCount} · ${detail ? units : '—'} ud` },
  ];

  return (
    <div className="pl-detail" data-testid="b2b-order-detail">
      <div className="pl-detail-head">
        <div className="cust-detail-id">
          <span
            className="cust-avatar cust-avatar--lg ped-sw"
            data-status={statusTone(o.status)}
            aria-hidden="true"
          >
            {o.seq}
          </span>
          <div className="cust-detail-titles">
            {/* Title y subtítulo al mismo line-height (1.2) que el resto del bloque: la
                referencia solo cambia la familia a monospace. Sin píldora de estado. */}
            <span className="cust-detail-name ped-detail-ref" data-testid="b2b-order-detail-ref">
              {o.ref}
            </span>
            <span className="cust-detail-sub">{o.customerName}</span>
          </div>
        </div>
        <div className="cust-detail-actions ped-detail-actions">
          <OrderStatusIcon status={o.status} />
          {isTerminal ? (
            <span className="ped-status-text" data-status={statusTone(o.status)}>
              {statusLabel(o.status)}
            </span>
          ) : (
            <>
              {canConfirm && (
                <button
                  type="button"
                  className="ventas-btn ventas-btn--primary"
                  onClick={() => onAdvance('CONFIRMED')}
                  disabled={busy}
                  data-testid="b2b-order-confirm"
                >
                  Confirmar pedido
                </button>
              )}
              {canShip && (
                <button
                  type="button"
                  className="ventas-btn ventas-btn--primary"
                  onClick={() => onAdvance('SHIPPED')}
                  disabled={busy}
                  data-testid="b2b-order-ship"
                >
                  Marcar como enviado
                </button>
              )}
              {canCancel && (
                <button
                  type="button"
                  className="ventas-btn cust-del-btn"
                  onClick={onCancel}
                  disabled={busy}
                  data-testid="b2b-order-cancel"
                >
                  Cancelar
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="pl-detail-body">
        {/* Stepper de seguimiento. */}
        <div className="ped-stepper-card">
          <div className="ped-stepper">
            {steps.map((st, i) => (
              <div className="ped-step" data-state={st.state} key={st.key}>
                {i < steps.length - 1 && <span className="ped-step-conn" aria-hidden="true" />}
                <span className="ped-step-dot" aria-hidden="true">
                  {st.state === 'cancelled' ? (
                    <X size={12} strokeWidth={3} />
                  ) : st.state === 'done' ? (
                    <Check size={12} strokeWidth={3} />
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="ped-step-label">{st.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Resumen. */}
        <div>
          <h4 className="ventas-section-title">Resumen del pedido</h4>
          <div className="ventas-meta-grid">
            {meta.map((m) => (
              <div className="ventas-meta" key={m.label}>
                <span className="ventas-meta-label">{m.label}</span>
                <span className="ventas-meta-value cust-num">{m.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Líneas. */}
        <div>
          <div className="pl-section-head">
            <h4 className="ventas-section-title">Líneas del pedido</h4>
            <span className="pl-section-note">Precio congelado</span>
          </div>
          <div className="ped-lines" data-testid="b2b-order-lines">
            <div className="ped-lines-head">
              <span>Producto</span>
              <span className="ped-r">Cant.</span>
              <span className="ped-r">Precio</span>
              <span className="ped-r">Subtotal</span>
            </div>
            {detailLoading ? (
              <div className="pl-products-empty">Cargando líneas…</div>
            ) : lines.length === 0 ? (
              <div className="pl-products-empty">Este pedido no tiene líneas.</div>
            ) : (
              lines.map((l) => (
                <div className="ped-line-row" key={l.id} data-testid="b2b-order-line">
                  <span className="ped-line-name">{l.product?.name ?? l.productId}</span>
                  <span className="cust-num ped-r">{Number(l.qty)}</span>
                  <span className="cust-num ped-r" data-tone="muted">
                    {fmtEur(Number(l.unitPrice))}
                  </span>
                  <span className="cust-num ped-r ped-line-sub">{fmtEur(Number(l.lineTotal))}</span>
                </div>
              ))
            )}
            <div className="ped-lines-foot">
              <span className="ped-lines-foot-count">
                {lineCount} línea{lineCount !== 1 ? 's' : ''}
                {detail ? ` · ${units} ud` : ''}
              </span>
              <span className="ped-lines-foot-total">
                <span className="ped-lines-foot-label">Total</span>
                <span className="cust-num ped-lines-foot-value">{fmtEur(o.total)}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Notas. */}
        {detail?.notes && (
          <div>
            <h4 className="ventas-section-title">Notas</h4>
            <p className="ped-notes">{detail.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
