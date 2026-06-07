import type { SaleTicket } from '@simpletpv/auth';

import { buildQrData } from './escpos.js';

// Documento fiscal imprimible/descargable de la venta (#123) en el lado cliente.
//
// La FUENTE DE VERDAD es el servidor (`apps/api/src/sales/sales-receipt.ts`,
// GET /sales/:id/receipt). En modo REAL el TPV descarga ese HTML tal cual. En
// modo DEMO no hay backend, así que `renderReceiptHtml` lo replica aquí a partir
// del `SaleTicket` ya cargado — mirror del renderer del servidor (mismo patrón
// que `buildQrData` en escpos.ts, que replica la URL de cotejo del backend).
//
// SEGURIDAD: el nombre de organización/tienda y los nombres de producto los
// introduce el personal del tenant, así que se escapan con `escapeHtml` antes de
// interpolarlos para evitar XSS al abrir el documento.

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Importe en euros con formato español (coma decimal, 2 decimales): "24,90 €".
function eur(value: string | number | null): string {
  const n = Number(value);
  return `${(Number.isFinite(n) ? n : 0).toFixed(2).replace('.', ',')} €`;
}

function formatDateEs(iso: string): string {
  // timeZone anclado a Europe/Madrid (igual que el servidor): hora local del
  // negocio y consistente sea cual sea la zona del navegador.
  return new Date(iso).toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function paymentLabel(method: string): string {
  if (method === 'CASH') return 'Efectivo';
  if (method === 'CARD') return 'Tarjeta';
  return escapeHtml(method);
}

/**
 * Renderiza el documento HTML (factura simplificada) a partir del ticket-resumen.
 * Mirror del renderer del servidor; se usa SOLO en modo demo. Autocontenido:
 * estilos embebidos (pantalla + impresión).
 */
export function renderReceiptHtml(ticket: SaleTicket): string {
  const isCash = ticket.paymentMethod === 'CASH';
  const discountTotal = Number(ticket.discountTotal);
  const cotejoUrl = buildQrData(ticket.organization.nif, ticket.ticketNumber, ticket.total);

  const nifLine = ticket.organization.nif
    ? `<span class="org-nif">NIF ${escapeHtml(ticket.organization.nif)}</span>`
    : '';

  const lineRows = ticket.lines
    .map((l) => {
      const discount =
        Number(l.discountPct) > 0
          ? `−${Number(l.discountPct)}%`
          : Number(l.discountAmt) > 0
            ? `−${eur(l.discountAmt)}`
            : '—';
      return `<tr><td class="concept">${escapeHtml(l.name)}</td><td class="num">${Number(l.qty)}</td><td class="num">${eur(l.unitPrice)}</td><td class="num">${discount}</td><td class="num">${eur(l.lineTotal)}</td></tr>`;
    })
    .join('');

  const taxRows = ticket.taxBreakdown
    .map(
      (t) =>
        `<tr><td>IVA ${Number(t.taxRate)}%</td><td class="num">${eur(t.base)}</td><td class="num">${eur(t.cuota)}</td></tr>`,
    )
    .join('');

  const discountRow =
    discountTotal > 0
      ? `<div class="total-row"><span>Descuento</span><span class="num">−${eur(ticket.discountTotal)}</span></div>`
      : '';

  const cashRows =
    isCash && ticket.cashGiven !== null
      ? `<div class="total-row"><span>Entregado</span><span class="num">${eur(ticket.cashGiven)}</span></div><div class="total-row"><span>Cambio</span><span class="num">${eur(ticket.cashChange)}</span></div>`
      : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Factura simplificada ${escapeHtml(ticket.ticketNumber)}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 24px; font-size: 14px; }
  .receipt { max-width: 720px; margin: 0 auto; }
  header.doc-head { display: flex; justify-content: space-between; border-bottom: 2px solid #166534; padding-bottom: 12px; margin-bottom: 16px; }
  .doc-title { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #6b7280; margin: 0 0 4px; }
  .org-name { font-size: 20px; font-weight: 700; }
  .org-nif { display: block; color: #6b7280; font-size: 13px; }
  .doc-meta { text-align: right; font-size: 13px; color: #6b7280; }
  .doc-meta strong { display: block; color: #1a1a1a; font-size: 15px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th, td { padding: 6px 8px; text-align: left; }
  thead th { border-bottom: 1px solid #d1d5db; font-size: 12px; text-transform: uppercase; color: #6b7280; }
  tbody td { border-bottom: 1px solid #f0f0f0; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.concept { width: 50%; }
  .totals { margin-left: auto; width: 280px; }
  .total-row { display: flex; justify-content: space-between; padding: 3px 8px; }
  .total-row.grand { border-top: 2px solid #1a1a1a; margin-top: 6px; padding-top: 8px; font-size: 18px; font-weight: 700; }
  .tax-table caption { text-align: left; font-size: 12px; text-transform: uppercase; color: #6b7280; padding: 0 8px; }
  .pay { margin-top: 16px; font-size: 13px; }
  footer.cotejo { margin-top: 24px; padding-top: 12px; border-top: 1px dashed #d1d5db; text-align: center; font-size: 11px; color: #6b7280; word-break: break-all; }
  footer.cotejo a { color: #166534; }
  @media print { body { padding: 0; font-size: 12px; } .receipt { max-width: none; } @page { margin: 12mm; } }
</style>
</head>
<body>
<main class="receipt" data-testid="receipt-doc">
  <header class="doc-head">
    <div>
      <p class="doc-title">Factura simplificada</p>
      <span class="org-name">${escapeHtml(ticket.organization.name)}</span>
      ${nifLine}
    </div>
    <div class="doc-meta">
      <strong>${escapeHtml(ticket.ticketNumber)}</strong>
      <span>${escapeHtml(ticket.store.name)} (${escapeHtml(ticket.store.code)})</span>
      <span>${formatDateEs(ticket.createdAt)}</span>
    </div>
  </header>
  <table class="lines">
    <thead><tr><th class="concept">Concepto</th><th class="num">Cant.</th><th class="num">P. unit.</th><th class="num">Dto.</th><th class="num">Importe</th></tr></thead>
    <tbody>${lineRows}</tbody>
  </table>
  <div class="totals">
    <div class="total-row"><span>Subtotal</span><span class="num">${eur(ticket.subtotal)}</span></div>
    ${discountRow}
    <div class="total-row grand"><span>Total</span><span class="num">${eur(ticket.total)}</span></div>
  </div>
  <table class="tax-table">
    <caption>Desglose de IVA</caption>
    <thead><tr><th>Tipo</th><th class="num">Base</th><th class="num">Cuota</th></tr></thead>
    <tbody>${taxRows}</tbody>
  </table>
  <div class="pay">
    <div class="total-row"><span>Método de pago</span><span>${paymentLabel(ticket.paymentMethod)}</span></div>
    ${cashRows}
  </div>
  <footer class="cotejo" data-testid="receipt-cotejo">
    <div>VeriFactu · cotejo AEAT</div>
    <a href="${escapeHtml(cotejoUrl)}">${escapeHtml(cotejoUrl)}</a>
  </footer>
</main>
</body>
</html>`;
}

/**
 * Imprime el documento HTML en un iframe oculto (no toca el DOM/CSS del TPV).
 * Usa `srcdoc` (no el `document.write` deprecado): el navegador carga el HTML en
 * su propio documento y dispara `onload`, momento en que se lanza la impresión.
 * El iframe se autodestruye tras imprimir. La llamada a `print` se omite con
 * seguridad si no existe (jsdom / navegadores sin diálogo).
 */
export function printReceiptHtml(html: string): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  iframe.onload = () => {
    const win = iframe.contentWindow;
    win?.focus?.();
    win?.print?.();
    // Margen para que el navegador capture el contenido antes de retirar el iframe.
    window.setTimeout(() => iframe.remove(), 1000);
  };
  iframe.srcdoc = html;
  document.body.appendChild(iframe);
}

/** Descarga el documento HTML como fichero .html. */
export function downloadReceiptHtml(html: string, filename: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
