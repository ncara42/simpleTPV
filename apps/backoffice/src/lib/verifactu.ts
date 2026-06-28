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

// Reintenta (re-encola) un registro fallido (POST /verifactu/records/:id/retry).
export function retryVerifactuRecord(id: string): Promise<{ ok: boolean }> {
  return api.post<{ ok: boolean }>(`/verifactu/records/${id}/retry`);
}

// Modalidad de cumplimiento VERI*FACTU (#156). Debe coincidir con la allowlist del
// backend (crates/domain/src/verifactu/config.rs).
export type VerifactuMode = 'DISABLED' | 'ASSISTED' | 'DIRECT_OWN_CERT' | 'COLLAB_SOCIAL';
export type VerifactuEnvironment = 'preprod' | 'prod';
export type VerifactuObligadoTipo = 'IS' | 'OTHERS';

export interface VerifactuConfig {
  organizationId: string;
  mode: VerifactuMode;
  razonSocial: string | null;
  obligadoTipo: VerifactuObligadoTipo | null;
  exento: boolean;
  exentoMotivo: string | null;
  environment: VerifactuEnvironment;
  createdAt: string;
  updatedAt: string;
}

export interface VerifactuConfigInput {
  mode: VerifactuMode;
  razonSocial?: string | null;
  obligadoTipo?: VerifactuObligadoTipo | null;
  exento?: boolean;
  exentoMotivo?: string | null;
  environment?: VerifactuEnvironment;
}

// Configuración VERI*FACTU del comercio (GET/PUT /verifactu/config). null si aún no
// se ha configurado.
export function getVerifactuConfig(): Promise<VerifactuConfig | null> {
  return api.get<VerifactuConfig | null>('/verifactu/config');
}

export function putVerifactuConfig(input: VerifactuConfigInput): Promise<VerifactuConfig> {
  return api.put<VerifactuConfig>('/verifactu/config', input);
}

// Informe de integridad de la cadena de huellas (GET /verifactu/verify).
export interface ChainReport {
  total: number;
  ok: boolean;
  brokenAt: string | null;
  detail: string | null;
}

export function verifyVerifactuChain(): Promise<ChainReport> {
  return api.get<ChainReport>('/verifactu/verify');
}

// Estado del certificado de cliente (GET /verifactu/certificate). null si no hay.
export interface VerifactuCertStatus {
  subject: string | null;
  validFrom: string | null;
  validTo: string | null;
  createdAt: string;
}

export function getVerifactuCertStatus(): Promise<VerifactuCertStatus | null> {
  return api.get<VerifactuCertStatus | null>('/verifactu/certificate');
}

// Sube el certificado de cliente PEM (PUT /verifactu/certificate). El PEM se cifra
// en el servidor antes de guardarse; nunca se devuelve.
export function putVerifactuCertificate(pem: string, subject?: string): Promise<{ ok: boolean }> {
  return api.put<{ ok: boolean }>('/verifactu/certificate', { pem, subject });
}

// Plazo legal de entrada en vigor de la obligación VERI*FACTU (RD 1007/2023 y
// RD-ley 15/2025): contribuyentes del Impuesto de Sociedades desde el 1-ene-2027; el
// resto (autónomos, IRPF…) desde el 1-jul-2027. Devuelve la fecha clave (YYYY-MM-DD).
export function verifactuDeadline(obligadoTipo: VerifactuObligadoTipo | null): string {
  return obligadoTipo === 'IS' ? '2027-01-01' : '2027-07-01';
}

// Días naturales desde `todayKey` (YYYY-MM-DD) hasta el plazo; negativo si ya pasó.
// Puro para ser determinista en tests (no usa el reloj).
export function daysUntilDeadline(
  obligadoTipo: VerifactuObligadoTipo | null,
  todayKey: string,
): number {
  const MS_DAY = 86_400_000;
  const deadline = Date.parse(`${verifactuDeadline(obligadoTipo)}T00:00:00Z`);
  const today = Date.parse(`${todayKey}T00:00:00Z`);
  return Math.round((deadline - today) / MS_DAY);
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
