import { describe, expect, it } from 'vitest';

import type { FreeElement } from './dashboard-layout.js';
import {
  contentBounds,
  minimapClickToPan,
  minimapProjection,
  offscreenArrow,
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
