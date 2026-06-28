import type { VerifactuRecord } from '@simpletpv/auth';
import { describe, expect, it } from 'vitest';

import { daysUntilDeadline, summarizeVerifactu, verifactuDeadline } from './verifactu.js';

// Registro mínimo: solo los campos que summarizeVerifactu lee. El resto se rellena
// con valores neutros para satisfacer el tipo.
function rec(partial: Partial<VerifactuRecord>): VerifactuRecord {
  return {
    id: partial.id ?? 'r1',
    saleId: null,
    returnId: null,
    type: 'INVOICE',
    status: partial.status ?? 'SENT',
    hash: 'h',
    previousHash: null,
    qrData: null,
    attempts: 0,
    lastError: null,
    sentAt: partial.sentAt ?? null,
    createdAt: partial.createdAt ?? '2026-06-08T00:00:00.000Z',
  };
}

describe('summarizeVerifactu', () => {
  it('cuenta por estado y resuelve el envío más reciente', () => {
    // Arrange
    const today = '2026-06-08';
    const records = [
      rec({ id: 'a', status: 'SENT', sentAt: '2026-06-08T09:00:00.000Z' }),
      rec({ id: 'b', status: 'SENT', sentAt: '2026-06-08T11:30:00.000Z' }),
      rec({ id: 'c', status: 'SENT', sentAt: '2026-06-07T18:00:00.000Z' }), // ayer
      rec({ id: 'd', status: 'PENDING' }),
      rec({ id: 'e', status: 'PENDING' }),
      rec({ id: 'f', status: 'FAILED' }),
    ];

    // Act
    const summary = summarizeVerifactu(records, today);

    // Assert
    expect(summary.sentToday).toBe(2); // a y b son de hoy; c es de ayer
    expect(summary.queued).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.lastSentAt).toBe('2026-06-08T11:30:00.000Z');
  });

  it('lastSentAt es null cuando no hay envíos completados', () => {
    // Arrange
    const records = [rec({ status: 'PENDING' }), rec({ status: 'FAILED' })];

    // Act
    const summary = summarizeVerifactu(records, '2026-06-08');

    // Assert
    expect(summary.sentToday).toBe(0);
    expect(summary.lastSentAt).toBeNull();
  });

  it('ignora SENT sin sentAt (no cuenta ni fija último envío)', () => {
    // Arrange
    const records = [rec({ status: 'SENT', sentAt: null })];

    // Act
    const summary = summarizeVerifactu(records, '2026-06-08');

    // Assert
    expect(summary.sentToday).toBe(0);
    expect(summary.lastSentAt).toBeNull();
  });
});

describe('verifactuDeadline', () => {
  it('sociedades (IS) entran el 1-ene-2027', () => {
    expect(verifactuDeadline('IS')).toBe('2027-01-01');
  });

  it('el resto (OTHERS o sin definir) entra el 1-jul-2027', () => {
    expect(verifactuDeadline('OTHERS')).toBe('2027-07-01');
    expect(verifactuDeadline(null)).toBe('2027-07-01');
  });
});

describe('daysUntilDeadline', () => {
  it('cuenta los días naturales hasta el plazo del tipo de obligado', () => {
    // De 2026-12-02 a 2027-01-01 (IS) hay 30 días.
    expect(daysUntilDeadline('IS', '2026-12-02')).toBe(30);
  });

  it('es negativo cuando el plazo ya pasó', () => {
    expect(daysUntilDeadline('OTHERS', '2027-07-02')).toBe(-1);
  });
});
