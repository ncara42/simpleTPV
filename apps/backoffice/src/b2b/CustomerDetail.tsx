import type { WholesaleOrderSummary } from '@simpletpv/auth';
import { Pencil, Trash2, Users } from 'lucide-react';

import { fmtEur } from '../lib/format.js';
import {
  balanceTone,
  type CustomerView,
  fmtFullDate,
  initials,
  paymentTermsLabel,
  relOrderDate,
  tagTone,
} from './customer-facets.js';

// Columna derecha: ficha del cliente. Stats de cartera, datos, cartera/crédito con
// barra de uso, pedidos recientes (con cobro inline) y actividad derivada de datos
// reales. Reutiliza el lenguaje visual de la ficha de Ventas (`.ventas-*`).

interface CustomerDetailProps {
  customer: CustomerView | null;
  orders: WholesaleOrderSummary[];
  ordersLoading: boolean;
  collectingId: string | null;
  onCollect: (orderId: string) => void;
  onEdit: (customer: CustomerView) => void;
  onDelete: (customer: CustomerView) => void;
  now: number;
}

type OrderCobro = 'paid' | 'pending' | 'overdue' | 'void';

function orderCobro(o: WholesaleOrderSummary, now: number): OrderCobro {
  if (o.status === 'CANCELLED') return 'void';
  if (o.paymentStatus === 'PAID') return 'paid';
  if (o.dueDate != null && new Date(`${o.dueDate}T12:00:00`).getTime() < now) return 'overdue';
  return 'pending';
}

const COBRO_LABEL: Record<OrderCobro, string> = {
  paid: 'Pagado',
  pending: 'Pendiente',
  overdue: 'Vencido',
  void: 'Anulado',
};

const orderDateFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });

interface ActivityItem {
  tone: 'done' | 'ok' | 'pending' | 'overdue';
  label: string;
  when: string;
}

/** Actividad derivada de datos reales (sin inventar eventos). */
function buildActivity(c: CustomerView, now: number): ActivityItem[] {
  const items: ActivityItem[] = [];
  if (c.lastOrderAt !== null) {
    items.push({ tone: 'done', label: 'Último pedido', when: relOrderDate(c.lastOrderAt, now) });
  }
  if (c.overdue > 0) {
    items.push({ tone: 'overdue', label: 'Saldo vencido', when: fmtEur(c.overdue) });
  } else if (c.balance > 0) {
    items.push({ tone: 'pending', label: 'Saldo pendiente', when: fmtEur(c.balance) });
  } else {
    items.push({ tone: 'ok', label: 'Sin deuda pendiente', when: 'al día' });
  }
  if (c.priceList) {
    items.push({ tone: 'done', label: 'Tarifa asignada', when: c.priceList.name });
  }
  items.push({ tone: 'done', label: 'Alta de cliente', when: fmtFullDate(c.createdAt) });
  return items;
}

