import { ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import {
  computeWorked,
  deriveStatus,
  localDayKey,
  nextStateOrThrow,
  statusFromLastType,
  totalWorkedMs,
} from './time-clock.compute.js';

const MIN = 60 * 1000;

describe('nextStateOrThrow', () => {
  it('acepta la secuencia OUT→IN→BREAK→IN→OUT', () => {
    expect(nextStateOrThrow('OUT', 'CLOCK_IN')).toBe('IN');
    expect(nextStateOrThrow('IN', 'BREAK_START')).toBe('BREAK');
    expect(nextStateOrThrow('BREAK', 'BREAK_END')).toBe('IN');
    expect(nextStateOrThrow('IN', 'CLOCK_OUT')).toBe('OUT');
  });

  it('permite cerrar la jornada estando en pausa (BREAK→OUT)', () => {
    expect(nextStateOrThrow('BREAK', 'CLOCK_OUT')).toBe('OUT');
  });

  it('rechaza la doble entrada', () => {
    expect(() => nextStateOrThrow('IN', 'CLOCK_IN')).toThrow(ConflictException);
  });

  it('rechaza salir sin estar fichado', () => {
    expect(() => nextStateOrThrow('OUT', 'CLOCK_OUT')).toThrow(/No tienes ningún fichaje activo/);
  });

  it('distingue el motivo de una pausa inválida', () => {
    expect(() => nextStateOrThrow('OUT', 'BREAK_START')).toThrow(/Debes fichar entrada/);
    expect(() => nextStateOrThrow('BREAK', 'BREAK_START')).toThrow(/Ya estás en una pausa/);
    expect(() => nextStateOrThrow('IN', 'BREAK_END')).toThrow(/No tienes ninguna pausa activa/);
  });
});

describe('statusFromLastType', () => {
  it('deriva el estado del último evento', () => {
    expect(statusFromLastType(null)).toBe('OUT');
    expect(statusFromLastType('CLOCK_IN')).toBe('IN');
    expect(statusFromLastType('BREAK_START')).toBe('BREAK');
    expect(statusFromLastType('BREAK_END')).toBe('IN');
    expect(statusFromLastType('CLOCK_OUT')).toBe('OUT');
  });
});

describe('deriveStatus', () => {
  it('reduce una secuencia completa', () => {
    expect(deriveStatus([{ type: 'CLOCK_IN' }, { type: 'BREAK_START' }])).toBe('BREAK');
    expect(deriveStatus([{ type: 'CLOCK_IN' }, { type: 'CLOCK_OUT' }])).toBe('OUT');
  });
});

describe('computeWorked', () => {
  const t = (min: number) => new Date(2026, 5, 5, 8, min, 0).toISOString();

  it('descuenta las pausas del tiempo trabajado', () => {
    // IN 8:00, BREAK 8:30 (30 min trabajados), END 8:45 (15 min pausa), OUT 9:15 (30 min más)
    const entries = [
      { type: 'CLOCK_IN' as const, createdAt: t(0) },
      { type: 'BREAK_START' as const, createdAt: t(30) },
      { type: 'BREAK_END' as const, createdAt: t(45) },
      { type: 'CLOCK_OUT' as const, createdAt: t(75) },
    ];
    const r = computeWorked(entries, t(75));
    expect(r.workedMs).toBe(60 * MIN); // 30 + 30
    expect(r.breakMs).toBe(15 * MIN);
    expect(r.runningSince).toBeNull();
  });

  it('deja el segmento en curso fuera de workedMs y expone runningSince', () => {
    const entries = [{ type: 'CLOCK_IN' as const, createdAt: t(0) }];
    const r = computeWorked(entries, t(20));
    expect(r.workedMs).toBe(0); // segmento abierto no se suma
    expect(r.runningSince).toBe(t(0));
    expect(totalWorkedMs(r, t(20))).toBe(20 * MIN); // total = cerrado + en curso
  });

  it('contabiliza una pausa en curso contra ahora', () => {
    const entries = [
      { type: 'CLOCK_IN' as const, createdAt: t(0) },
      { type: 'BREAK_START' as const, createdAt: t(30) },
    ];
    const r = computeWorked(entries, t(40));
    expect(r.workedMs).toBe(30 * MIN);
    expect(r.breakMs).toBe(10 * MIN); // pausa abierta cerrada contra t(40)
    expect(r.runningSince).toBeNull();
  });
});

describe('localDayKey', () => {
  it('formatea YYYY-MM-DD en hora local', () => {
    expect(localDayKey(new Date(2026, 5, 5, 23, 30))).toBe('2026-06-05');
  });
});
