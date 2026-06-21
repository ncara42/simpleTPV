import { describe, expect, it } from 'vitest';

import { type LayoutPref, migrateLayoutPref } from './dashboard-layout.js';

describe('migrateLayoutPref (regresión F0: presets → personalizado)', () => {
  it('copia la composición del preset antiguo a personalizado y fija el preset', () => {
    const ventasLayout = { lg: [{ i: 'kpi-today', x: 0, y: 0, w: 2, h: 1 }] };
    const before: LayoutPref = {
      preset: 'ventas',
      layouts: { ventas: ventasLayout },
      freeLayouts: { ventas: [] },
      freeViews: { ventas: { panX: 5, panY: 10, zoom: 1.2 } },
    };

    const after = migrateLayoutPref(before);

    expect(after.preset).toBe('personalizado');
    // La composición del preset antiguo queda como 'personalizado'.
    expect(after.layouts?.personalizado).toEqual(ventasLayout);
    expect(after.freeViews?.personalizado).toEqual({ panX: 5, panY: 10, zoom: 1.2 });
    // No destructiva: las claves antiguas se conservan.
    expect(after.layouts?.ventas).toEqual(ventasLayout);
  });

  it('es idempotente: ya en personalizado devuelve el mismo objeto sin tocar', () => {
    const layout: LayoutPref = {
      preset: 'personalizado',
      layouts: { personalizado: { lg: [] } },
    };
    expect(migrateLayoutPref(layout)).toBe(layout);
  });

  it('sin preset devuelve el mismo objeto (no hay nada que migrar)', () => {
    const layout: LayoutPref = { chartKinds: { sales: 'line' } };
    expect(migrateLayoutPref(layout)).toBe(layout);
  });

  it('no machaca un personalizado existente cuando el preset antiguo no tiene datos', () => {
    // El usuario estaba en 'equipo' sin layout propio, pero sí tenía un personalizado.
    const personalizado = { lg: [{ i: 'kpi-margin', x: 1, y: 0, w: 2, h: 1 }] };
    const before: LayoutPref = {
      preset: 'equipo',
      layouts: { personalizado },
    };
    const after = migrateLayoutPref(before);
    expect(after.preset).toBe('personalizado');
    // Cae al personalizado existente (?? layouts.personalizado), no lo borra.
    expect(after.layouts?.personalizado).toEqual(personalizado);
  });
});
