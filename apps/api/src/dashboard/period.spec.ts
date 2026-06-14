import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { comparisonStarts, deltaPct, previousRange, resolvePeriod } from './period.js';

// `now` fijo: jueves 2026-05-28 15:30 hora local. Las funciones son puras y
// reciben este `now`, así que los tests no dependen del reloj real.
const NOW = new Date(2026, 4, 28, 15, 30, 0); // mes 4 = mayo

describe('resolvePeriod', () => {
  it('today: desde las 00:00 de hoy hasta las 00:00 de mañana', () => {
    const { from, to } = resolvePeriod('today', NOW);
    expect(from).toEqual(new Date(2026, 4, 28, 0, 0, 0, 0));
    expect(to).toEqual(new Date(2026, 4, 29, 0, 0, 0, 0));
  });

  it('yesterday: el día anterior completo', () => {
    const { from, to } = resolvePeriod('yesterday', NOW);
    expect(from).toEqual(new Date(2026, 4, 27, 0, 0, 0, 0));
    expect(to).toEqual(new Date(2026, 4, 28, 0, 0, 0, 0));
  });

  it('week: desde el lunes de esta semana hasta mañana (28 may = jueves → lunes 25)', () => {
    const { from, to } = resolvePeriod('week', NOW);
    expect(from).toEqual(new Date(2026, 4, 25, 0, 0, 0, 0));
    expect(to).toEqual(new Date(2026, 4, 29, 0, 0, 0, 0));
  });

  it('week: si hoy es domingo, el lunes es 6 días atrás', () => {
    const sunday = new Date(2026, 4, 31, 10, 0, 0); // domingo 31 may 2026
    const { from } = resolvePeriod('week', sunday);
    expect(from).toEqual(new Date(2026, 4, 25, 0, 0, 0, 0)); // lunes 25
  });

  it('month: desde el día 1 del mes hasta mañana', () => {
    const { from, to } = resolvePeriod('month', NOW);
    expect(from).toEqual(new Date(2026, 4, 1, 0, 0, 0, 0));
    expect(to).toEqual(new Date(2026, 4, 29, 0, 0, 0, 0));
  });

  it('custom: rango semiabierto con `to` inclusivo (suma 1 día)', () => {
    const { from, to } = resolvePeriod('custom', NOW, { from: '2026-05-01', to: '2026-05-15' });
    expect(from).toEqual(new Date(2026, 4, 1, 0, 0, 0, 0));
    expect(to).toEqual(new Date(2026, 4, 16, 0, 0, 0, 0)); // 15 + 1
  });

  it('custom sin from/to lanza BadRequest', () => {
    expect(() => resolvePeriod('custom', NOW)).toThrow(BadRequestException);
    expect(() => resolvePeriod('custom', NOW, { from: '2026-05-01' })).toThrow(BadRequestException);
  });

  it('custom con to anterior a from lanza BadRequest', () => {
    expect(() => resolvePeriod('custom', NOW, { from: '2026-05-15', to: '2026-05-01' })).toThrow(
      BadRequestException,
    );
  });
});

describe('previousRange', () => {
  it('today → el día anterior completo (misma duración, desplazado atrás)', () => {
    const today = resolvePeriod('today', NOW);
    const prev = previousRange(today);
    expect(prev.from).toEqual(new Date(2026, 4, 27, 0, 0, 0, 0));
    expect(prev.to).toEqual(new Date(2026, 4, 28, 0, 0, 0, 0));
  });

  it('week → la semana inmediatamente anterior (misma longitud)', () => {
    const week = resolvePeriod('week', NOW); // lun 25 → vie 29 (4 días)
    const prev = previousRange(week);
    const durationMs = week.to.getTime() - week.from.getTime();
    expect(prev.to.getTime()).toBe(week.from.getTime());
    expect(prev.from.getTime()).toBe(week.from.getTime() - durationMs);
  });
});

describe('comparisonStarts', () => {
  it('day: hoy 00:00 vs ayer 00:00, corte a la misma hora transcurrida', () => {
    const { currentStart, previousStart, previousSameElapsed } = comparisonStarts('day', NOW);
    expect(currentStart).toEqual(new Date(2026, 4, 28, 0, 0, 0, 0));
    expect(previousStart).toEqual(new Date(2026, 4, 27, 0, 0, 0, 0));
    // 15:30 transcurridas desde medianoche → ayer 27 a las 15:30.
    expect(previousSameElapsed).toEqual(new Date(2026, 4, 27, 15, 30, 0, 0));
  });

  it('month: día 1 del mes vs día 1 del mes anterior, mismo tiempo transcurrido', () => {
    const { currentStart, previousStart, previousSameElapsed } = comparisonStarts('month', NOW);
    expect(currentStart).toEqual(new Date(2026, 4, 1, 0, 0, 0, 0)); // 1 may
    expect(previousStart).toEqual(new Date(2026, 3, 1, 0, 0, 0, 0)); // 1 abr
    // Transcurrido = 28 may 15:30 − 1 may 00:00 = 27d 15h30m → desde 1 abr.
    const elapsedMs = NOW.getTime() - currentStart.getTime();
    expect(previousSameElapsed.getTime()).toBe(previousStart.getTime() + elapsedMs);
  });

  it('year: 1 ene de este año vs 1 ene del anterior, mismo tiempo transcurrido', () => {
    const { currentStart, previousStart, previousSameElapsed } = comparisonStarts('year', NOW);
    expect(currentStart).toEqual(new Date(2026, 0, 1, 0, 0, 0, 0));
    expect(previousStart).toEqual(new Date(2025, 0, 1, 0, 0, 0, 0));
    const elapsedMs = NOW.getTime() - currentStart.getTime();
    expect(previousSameElapsed.getTime()).toBe(previousStart.getTime() + elapsedMs);
  });
});

describe('deltaPct', () => {
  it('calcula el delta porcentual', () => {
    expect(deltaPct(150, 100)).toBe(50);
    expect(deltaPct(50, 100)).toBe(-50);
    expect(deltaPct(100, 100)).toBe(0);
  });

  it('devuelve null si el valor previo es 0 (evita división por cero)', () => {
    expect(deltaPct(100, 0)).toBeNull();
    expect(deltaPct(0, 0)).toBeNull();
  });
});
