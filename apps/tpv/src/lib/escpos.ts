import type { SaleTicket } from '@simpletpv/auth';

// URL de cotejo VeriFactu para el QR (#50). Misma fórmula que el backend
// (verifactu.hash), reproducible en el cliente a partir de los datos del ticket.
export function buildQrData(nif: string | null, ticketNumber: string, total: string): string {
  const base = 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR';
  const params = new URLSearchParams({
    nif: nif ?? '',
    numserie: ticketNumber,
    importe: Number(total).toFixed(2),
  });
  return `${base}?${params.toString()}`;
}

// Comandos ESC/POS básicos.
const ESC = '\x1b';
const GS = '\x1d';
const INIT = `${ESC}@`;
const CENTER = `${ESC}a1`;
const LEFT = `${ESC}a0`;
const BOLD_ON = `${ESC}E1`;
const BOLD_OFF = `${ESC}E0`;
const CUT = `${GS}V0`;

// Comando GS ( k para imprimir un QR con el contenido dado (modelo 2).
function qrCommand(data: string): string {
  const store = (() => {
    const bytes = data.length + 3;
    const pL = bytes & 0xff;
    const pH = (bytes >> 8) & 0xff;
    return `${GS}(k${String.fromCharCode(pL)}${String.fromCharCode(pH)}\x31\x50\x30${data}`;
  })();
  const size = `${GS}(k\x03\x00\x31\x43\x06`; // tamaño del módulo
  const print = `${GS}(k\x03\x00\x31\x51\x30`;
  return size + store + print;
}

// Genera el contenido ESC/POS del ticket (#50). Para impresora térmica real se
// enviaría este string por un puente USB/red; aquí también sirve de fuente para
// el preview. Incluye el QR de cotejo VeriFactu.
export function renderTicketEscPos(ticket: SaleTicket): string {
  const line = (left: string, right: string): string => `${left}  ${right}\n`;
  const qr = buildQrData(ticket.organization.nif, ticket.ticketNumber, ticket.total);
  let out = INIT + CENTER + BOLD_ON + `${ticket.organization.name}\n` + BOLD_OFF;
  if (ticket.organization.nif) {
    out += `NIF ${ticket.organization.nif}\n`;
  }
  out += `${ticket.store.name} (${ticket.store.code})\n`;
  out += LEFT + `${ticket.ticketNumber}\n`;
  out += '--------------------------------\n';
  for (const l of ticket.lines) {
    out += line(`${Number(l.qty)}x ${l.name}`, `${Number(l.lineTotal).toFixed(2)}`);
  }
  out += '--------------------------------\n';
  out += BOLD_ON + line('TOTAL', `${Number(ticket.total).toFixed(2)} EUR`) + BOLD_OFF;
  out += `Pago: ${ticket.paymentMethod === 'CASH' ? 'Efectivo' : 'Tarjeta'}\n`;
  out += CENTER + 'VeriFactu\n' + qrCommand(qr) + LEFT;
  out += CUT;
  return out;
}
