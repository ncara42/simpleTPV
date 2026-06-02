import type { VerifactuRecord } from '@simpletpv/auth';

import { DEMO_VERIFACTU } from '../demo/demoData.js';

export type { VerifactuRecord };

export function listVerifactu(status?: string): Promise<VerifactuRecord[]> {
  const rows = status ? DEMO_VERIFACTU.filter((r) => r.status === status) : DEMO_VERIFACTU;
  return Promise.resolve(rows);
}
export function retryVerifactu(_id: string): Promise<{ ok: true }> {
  return Promise.resolve({ ok: true });
}
