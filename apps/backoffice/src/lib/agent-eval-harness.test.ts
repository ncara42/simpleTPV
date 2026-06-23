import { describe, expect, it } from 'vitest';

import {
  ENDPOINT_FIELDS,
  EVAL_NEGATIVE_REQUESTS,
  EVAL_REQUESTS,
  EVAL_THRESHOLD,
  hasDataComposition,
  validateComposition,
} from './agent-eval-harness.js';
import type { CanvasOp } from './chat.js';
import { BLOCK_IDS } from './dashboard-blocks.js';
import { WIDGETABLE_ENDPOINTS } from './dashboard-pieces.js';

const widget = (widgetId: string, genericSpec?: CanvasOp['genericSpec']): CanvasOp => ({
  op: 'add_widget',
  widgetId,
  ...(genericSpec ? { genericSpec } : {}),
});

describe('agent-eval-harness — validación determinista (#226)', () => {
  it('cada bloque del catálogo es una composición VÁLIDA', () => {
    for (const id of BLOCK_IDS) {
      const report = validateComposition([widget(id)]);
      expect(report.valid, `${id} debería validar: ${JSON.stringify(report.violations)}`).toBe(
        true,
      );
    }
  });

  it('un gen:panel con endpoint/campos reales valida', () => {
    const panel = widget('gen:panel', {
      kind: 'panel',
      recipe: 'kpiRow+oneChart',
      slots: {
        kpis: [{ piece: 'kpiTile', endpoint: '/dashboard/sales-kpis', value_field: 'revenue' }],
        charts: [
          {
            piece: 'rankBarList',
            endpoint: '/dashboard/sales-by-store',
            label_field: 'storeName',
            value_field: 'revenue',
            format: 'eur',
          },
        ],
      },
    } as CanvasOp['genericSpec']);
    expect(validateComposition([panel]).valid).toBe(true);
  });

  it('detecta widget desconocido', () => {
    const r = validateComposition([widget('block:no-existe')]);
    expect(r.valid).toBe(false);
    expect(r.violations[0]!.code).toBe('unknown-widget');
  });

  it('detecta endpoint fuera de allowlist, pieza desconocida y campo inexistente', () => {
    const panel = widget('gen:panel', {
      kind: 'panel',
      slots: {
        charts: [
          { piece: 'rankBarList', endpoint: '/secret/dump', label_field: 'x', value_field: 'y' },
          { piece: 'pieMagic', endpoint: '/dashboard/sales-by-store', value_field: 'revenue' },
          {
            piece: 'comparisonBars',
            endpoint: '/dashboard/sales-by-store',
            label_field: 'storeName',
            value_field: 'noSuchField',
          },
        ],
      },
    } as CanvasOp['genericSpec']);
    const codes = validateComposition([panel]).violations.map((v) => v.code);
    expect(codes).toContain('endpoint-not-allowlisted');
    expect(codes).toContain('unknown-piece');
    expect(codes).toContain('unknown-field');
  });

  it('detecta saturación (> máx piezas)', () => {
    const charts = Array.from({ length: 13 }, () => ({
      piece: 'comparisonBars',
      endpoint: '/dashboard/sales-by-store',
      label_field: 'storeName',
      value_field: 'revenue',
    }));
    const r = validateComposition([
      widget('gen:panel', { kind: 'panel', slots: { charts } } as CanvasOp['genericSpec']),
    ]);
    expect(r.violations.some((v) => v.code === 'oversaturated')).toBe(true);
  });

  it('ignora ops que no son add_widget (formas/texto/notas)', () => {
    const r = validateComposition([{ op: 'add_text', text: 'hola' }, { op: 'arrange' }]);
    expect(r.valid).toBe(true);
    expect(r.widgetCount).toBe(0);
  });
});

describe('agent-eval-harness — integridad del conjunto de peticiones', () => {
  it('los ids son únicos y los prompts no vacíos', () => {
    const ids = EVAL_REQUESTS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of EVAL_REQUESTS) expect(r.prompt.trim().length).toBeGreaterThan(0);
  });

  it('cada señal esperada referencia un endpoint o bloque REAL', () => {
    for (const req of EVAL_REQUESTS) {
      expect(req.expectsAnyOf.length).toBeGreaterThan(0);
      for (const signal of req.expectsAnyOf) {
        const real = signal.startsWith('block:')
          ? (BLOCK_IDS as readonly string[]).includes(signal)
          : WIDGETABLE_ENDPOINTS.has(signal);
        expect(real, `señal irreal en ${req.id}: ${signal}`).toBe(true);
      }
    }
  });

  it('el mapa de campos cubre exactamente la allowlist de endpoints', () => {
    expect(new Set(Object.keys(ENDPOINT_FIELDS))).toEqual(WIDGETABLE_ENDPOINTS);
  });

  it('el umbral del gate es estricto (valid 100 %, score >= 8)', () => {
    expect(EVAL_THRESHOLD.minValidPct).toBe(100);
    expect(EVAL_THRESHOLD.minMeanScore).toBeGreaterThanOrEqual(8);
  });

  // Anthropic, *Demystifying evals*: cada tarea con una reference solution que PASE todos los
  // graders ancla la validez del propio grader. Si una reference falla, o el grader está roto o la
  // referencia no es realmente válida — ambos son bugs que este test atrapa de forma determinista.
  it('cada solución de referencia pasa el grador determinista', () => {
    const withRef = EVAL_REQUESTS.filter((r) => r.reference && r.reference.length > 0);
    expect(withRef.length, 'debe haber al menos una reference solution').toBeGreaterThan(0);
    for (const req of withRef) {
      const report = validateComposition(req.reference!);
      expect(
        report.valid,
        `reference inválida en ${req.id}: ${JSON.stringify(report.violations)}`,
      ).toBe(true);
    }
  });

  it('los casos negativos tienen ids únicos y prompt no vacío', () => {
    const ids = EVAL_NEGATIVE_REQUESTS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(EVAL_NEGATIVE_REQUESTS.length).toBeGreaterThan(0);
    for (const r of EVAL_NEGATIVE_REQUESTS) expect(r.prompt.trim().length).toBeGreaterThan(0);
  });

  it('hasDataComposition distingue composición de datos de meras anotaciones', () => {
    expect(hasDataComposition([widget('block:sales-overview')])).toBe(true);
    expect(hasDataComposition([widget('gen:panel')])).toBe(true);
    expect(
      hasDataComposition([
        { op: 'add_text', text: 'nota' },
        { op: 'add_note', content: 'x' },
      ]),
    ).toBe(false);
    expect(hasDataComposition([])).toBe(false);
  });
});
