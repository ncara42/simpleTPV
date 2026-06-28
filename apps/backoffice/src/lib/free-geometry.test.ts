import { describe, expect, it } from 'vitest';

import type { FreeElement } from './dashboard-layout.js';
import {
  contentBounds,
  minimapClickToPan,
  minimapProjection,
  offscreenArrow,
  type Rect,
  snapMovingRect,
} from './free-geometry.js';

const widget = (id: string, x: number, y: number, w = 100, h = 100): FreeElement => ({
  kind: 'widget',
  id,
  widgetId: id,
  x,
  y,
  w,
  h,
  z: 0,
});

const viewport = { width: 800, height: 600 };

describe('contentBounds', () => {
  it('devuelve null para un lienzo vacío', () => {
    expect(contentBounds([])).toBeNull();
  });

  it('envuelve todos los elementos', () => {
    const layout = [widget('a', 0, 0, 100, 50), widget('b', 200, 100, 100, 100)];
    expect(contentBounds(layout)).toEqual({ minX: 0, minY: 0, maxX: 300, maxY: 200 });
  });
});

describe('offscreenArrow', () => {
  const bounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };

  it('null cuando el contenido es visible', () => {
    const arrow = offscreenArrow(bounds, { panX: 0, panY: 0, zoom: 1 }, viewport);
    expect(arrow).toBeNull();
  });

  it('null cuando no hay contenido', () => {
    expect(offscreenArrow(null, { panX: 0, panY: 0, zoom: 1 }, viewport)).toBeNull();
  });

  it('apunta a la izquierda cuando el contenido queda fuera por la izquierda', () => {
    // pan muy negativo en X → contenido a la izquierda del viewport.
    const arrow = offscreenArrow(bounds, { panX: -1000, panY: 0, zoom: 1 }, viewport);
    expect(arrow).not.toBeNull();
    expect(arrow!.edge).toBe('left');
    expect(arrow!.x).toBeLessThan(viewport.width / 2);
  });

  it('apunta arriba cuando el contenido queda por encima', () => {
    const arrow = offscreenArrow(bounds, { panX: 0, panY: -1000, zoom: 1 }, viewport);
    expect(arrow!.edge).toBe('top');
    expect(arrow!.y).toBeLessThan(viewport.height / 2);
  });

  it('apunta a la derecha y abajo cuando el contenido queda en esa esquina', () => {
    // contenido muy a la derecha (pan empuja el mundo fuera por la derecha y abajo).
    const arrow = offscreenArrow(bounds, { panX: 2000, panY: 1500, zoom: 1 }, viewport);
    expect(['right', 'bottom']).toContain(arrow!.edge);
    expect(arrow!.x).toBeGreaterThan(viewport.width / 2);
  });
});

describe('minimapProjection', () => {
  it('proyecta items y viewport dentro del minimapa', () => {
    const layout = [widget('a', 0, 0, 200, 200), widget('b', 600, 400, 200, 200)];
    const proj = minimapProjection(layout, { panX: 0, panY: 0, zoom: 1 }, viewport, {
      width: 160,
      height: 120,
    });
    expect(proj.items).toHaveLength(2);
    expect(proj.scale).toBeGreaterThan(0);
    // Todo cae dentro del lienzo del minimapa.
    for (const it of proj.items) {
      expect(it.x).toBeGreaterThanOrEqual(0);
      expect(it.y).toBeGreaterThanOrEqual(0);
      expect(it.x + it.w).toBeLessThanOrEqual(160 + 1e-6);
      expect(it.y + it.h).toBeLessThanOrEqual(120 + 1e-6);
    }
    expect(proj.viewportRect.w).toBeGreaterThan(0);
  });

  it('minimapClickToPan centra el viewport en el punto del mundo pulsado', () => {
    const layout = [widget('a', 0, 0, 200, 200)];
    const view = { panX: 0, panY: 0, zoom: 1 };
    const proj = minimapProjection(layout, view, viewport, { width: 160, height: 120 });
    // Clic en el centro del minimapa → pan que sitúa ese punto del mundo en el centro del viewport.
    const pan = minimapClickToPan(proj, 80, 60, view, viewport);
    const worldX = proj.worldMinX + 80 / proj.scale;
    const screenX = worldX * view.zoom + pan.panX;
    expect(screenX).toBeCloseTo(viewport.width / 2, 5);
  });
});

describe('snapMovingRect (imán)', () => {
  const GAP = 16;
  const other: Rect = { x: 100, y: 100, w: 200, h: 100 }; // vecino fijo

  it('no ajusta nada si está lejos (fuera del umbral)', () => {
    const moving: Rect = { x: 500, y: 500, w: 100, h: 100 };
    const res = snapMovingRect(moving, [other], GAP, 8);
    expect(res).toEqual({ x: 500, y: 500, guides: [] });
  });

  it('alinea el borde izquierdo con el del vecino al acercarse', () => {
    // moving.x = 105 está a 5px del left del vecino (100) → snap a 100.
    const res = snapMovingRect({ x: 105, y: 400, w: 50, h: 50 }, [other], GAP, 8);
    expect(res.x).toBe(100);
    expect(res.guides.some((g) => g.axis === 'x' && g.pos === 100)).toBe(true);
  });

  it('se PEGA a la derecha del vecino manteniendo el margen exacto (gap)', () => {
    // El vecino acaba en x=300; moving.left cerca de 300+gap=316 → debe quedar a 316 (16px de hueco).
    const res = snapMovingRect({ x: 313, y: 100, w: 80, h: 100 }, [other], GAP, 8);
    expect(res.x).toBe(other.x + other.w + GAP); // 316
  });

  it('alinea por eje INDEPENDIENTE (pega a la derecha y alinea arriba a la vez)', () => {
    // x cerca de la adyacencia derecha (316) e y cerca del top del vecino (100).
    const res = snapMovingRect({ x: 314, y: 103, w: 80, h: 100 }, [other], GAP, 8);
    expect(res.x).toBe(316); // pegado con margen
    expect(res.y).toBe(100); // alineado arriba
    expect(res.guides).toHaveLength(2);
  });

  it('no redimensiona: el tamaño del rect movido nunca cambia', () => {
    const moving: Rect = { x: 102, y: 98, w: 123, h: 77 };
    const res = snapMovingRect(moving, [other], GAP, 8);
    // Solo devuelve x/y (+guías); w/h no forman parte del resultado → imposible redimensionar.
    expect(Object.keys(res).sort()).toEqual(['guides', 'x', 'y']);
  });
});
