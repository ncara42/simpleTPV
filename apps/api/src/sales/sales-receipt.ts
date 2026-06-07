/**
 * Renderizado del DOCUMENTO FISCAL imprimible de una venta (#123): factura
 * simplificada / ticket en HTML autocontenido (estilos embebidos, incluido
 * `@media print`). Función pura, sin acceso a BD ni a tenant: recibe los datos
 * ya cargados por `SalesService.loadTicketData` y devuelve el HTML. Vive aquí,
 * separada de la orquestación, para poder probarla de forma aislada.
 *
 * El servidor es la FUENTE DE VERDAD del documento fiscal. El TPV lo descarga
 * tal cual (modo real) y lo imprime/descarga; en modo demo lo replica en cliente
 * (`apps/tpv/src/lib/receipt.ts`, mirror documentado).
 *
 * SEGURIDAD: todo texto dinámico (nombre de organización/tienda, nombres de
 * producto) lo introduce el propio personal del tenant, así que SIEMPRE se
 * escapa con `escapeHtml` antes de interpolarlo para evitar XSS almacenado al
 * abrir el documento.
 */

// Forma de los datos que produce `SalesService.loadTicketData` (idéntica a la
// salida de `getTicket`). Los Decimal de Prisma llegan como Decimal o string
// según el driver; `num` los normaliza. `createdAt` es un Date.
export interface ReceiptData {
  organization: { name: string; nif: string | null };
  store: { name: string; code: string };
  ticketNumber: string;
  createdAt: Date;
  lines: Array<{
    name: string;
    qty: number | string;
    unitPrice: number | string;
    discountPct: number | string;
    discountAmt: number | string | null;
    lineTotal: number | string;
  }>;
  subtotal: number | string;
  discountTotal: number | string;
  total: number | string;
  paymentMethod: string;
  cashGiven: number | string | null;
  cashChange: number | string | null;
  taxBreakdown: Array<{ taxRate: number; base: number; cuota: number }>;
}

// URL pública de cotejo de la AEAT para el QR/enlace VeriFactu. Misma fórmula
// que el cliente (`apps/tpv/src/lib/escpos.ts` buildQrData): reproducible aquí a
// partir de los datos del ticket. Cuando VeriFactu (#63) esté activo, este enlace
// se sustituirá por el QR/hash real encadenado.
const AEAT_COTEJO_URL = 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR';

