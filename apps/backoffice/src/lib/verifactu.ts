import type { VerifactuRecord } from '@simpletpv/auth';

import { api } from './auth.js';

export type { VerifactuRecord };

// Resumen de salud de la cola VeriFactu para el panel de cumplimiento. Derivado de
// los propios registros (no hay endpoint de estadísticas dedicado).
export interface VerifactuSummary {
  sentToday: number;
  queued: number;
  failed: number;
  lastSentAt: string | null; // ISO del envío más reciente, o null si no hay envíos
}

// Registros VeriFactu del tenant (GET /verifactu/records), filtrables por estado.
export function listVerifactuRecords(status?: string): Promise<VerifactuRecord[]> {
  return api.get<VerifactuRecord[]>('/verifactu/records', status ? { status } : {});
}

// Resume los registros en los KPIs del panel. Puro (recibe `todayKey` = YYYY-MM-DD del
// día local) para ser determinista y testeable sin depender del reloj.
export function summarizeVerifactu(
  records: readonly VerifactuRecord[],
  todayKey: string,
): VerifactuSummary {
  let sentToday = 0;
  let queued = 0;
  let failed = 0;
  let lastSentAt: string | null = null;

  for (const r of records) {
    if (r.status === 'PENDING') {
      queued += 1;
    } else if (r.status === 'FAILED') {
      failed += 1;
    } else if (r.status === 'SENT' && r.sentAt) {
      if (r.sentAt.slice(0, 10) === todayKey) {
        sentToday += 1;
      }
      if (!lastSentAt || r.sentAt > lastSentAt) {
        lastSentAt = r.sentAt;
      }
    }
  }

  return { sentToday, queued, failed, lastSentAt };
}
