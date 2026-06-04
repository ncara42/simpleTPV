import type { VerifactuService } from '../../src/verifactu/verifactu.service.js';

// Stub de VerifactuService para los tests de integración que crean ventas pero
// no verifican VeriFactu: ni tocan BD/cola, solo devuelven dummies. Así esos
// tests no arrancan BullMQ ni dependen del flujo de facturación. Cubre tanto el
// flujo en-tx (createRecordInTx + enqueueSend, SEC-02) como el autónomo (recordFor).
export function stubVerifactu(): VerifactuService {
  const dummy = { id: 'stub', hash: 'stub-hash', qrData: 'stub-qr' };
  return {
    recordFor: async () => dummy,
    createRecordInTx: async () => dummy,
    enqueueSend: async () => {},
  } as unknown as VerifactuService;
}