export function CustomerDetail({
  customer,
  orders,
  ordersLoading,
  collectingId,
  onCollect,
  onEdit,
  onDelete,
  now,
}: CustomerDetailProps) {
  if (!customer) {
    return (
      <div className="cust-detail" data-testid="b2b-customer-detail">
        <div className="ventas-detail-blank">
          <Users size={22} aria-hidden="true" />
          <span className="ventas-detail-blank-title">Selecciona un cliente</span>
          <span className="ventas-detail-blank-text">
            Elige un cliente de la lista para ver su ficha: cartera, crédito y pedidos.
          </span>
        </div>
      </div>
    );
  }

  const c = customer;
  const ticket = c.orderCount > 0 ? c.billed12m / c.orderCount : 0;
  const limit = c.creditLimit === null ? null : Number(c.creditLimit);
  const available = limit === null ? null : limit - c.balance;
  const usedPct =
    limit !== null && limit > 0
      ? Math.min(100, Math.max(0, Math.round((c.balance / limit) * 100)))
      : 0;
  const barTone = usedPct >= 90 ? 'danger' : usedPct >= 70 ? 'warning' : 'brand';
  const saldoTone = balanceTone(c);

  const stats: Array<{ label: string; value: string; tone?: string }> = [
    { label: 'Facturado 12m', value: fmtEur(c.billed12m) },
    { label: 'Pedidos', value: String(c.orderCount) },
    { label: 'Ticket medio', value: fmtEur(ticket) },
    {
      label: 'Saldo',
      value: c.balance > 0 ? fmtEur(c.balance) : '0 €',
      tone: c.overdue > 0 ? 'danger' : c.balance > 0 ? 'plain' : 'ok',
    },
  ];

  const meta: Array<{ label: string; value: string }> = [
    { label: 'Email', value: c.email ?? '—' },
    { label: 'Teléfono', value: c.phone ?? '—' },
    { label: 'Dirección', value: c.address ?? '—' },
    { label: 'Tarifa', value: c.priceList?.name ?? 'PVP' },
    { label: 'Forma de pago', value: paymentTermsLabel(c.paymentTerms) },
    { label: 'Comercial', value: c.salesRep ?? '—' },
  ];

  const activity = buildActivity(c, now);

  return (
    <div className="cust-detail" data-testid="b2b-customer-detail">
      <div className="cust-detail-head">
        <div className="cust-detail-id">
          <span className="cust-avatar cust-avatar--lg" aria-hidden="true">
            {initials(c.name)}
          </span>
          <div className="cust-detail-titles">
            <div className="cust-detail-name-row">
              <span className="cust-detail-name" data-testid="b2b-customer-detail-name">
                {c.name}
              </span>
              {/* Solo marcamos el estado cuando es relevante (inactivo); la píldora
                  «Activo» en todos los clientes era ruido redundante. */}
              {!c.active && (
                <span className="cust-badge" data-tone="off">
                  <span className="cust-badge-dot" />
                  Inactivo
                </span>
              )}
            </div>
            <div className="cust-detail-sub">
              {c.nif && <span className="cust-num">{c.nif}</span>}
              {(c.tags ?? []).map((t) => (
                <span key={t} className="cust-badge" data-tone={tagTone(t)}>
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="cust-detail-actions">
          <button
            type="button"
            className="ventas-btn ventas-btn--icon"
            onClick={() => onEdit(c)}
            data-testid="b2b-customer-edit"
            title="Editar"
            aria-label="Editar cliente"
          >
            <Pencil size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="ventas-btn ventas-btn--icon cust-del-btn"
            onClick={() => onDelete(c)}
            data-testid="b2b-customer-delete"
            title="Borrar"
            aria-label="Borrar cliente"
          >
            <Trash2 size={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="cust-detail-body">
        <div className="cust-stats">
          {stats.map((s) => (
            <div className="cust-stat" key={s.label}>
              <span className="cust-stat-label">{s.label}</span>
              <span className="cust-stat-value cust-num" data-tone={s.tone ?? 'plain'}>
                {s.value}
              </span>
            </div>
          ))}
        </div>

        <div>
          <h4 className="ventas-section-title">Datos del cliente</h4>
          <div className="ventas-meta-grid">
            {meta.map((m) => (
              <div className="ventas-meta" key={m.label}>
                <span className="ventas-meta-label">{m.label}</span>
                <span className="ventas-meta-value">{m.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="cust-credit">
          <div className="cust-credit-head">
            <span className="cust-credit-title">Cartera y crédito</span>
            <span className="cust-credit-terms">
              Forma de pago · {paymentTermsLabel(c.paymentTerms)}
            </span>
          </div>
          <div className="cust-credit-body">
            <div className="cust-credit-grid">
              <div className="cust-credit-cell">
                <span className="cust-credit-label">Saldo actual</span>
                <span className="cust-credit-value cust-num" data-tone={saldoTone}>
                  {c.balance > 0 ? fmtEur(c.balance) : '0 €'}
                </span>
              </div>
              <div className="cust-credit-cell">
                <span className="cust-credit-label">Vencido</span>
                <span
                  className="cust-credit-value cust-num"
                  data-tone={c.overdue > 0 ? 'danger' : 'muted'}
                >
                  {c.overdue > 0 ? fmtEur(c.overdue) : '0 €'}
                </span>
              </div>
              <div className="cust-credit-cell">
                <span className="cust-credit-label">Límite de crédito</span>
                <span className="cust-credit-value cust-num">
                  {limit === null ? '—' : fmtEur(limit)}
                </span>
              </div>
              <div className="cust-credit-cell">
                <span className="cust-credit-label">Disponible</span>
                <span
                  className="cust-credit-value cust-num"
                  data-tone={available !== null && available < 0 ? 'danger' : 'plain'}
                >
                  {available === null ? '—' : fmtEur(available)}
                </span>
              </div>
            </div>
            {limit !== null && limit > 0 && (
              <>
                <div className="cust-credit-track">
                  <span
                    className="cust-credit-fill"
                    data-tone={barTone}
                    style={{ width: `${usedPct}%` }}
                  />
                </div>
                <span className="cust-credit-note">
                  {usedPct}% del crédito utilizado
                  {available !== null && ` · ${fmtEur(available)} disponible`}
                </span>
              </>
            )}
          </div>
        </div>

        <div>
          <div className="cust-orders-head">
            <h4 className="ventas-section-title">Pedidos recientes</h4>
            <span className="cust-orders-total">{c.orderCount} en total</span>
          </div>
          <div className="cust-orders" data-testid="b2b-customer-orders">
            {ordersLoading ? (
              <div className="cust-orders-loading">Cargando pedidos…</div>
            ) : orders.length === 0 ? (
              <div className="cust-orders-loading">Sin pedidos todavía.</div>
            ) : (
              orders.map((o) => {
                const cobro = orderCobro(o, now);
                const canCollect = cobro === 'pending' || cobro === 'overdue';
                return (
                  <div className="cust-order" key={o.id}>
                    <span className="cust-order-id cust-num">#{o.id.slice(0, 8)}</span>
                    <span className="cust-order-date cust-num">
                      {orderDateFmt.format(new Date(o.createdAt))}
                    </span>
                    <span className="cust-badge" data-tone={cobro}>
                      {COBRO_LABEL[cobro]}
                    </span>
                    <span className="cust-order-amount cust-num">{fmtEur(Number(o.total))}</span>
                    {canCollect ? (
                      <button
                        type="button"
                        className="cust-order-collect"
                        onClick={() => onCollect(o.id)}
                        disabled={collectingId === o.id}
                        data-testid="b2b-order-collect"
                      >
                        {collectingId === o.id ? '…' : 'Cobrar'}
                      </button>
                    ) : (
                      <span className="cust-order-collect-spacer" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div>
          <h4 className="ventas-section-title">Actividad</h4>
          <div className="ventas-timeline">
            {activity.map((a, i) => (
              <div className="ventas-tl-item" key={a.label}>
                <div className="ventas-tl-rail">
                  <span className="ventas-tl-dot" data-tone={a.tone} aria-hidden="true">
                    •
                  </span>
                  {i < activity.length - 1 && <span className="ventas-tl-line" />}
                </div>
                <div className="ventas-tl-body">
                  <span className="ventas-tl-label">{a.label}</span>
                  <span className="ventas-tl-when">{a.when}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
