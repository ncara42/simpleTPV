import type { SaleTicket } from '@simpletpv/auth';

import { buildQrData } from './lib/escpos.js';

// Renderiza el ticket-resumen de una venta en formato monoespaciado tipo recibo:
// cabecera de organización/tienda, líneas, totales, desglose de IVA y pago.

function eur(value: string): string {
  return `${Number(value).toFixed(2)} €`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TicketView({ ticket }: { ticket: SaleTicket }) {
  const isCash = ticket.paymentMethod === 'CASH';
  const discountTotal = Number(ticket.discountTotal);

  return (
    <div className="ticket" data-testid="ticket-view">
      <header className="ticket-head">
        <strong className="ticket-org" data-testid="ticket-org">
          {ticket.organization.name}
        </strong>
        {ticket.organization.nif && (
          <span className="ticket-nif">NIF {ticket.organization.nif}</span>
        )}
        <span className="ticket-store" data-testid="ticket-store">
          {ticket.store.name} ({ticket.store.code})
        </span>
      </header>

      <div className="ticket-meta">
        <span data-testid="ticket-number">{ticket.ticketNumber}</span>
        <span data-testid="ticket-date">{formatDate(ticket.createdAt)}</span>
      </div>

      <hr className="ticket-sep" />

      <ul className="ticket-lines" data-testid="ticket-lines">
        {ticket.lines.map((l, idx) => (
          <li key={idx} className="ticket-line">
            <span className="ticket-line-name">{l.name}</span>
            <span className="ticket-line-calc">
              {Number(l.qty)} × {eur(l.unitPrice)}
              {Number(l.discountPct) > 0 ? (
                <span className="ticket-line-disc"> −{Number(l.discountPct)}%</span>
              ) : Number(l.discountAmt) > 0 ? (
                <span className="ticket-line-disc"> −{eur(l.discountAmt)}</span>
              ) : null}
            </span>
            <span className="ticket-line-total">{eur(l.lineTotal)}</span>
          </li>
        ))}
      </ul>

      <hr className="ticket-sep" />

      <div className="ticket-totals">
        <div className="ticket-row">
          <span>Subtotal</span>
          <span data-testid="ticket-subtotal">{eur(ticket.subtotal)}</span>
        </div>
        {discountTotal > 0 && (
          <div className="ticket-row ticket-discount">
            <span>Descuento</span>
            <span data-testid="ticket-discount">−{eur(ticket.discountTotal)}</span>
          </div>
        )}
      </div>

      <div className="ticket-taxes" data-testid="ticket-taxes">
        {ticket.taxBreakdown.map((t) => (
          <div key={t.taxRate} className="ticket-row ticket-tax">
            <span>IVA {Number(t.taxRate)}%</span>
            <span>
              base {eur(t.base)} · cuota {eur(t.cuota)}
            </span>
          </div>
        ))}
      </div>

      <hr className="ticket-sep" />

      <div className="ticket-row ticket-total">
        <span>Total</span>
        <strong data-testid="ticket-total">{eur(ticket.total)}</strong>
      </div>

      <div className="ticket-pay">
        <div className="ticket-row">
          <span>Método</span>
          <span data-testid="ticket-method">{isCash ? 'Efectivo' : 'Tarjeta'}</span>
        </div>
        {isCash && ticket.cashGiven !== null && (
          <div className="ticket-row">
            <span>Entregado</span>
            <span data-testid="ticket-cash-given">{eur(ticket.cashGiven)}</span>
          </div>
        )}
        {isCash && ticket.cashChange !== null && (
          <div className="ticket-row ticket-change">
            <span>Cambio</span>
            <span data-testid="ticket-change">{eur(ticket.cashChange)}</span>
          </div>
        )}
      </div>

      <hr className="ticket-sep" />

      {/* QR / enlace de cotejo VeriFactu (#50). En impresora térmica se imprime
          como QR (comando ESC/POS); en pantalla mostramos el enlace de cotejo. */}
      <div className="ticket-verifactu" data-testid="ticket-verifactu">
        <span className="ticket-vf-label">VeriFactu · cotejo AEAT</span>
        <a
          className="ticket-vf-link"
          href={buildQrData(ticket.organization.nif, ticket.ticketNumber, ticket.total)}
          data-testid="ticket-qr"
        >
          {buildQrData(ticket.organization.nif, ticket.ticketNumber, ticket.total)}
        </a>
      </div>
    </div>
  );
}
