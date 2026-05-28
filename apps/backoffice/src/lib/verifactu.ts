import type { VerifactuRecord } from '@simpletpv/auth';

import { api } from './auth.js';

export type { VerifactuRecord };

export function listVerifactu(status?: string): Promise<VerifactuRecord[]> {
  return api.get<VerifactuRecord[]>('/verifactu/records', { status: status || undefined });
}

export function retryVerifactu(id: string): Promise<{ ok: true }> {
  return api.post<{ ok: true }>(`/verifactu/records/${id}/retry`);
}
