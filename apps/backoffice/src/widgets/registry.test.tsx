import { describe, expect, it } from 'vitest';

import type { GenericSpec } from '../lib/dashboard-layout.js';
import { GEIST_WIDGET_IDS } from './geist/meta.js';
import {
  ALL_WIDGET_IDS,
  buildGenericWidgetSpec,
  getWidgetLabel,
  getWidgetSpec,
  registerGenericWidget,
  unregisterGenericWidget,
  WIDGET_REGISTRY,
} from './registry.js';

describe('WIDGET_REGISTRY', () => {
  it('siembra los widgets fijos del catálogo: 2 clásicos (Ventas/Ventas por hora) + los Geist (#264)', () => {
    // Solo los fijos (los genéricos se registran en runtime; los bloques #205 van con prefijo block:).
    const fixed = [...WIDGET_REGISTRY.values()].filter(
      (w) => w.kind !== 'generic' && !w.id.startsWith('block:'),
    );
    const geist = fixed.filter((w) => w.id.startsWith('geist-'));
    const classic = fixed.filter((w) => !w.id.startsWith('geist-'));
    // Tras la migración a los widgets Geist (#264) solo se conservan «Ventas» y «Ventas por hora».
    expect(classic.map((w) => w.id).sort()).toEqual(['dash-bars', 'dash-hour']);
    expect(geist).toHaveLength(GEIST_WIDGET_IDS.length);
    expect(WIDGET_REGISTRY.size).toBeGreaterThanOrEqual(fixed.length);
  });

  it('siembra los bloques pre-cableados (#205) como metadatos block:<id>', () => {
    const blocks = [...WIDGET_REGISTRY.keys()].filter((id) => id.startsWith('block:'));
    expect(blocks).toContain('block:sales-overview');
    expect(blocks).toContain('block:stock-risk');
    expect(WIDGET_REGISTRY.get('block:sales-overview')?.label).toBe('Resumen de ventas');
  });

  it('cada entrada del catálogo tiene label, kind y defaultSize', () => {
    for (const id of ALL_WIDGET_IDS) {
      const spec = WIDGET_REGISTRY.get(id)!;
      expect(spec.label, `falta label en ${id}`).toBeTruthy();
      expect(['kpi', 'panel']).toContain(spec.kind);
      expect(spec.defaultSize.w).toBeGreaterThan(0);
      expect(spec.defaultSize.h).toBeGreaterThan(0);
    }
  });

  it('clasifica los widgets conservados y los Geist como panel (ya no hay kpi-* en el catálogo)', () => {
    expect(WIDGET_REGISTRY.get('dash-bars')!.kind).toBe('panel');
    expect(WIDGET_REGISTRY.get('dash-hour')!.kind).toBe('panel');
    expect(WIDGET_REGISTRY.get('geist-stat-today')!.kind).toBe('panel');
  });
});

describe('getWidgetLabel', () => {
  it('devuelve la etiqueta del catálogo', () => {
    expect(getWidgetLabel('dash-bars')).toBe('Ventas');
  });

  it('cae al id para widgets desconocidos', () => {
    expect(getWidgetLabel('no-existe')).toBe('no-existe');
  });
});

const insightSpec: GenericSpec = {
  type: 'insight',
  endpoint: '',
  title: 'Nota del agente',
  defaultSize: { w: 4, h: 2 },
  params: { markdown: '**hola**' },
};

describe('buildGenericWidgetSpec', () => {
  it('deriva label/kind/defaultSize/render de la GenericSpec', () => {
    const spec = buildGenericWidgetSpec('gen:abc', insightSpec);
    expect(spec.id).toBe('gen:abc');
    expect(spec.label).toBe('Nota del agente');
    expect(spec.kind).toBe('generic');
    expect(spec.defaultSize).toEqual({ w: 4, h: 2 });
    expect(spec.genericSpec).toBe(insightSpec);
    expect(typeof spec.render).toBe('function');
  });
});

describe('registerGenericWidget / unregisterGenericWidget', () => {
  it('registra un genérico recuperable por id y lo borra al desregistrar', () => {
    registerGenericWidget('gen:test-1', insightSpec);
    expect(getWidgetSpec('gen:test-1')?.kind).toBe('generic');
    expect(getWidgetLabel('gen:test-1')).toBe('Nota del agente');

    unregisterGenericWidget('gen:test-1');
    expect(getWidgetSpec('gen:test-1')).toBeUndefined();
  });
});
