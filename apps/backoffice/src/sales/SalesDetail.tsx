import type { SaleTicket } from '@simpletpv/auth';
import { Check, FileText, X } from 'lucide-react';

import type { SalesViewRow } from '../lib/admin.js';
import { fmtEur } from '../lib/format.js';
import {
  avatarBg,
  avatarOf,
  CHANNEL_LABELS,
  type CobroStatus,
  cobroStatusOf,
  customerOf,
  METHOD_LABELS,
} from './sales-facets.js';

const dateFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${dateFmt.format(d)} · ${timeFmt.format(d)}`;
}

// Vencimiento `YYYY-MM-DD` → «10 jul» (mediodía para evitar saltos de zona horaria).
function fmtDueDate(due: string): string {
  return dateFmt.format(new Date(`${due}T12:00:00`));
}

interface TimelineItem {
  tone: 'done' | 'ok' | 'pending' | 'overdue' | 'void';
  icon: string;
  label: string;
  when: string;
  line: boolean;
}

function buildTimeline(row: SalesViewRow, cobro: CobroStatus): TimelineItem[] {
  const emitted = fmtDateTime(row.createdAt);
  const isCredit = row.channel === 'B2B' || row.channel === 'ONLINE';
  const items: TimelineItem[] = [
    { tone: 'done', icon: '✓', label: 'Venta emitida', when: emitted, line: true },
    {
      tone: 'done',
      icon: '✓',
      label: isCredit ? 'Factura enviada' : 'Ticket entregado',
      when: emitted,
      line: true,
    },
  ];
  if (cobro === 'paid') {
    items.push({
      tone: 'ok',
      icon: '✓',
      label: 'Cobro confirmado',
      when: row.paidAt
        ? fmtDateTime(row.paidAt)
        : isCredit
          ? 'Pago conciliado'
          : 'En el momento de la venta',
      line: false,
    });
  } else if (cobro === 'pending') {
    items.push({
      tone: 'pending',
      icon: '•',
      label: 'Pendiente de cobro',
      when: row.dueDate ? `Vence el ${fmtDueDate(row.dueDate)}` : 'Sin vencimiento',
      line: false,
    });
  } else if (cobro === 'overdue') {
    items.push({
      tone: 'overdue',
      icon: '!',
      label: 'Pago vencido',
      when: row.dueDate ? `Vencía el ${fmtDueDate(row.dueDate)}` : 'Vencido',
      line: false,
    });
  } else {
    items.push({ tone: 'void', icon: '×', label: 'Venta anulada', when: 'Anulada', line: false });
  }
  return items;
}

function CobroIcon({ cobro }: { cobro: CobroStatus }) {
  if (cobro === 'paid')
    return (
      <span className="ventas-cobro-icon" data-cobro="paid">
        <Check size={11} strokeWidth={3} />
      </span>
    );
  if (cobro === 'pending')
    return (
      <span className="ventas-cobro-icon" data-cobro="pending">
        <span className="ventas-cobro-dot" />
      </span>
    );
  if (cobro === 'overdue')
    return (
      <span className="ventas-cobro-icon" data-cobro="overdue">
        <X size={11} strokeWidth={3} />
      </span>
    );
  return (
    <span className="ventas-cobro-icon" data-cobro="void">
      <X size={11} strokeWidth={3} />
    </span>
  );
}

interface SalesDetailProps {
  row: SalesViewRow | null;
  ticket: SaleTicket | null;
  ticketLoading: boolean;
  collecting: boolean;
  onCollect: (saleId: string) => void;
  onViewInvoice: (saleId: string) => void;
}

export function SalesDetail({
  row,
  ticket,
  ticketLoading,
  collecting,
  onCollect,
  onViewInvoice,
}: SalesDetailProps) {
  if (!row) {
    return (
      <div className="ventas-detail" data-testid="sales-detail">
        <div className="ventas-detail-blank">
          <FileText size={22} aria-hidden="true" />
          <span className="ventas-detail-blank-title">Selecciona una venta</span>
          <span className="ventas-detail-blank-text">
            Elige un ticket de la lista para ver su ficha y el seguimiento del cobro.
          </span>
        </div>
      </div>
    );
  }

  const cobro = cobroStatusOf(row);
  const avatar = avatarOf(row);
  const timeline = buildTimeline(row, cobro);
  const articleCount = ticket?.lines.length ?? null;
  const canCollect = cobro === 'pending' || cobro === 'overdue';
  const lineCount =
    articleCount === null
      ? '—'
      : String(ticket?.lines.reduce((n, l) => n + Math.round(Number(l.qty)), 0) ?? articleCount);

  const meta: Array<{ label: string; value: string }> = [
    { label: 'Fecha', value: fmtDateTime(row.createdAt) },
    { label: 'Canal', value: CHANNEL_LABELS[row.channel] ?? row.channel },
    { label: 'Tienda', value: row.storeName },
    { label: 'Vendedor', value: row.sellerName },
    { label: 'Método de pago', value: METHOD_LABELS[row.paymentMethod] ?? row.paymentMethod },
    { label: 'Artículos', value: lineCount },
  ];

  return (
    <div className="ventas-detail" data-testid="sales-detail">
      <div className="ventas-detail-head">
        <div className="ventas-detail-id">
          <span
            className="ventas-avatar ventas-avatar--lg"
            style={{ ['--avatar-bg' as string]: avatarBg(avatar.tone) }}
            aria-hidden="true"
          >
            {avatar.initials}
          </span>
          <div className="ventas-detail-titles">
            <span className="ventas-detail-name" data-testid="sales-detail-name">
              {customerOf(row)}
            </span>
            <span className="ventas-detail-meta-line">
              <span className="ventas-ticket">#{row.ticketNumber}</span> ·{' '}
              {CHANNEL_LABELS[row.channel] ?? row.channel} · {row.storeName}
            </span>
          </div>
        </div>
        <div className="ventas-detail-amount">
          <span className={`ventas-detail-total${cobro === 'void' ? ' is-void' : ''}`}>
            {fmtEur(Number(row.total))}
          </span>
          <CobroIcon cobro={cobro} />
        </div>
      </div>

      <div className="ventas-detail-body">
        <div className="ventas-meta-grid">
          {meta.map((m) => (
            <div className="ventas-meta" key={m.label}>
              <span className="ventas-meta-label">{m.label}</span>
              <span className="ventas-meta-value">{m.value}</span>
            </div>
          ))}
        </div>

        <div>
          <h4 className="ventas-section-title">Desglose</h4>
          <div className="ventas-breakdown">
            {ticketLoading || !ticket ? (
              <div className="ventas-breakdown-loading">Cargando desglose…</div>
            ) : (
              <>
                {ticket.lines.map((line, i) => (
                  <div className="ventas-line" key={`${line.name}-${i}`}>
                    <span className="ventas-line-main">
                      <span className="ventas-line-name">{line.name}</span>
                      <span className="ventas-line-qty">
                        {Number(line.qty)} × {fmtEur(Number(line.unitPrice))}
                      </span>
                    </span>
                    <span className="ventas-line-amount">{fmtEur(Number(line.lineTotal))}</span>
                  </div>
                ))}
                <div className="ventas-line-total">
                  <span className="ventas-line-total-label">Total</span>
                  <span className="ventas-line-total-value">{fmtEur(Number(ticket.total))}</span>
                </div>
              </>
            )}
          </div>
        </div>

        <div>
          <h4 className="ventas-section-title">Seguimiento del cobro</h4>
          <div className="ventas-timeline">
            {timeline.map((t, i) => (
              <div className="ventas-tl-item" key={t.label}>
                <div className="ventas-tl-rail">
                  <span className="ventas-tl-dot" data-tone={t.tone} aria-hidden="true">
                    {t.icon}
                  </span>
                  {t.line && i < timeline.length - 1 && <span className="ventas-tl-line" />}
                </div>
                <div className="ventas-tl-body">
                  <span className="ventas-tl-label">{t.label}</span>
                  <span className="ventas-tl-when">{t.when}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="ventas-actions">
          {canCollect && (
            <button
              type="button"
              className="ventas-btn ventas-btn--primary"
              onClick={() => onCollect(row.id)}
              disabled={collecting}
              data-testid="sales-collect"
            >
              {collecting ? 'Registrando…' : 'Registrar cobro'}
            </button>
          )}
          <button
            type="button"
            className="ventas-btn"
            onClick={() => onViewInvoice(row.id)}
            data-testid="sales-view-invoice"
          >
            Ver factura
          </button>
        </div>
      </div>
    </div>
  );
}
