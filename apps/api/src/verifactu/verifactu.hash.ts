import { createHash } from 'node:crypto';

// Datos mínimos que entran en la huella de un registro VeriFactu (#47).
export interface VerifactuPayload {
  nif: string | null;
  invoiceNumber: string;
  date: string; // ISO
  total: number;
  type: 'INVOICE' | 'RECTIFICATION';
}

// Huella SHA-256 de un registro encadenada con la del anterior del tenant.
// La cadena es inalterable: cambiar un registro pasado rompe todas las huellas
// siguientes. Función pura, testeable. El formato (campos en orden, separados
// por '|') es estable para que la huella sea reproducible.
export function computeHash(payload: VerifactuPayload, previousHash: string | null): string {
  const parts = [
    previousHash ?? '',
    payload.nif ?? '',
    payload.invoiceNumber,
    payload.date,
    payload.total.toFixed(2),
    payload.type,
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

// URL de cotejo de la AEAT que se codifica en el QR del ticket. En sandbox usa
// el host de pruebas; el formato de query es el del servicio de cotejo VeriFactu.
export function buildQrData(nif: string | null, invoiceNumber: string, total: number): string {
  const base = 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR';
  const params = new URLSearchParams({
    nif: nif ?? '',
    numserie: invoiceNumber,
    importe: total.toFixed(2),
  });
  return `${base}?${params.toString()}`;
}
