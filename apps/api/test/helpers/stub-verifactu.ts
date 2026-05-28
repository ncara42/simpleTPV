import type { VerifactuService } from '../../src/verifactu/verifactu.service.js';

// Stub de VerifactuService para los tests de integración que crean ventas pero
// no verifican VeriFactu: recordFor no toca BD ni cola, solo devuelve un dummy.
// Así esos tests no arrancan BullMQ ni dependen del flujo de facturación.
export function stubVerifactu(): VerifactuService {
  return {
    recordFor: async () => ({ id: 'stub', hash: 'stub-hash', qrData: 'stub-qr' }),
  } as unknown as VerifactuService;
}