function num(v: number | string | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Importe en euros con formato español: coma decimal y 2 decimales ("24,90 €").
// Formateo manual (no Intl) para que la salida sea determinista en cualquier CI.
export function eur(v: number | string | null | undefined): string {
  return `${num(v).toFixed(2).replace('.', ',')} €`;
}

// Fecha en formato español dd/mm/aaaa hh:mm, anclada a Europe/Madrid para que sea
// correcta (hora local del negocio) y, a la vez, determinista sea cual sea la TZ
// del host (Node 22 trae ICU completo → la zona pin funciona en CI).
export function formatDateEs(date: Date): string {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

// Escapa los 5 caracteres peligrosos en contexto HTML (texto y atributos).
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function paymentLabel(method: string): string {
  if (method === 'CASH') return 'Efectivo';
  if (method === 'CARD') return 'Tarjeta';
  // Defensa en profundidad: paymentMethod está acotado por enum en el DTO, pero
  // si en el futuro llega un valor libre se escapa antes de interpolarlo.
  return escapeHtml(method);
}

function buildCotejoUrl(nif: string | null, ticketNumber: string, total: number | string): string {
  const params = new URLSearchParams({
    nif: nif ?? '',
    numserie: ticketNumber,
    importe: num(total).toFixed(2),
  });
  return `${AEAT_COTEJO_URL}?${params.toString()}`;
}

function renderLineRows(lines: ReceiptData['lines']): string {
  return lines
    .map((l) => {
      const discount =
        num(l.discountPct) > 0
          ? `−${num(l.discountPct)}%`
          : num(l.discountAmt) > 0
            ? `−${eur(l.discountAmt)}`
            : '—';
      return `<tr>
            <td class="concept">${escapeHtml(l.name)}</td>
            <td class="num">${num(l.qty)}</td>
            <td class="num">${eur(l.unitPrice)}</td>
            <td class="num">${discount}</td>
            <td class="num">${eur(l.lineTotal)}</td>
          </tr>`;
    })
    .join('\n');
}

function renderTaxRows(taxBreakdown: ReceiptData['taxBreakdown']): string {
  return taxBreakdown
    .map(
      (t) => `<tr>
            <td>IVA ${t.taxRate}%</td>
            <td class="num">${eur(t.base)}</td>
            <td class="num">${eur(t.cuota)}</td>
          </tr>`,
    )
    .join('\n');
}

/**
 * Devuelve el documento HTML completo (factura simplificada) de la venta.
 * Autocontenido: lleva sus propios estilos (pantalla + impresión), así que se
 * puede abrir/imprimir/descargar sin depender del CSS del TPV.
 */
export function renderReceiptHtml(data: ReceiptData): string {
  const isCash = data.paymentMethod === 'CASH';
  const discountTotal = num(data.discountTotal);
  const cotejoUrl = buildCotejoUrl(data.organization.nif, data.ticketNumber, data.total);

  const nifLine = data.organization.nif
    ? `<span class="org-nif">NIF ${escapeHtml(data.organization.nif)}</span>`
    : '';

  const discountRow =
    discountTotal > 0
      ? `<div class="total-row"><span>Descuento</span><span class="num">−${eur(data.discountTotal)}</span></div>`
      : '';

  const cashRows =
    isCash && data.cashGiven !== null
      ? `<div class="total-row"><span>Entregado</span><span class="num">${eur(data.cashGiven)}</span></div>
        <div class="total-row"><span>Cambio</span><span class="num">${eur(data.cashChange)}</span></div>`
      : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Factura simplificada ${escapeHtml(data.ticketNumber)}</title>
<style>
  :root {
    --ink: #1a1a1a;
    --muted: #6b7280;
    --border: #d1d5db;
    --brand: #166534;
  }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: var(--ink);
    margin: 0;
    padding: 24px;
    font-size: 14px;
    line-height: 1.45;
  }
  .receipt { max-width: 720px; margin: 0 auto; }
  header.doc-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid var(--brand);
    padding-bottom: 12px;
    margin-bottom: 16px;
  }
  .doc-title { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); margin: 0 0 4px; }
  .org-name { font-size: 20px; font-weight: 700; }
  .org-nif { display: block; color: var(--muted); font-size: 13px; }
  .doc-meta { text-align: right; font-size: 13px; color: var(--muted); }
  .doc-meta strong { display: block; color: var(--ink); font-size: 15px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th, td { padding: 6px 8px; text-align: left; }
  thead th { border-bottom: 1px solid var(--border); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
  tbody td { border-bottom: 1px solid #f0f0f0; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.concept { width: 50%; }
  .totals { margin-left: auto; width: 280px; }
  .total-row { display: flex; justify-content: space-between; padding: 3px 8px; }
  .total-row.grand { border-top: 2px solid var(--ink); margin-top: 6px; padding-top: 8px; font-size: 18px; font-weight: 700; }
  .num { font-variant-numeric: tabular-nums; }
  .tax-table { margin-top: 4px; }
  .tax-table caption { text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); padding: 0 8px; }
  .pay { margin-top: 16px; font-size: 13px; }
  footer.cotejo {
    margin-top: 24px;
    padding-top: 12px;
    border-top: 1px dashed var(--border);
    text-align: center;
    font-size: 11px;
    color: var(--muted);
    word-break: break-all;
  }
  footer.cotejo a { color: var(--brand); }
  @media print {
    body { padding: 0; font-size: 12px; }
    .receipt { max-width: none; }
    @page { margin: 12mm; }
  }
</style>
</head>
<body>
<main class="receipt" data-testid="receipt-doc">
  <header class="doc-head">
    <div>
      <p class="doc-title">Factura simplificada</p>
      <span class="org-name">${escapeHtml(data.organization.name)}</span>
      ${nifLine}
    </div>
    <div class="doc-meta">
      <strong>${escapeHtml(data.ticketNumber)}</strong>
      <span>${escapeHtml(data.store.name)} (${escapeHtml(data.store.code)})</span>
      <span>${formatDateEs(data.createdAt)}</span>
    </div>
  </header>

  <table class="lines">
    <thead>
      <tr>
        <th class="concept">Concepto</th>
        <th class="num">Cant.</th>
        <th class="num">P. unit.</th>
        <th class="num">Dto.</th>
        <th class="num">Importe</th>
      </tr>
    </thead>
    <tbody>
${renderLineRows(data.lines)}
    </tbody>
  </table>

  <div class="totals">
    <div class="total-row"><span>Subtotal</span><span class="num">${eur(data.subtotal)}</span></div>
    ${discountRow}
    <div class="total-row grand"><span>Total</span><span class="num">${eur(data.total)}</span></div>
  </div>

  <table class="tax-table">
    <caption>Desglose de IVA</caption>
    <thead>
      <tr><th>Tipo</th><th class="num">Base</th><th class="num">Cuota</th></tr>
    </thead>
    <tbody>
${renderTaxRows(data.taxBreakdown)}
    </tbody>
  </table>

  <div class="pay">
    <div class="total-row"><span>Método de pago</span><span>${paymentLabel(data.paymentMethod)}</span></div>
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
