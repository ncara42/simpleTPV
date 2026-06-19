import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getWidgetSpec } from '../widgets/registry.js';
import type { FreeElement, FreeShape, LayoutPref } from './dashboard-layout.js';
import { useDashboardStore } from './dashboard-store.js';

const store = () => useDashboardStore.getState();
const PRESET = 'personalizado';

function freeOf(): FreeElement[] {
  return store().layout.freeLayouts?.[PRESET] ?? [];
}
function gridLg() {
  return store().layout.layouts?.[PRESET]?.lg ?? [];
}

beforeEach(() => {
  vi.useFakeTimers();
  useDashboardStore.setState({ layout: {}, editing: false, hydrated: false });
  store().setPersister(null);
});

afterEach(() => {
  store().setPersister(null);
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('hidratación y persistencia', () => {
  it('hydrate siembra el layout, marca hydrated y NO persiste', () => {
    const spy = vi.fn();
    store().setPersister(spy);
    store().hydrate({ mode: 'free' });
    vi.advanceTimersByTime(1000);
    expect(store().layout.mode).toBe('free');
    expect(store().hydrated).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('setLayout persiste con debounce de 500ms', () => {
    const spy = vi.fn();
    store().setPersister(spy);
    store().setLayout({ mode: 'grid' });
    vi.advanceTimersByTime(499);
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ mode: 'grid' });
  });

  it('debouncea varias escrituras en un solo PUT con el último snapshot', () => {
    const spy = vi.fn();
    store().setPersister(spy);
    store().setLayout({ mode: 'grid' });
    vi.advanceTimersByTime(200);
    store().setLayout({ mode: 'free' });
    vi.advanceTimersByTime(500);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ mode: 'free' });
  });

  it('flushPersist fuerza el PUT pendiente y cancela el debounce', () => {
    const spy = vi.fn();
    store().setPersister(spy);
    store().setLayout({ mode: 'grid' });
    store().flushPersist();
    expect(spy).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('estado UI', () => {
  it('setEditing alterna el modo Personalizar', () => {
    store().setEditing(true);
    expect(store().editing).toBe(true);
    store().setEditing(false);
    expect(store().editing).toBe(false);
  });

  it('setMode cambia el modo y sale de la edición', () => {
    store().setEditing(true);
    const r = store().setMode('free');
    expect(r.accepted).toBe(true);
    expect(store().layout.mode).toBe('free');
    expect(store().editing).toBe(false);
  });
});

describe('addWidget (catálogo)', () => {
  it('coloca un widget del catálogo en la rejilla (modo grid por defecto)', () => {
    const r = store().addWidget('kpi-today');
    expect(r.accepted).toBe(true);
    expect(gridLg().map((i) => i.i)).toContain('kpi-today');
  });

  it('coloca un widget del catálogo en el lienzo libre', () => {
    store().hydrate({ mode: 'free' });
    const r = store().addWidget('dash-bars', 'center');
    expect(r.accepted).toBe(true);
    expect(freeOf().some((e) => e.kind === 'widget' && e.widgetId === 'dash-bars')).toBe(true);
  });

  it('rechaza un widgetId desconocido (el LLM lo alucinó)', () => {
    const r = store().addWidget('dash-profits');
    expect(r.accepted).toBe(false);
    expect(r.reason).toMatch(/desconocido/);
  });

  it('rechaza un widget duplicado en el lienzo libre', () => {
    store().hydrate({ mode: 'free' });
    store().addWidget('dash-bars');
    const r = store().addWidget('dash-bars');
    expect(r.accepted).toBe(false);
    expect(r.reason).toMatch(/ya está/);
  });
});

describe('formas / texto / notas (solo modo Libre)', () => {
  it('añade una forma en modo Libre', () => {
    store().hydrate({ mode: 'free' });
    const r = store().addShape('rect', 'top-left');
    expect(r.accepted).toBe(true);
    const shapes = freeOf().filter((e): e is FreeShape => e.kind === 'shape');
    expect(shapes).toHaveLength(1);
    expect(shapes[0]!.shape).toBe('rect');
  });

  it('rechaza una forma en modo Cuadrícula', () => {
    const r = store().addShape('rect');
    expect(r.accepted).toBe(false);
    expect(r.reason).toMatch(/Libre/);
  });

  it('rechaza una forma desconocida', () => {
    store().hydrate({ mode: 'free' });
    const r = store().addShape('hexagon');
    expect(r.accepted).toBe(false);
  });

  it('añade texto con su contenido en modo Libre', () => {
    store().hydrate({ mode: 'free' });
    const r = store().addText('Hola', 'center');
    expect(r.accepted).toBe(true);
    const text = freeOf().find((e) => e.kind === 'text');
    expect(text && 'text' in text ? text.text : '').toBe('Hola');
  });

  it('rechaza texto y notas en modo Cuadrícula', () => {
    expect(store().addText('x').accepted).toBe(false);
    expect(store().addNote('x').accepted).toBe(false);
  });

  it('añade una nota en modo Libre', () => {
    store().hydrate({ mode: 'free' });
    const r = store().addNote('nota', 'bottom-right');
    expect(r.accepted).toBe(true);
    expect(freeOf().some((e) => e.kind === 'note')).toBe(true);
  });
});

describe('insight / widgets genéricos', () => {
  it('addInsight registra el genérico, lo persiste en genericWidgets y lo coloca', () => {
    const r = store().addInsight('**Ventas al alza**', 'Resumen');
    expect(r.accepted).toBe(true);
    const ids = Object.keys(store().layout.genericWidgets ?? {});
    expect(ids).toHaveLength(1);
    const id = ids[0]!;
    expect(id.startsWith('gen:')).toBe(true);
    const spec = store().layout.genericWidgets![id]!;
    expect(spec.type).toBe('insight');
    expect(spec.params?.markdown).toBe('**Ventas al alza**');
    expect(getWidgetSpec(id)).toBeDefined();
    expect(gridLg().map((i) => i.i)).toContain(id);
  });

  it('applyCanvasOp add_widget con genericSpec normaliza y coloca', () => {
    const r = store().applyCanvasOp({
      op: 'add_widget',
      position: 'top-left',
      genericSpec: { type: 'bar', endpoint: '/sales/by-family' },
    });
    expect(r.accepted).toBe(true);
    const ids = Object.keys(store().layout.genericWidgets ?? {});
    expect(ids).toHaveLength(1);
    expect(store().layout.genericWidgets![ids[0]!]!.type).toBe('bar');
  });

  it('applyCanvasOp rechaza un genericSpec de tipo no válido', () => {
    const r = store().applyCanvasOp({
      op: 'add_widget',
      genericSpec: { type: 'pyramid', endpoint: '/x' },
    });
    expect(r.accepted).toBe(false);
    expect(r.reason).toMatch(/no válido/);
  });
});

describe('remove / clear / arrange', () => {
  it('removeElement quita un elemento del lienzo libre', () => {
    store().hydrate({ mode: 'free' });
    store().addWidget('dash-bars');
    const id = freeOf()[0]!.id;
    const r = store().removeElement(id);
    expect(r.accepted).toBe(true);
    expect(freeOf()).toHaveLength(0);
  });

  it('removeElement rechaza un id inexistente', () => {
    const r = store().removeElement('nope');
    expect(r.accepted).toBe(false);
    expect(r.reason).toMatch(/no encontrado/);
  });

  it('removeElement desregistra un genérico del registry', () => {
    store().addInsight('x');
    const id = Object.keys(store().layout.genericWidgets ?? {})[0]!;
    store().removeElement(id);
    expect(store().layout.genericWidgets?.[id]).toBeUndefined();
    expect(getWidgetSpec(id)).toBeUndefined();
  });

  it('clearCanvas vacía rejilla, lienzo y genéricos', () => {
    store().hydrate({ mode: 'free' });
    store().addWidget('dash-bars');
    store().addInsight('x');
    const r = store().clearCanvas();
    expect(r.accepted).toBe(true);
    expect(freeOf()).toHaveLength(0);
    expect(Object.keys(store().layout.genericWidgets ?? {})).toHaveLength(0);
  });

  it('arrange reorganiza el lienzo libre', () => {
    store().hydrate({ mode: 'free' });
    store().addWidget('dash-bars', 'bottom-right');
    store().addWidget('dash-family', 'bottom-right');
    const r = store().arrange();
    expect(r.accepted).toBe(true);
    // autoArrangeFree coloca el primero en el origen del flujo.
    expect(freeOf().some((e) => e.x === 0 && e.y === 0)).toBe(true);
  });

  it('arrange es no-op aceptado en modo Cuadrícula', () => {
    const before = store().layout;
    const r = store().arrange();
    expect(r.accepted).toBe(true);
    expect(store().layout).toBe(before);
  });
});

describe('applyCanvasOp (despacho)', () => {
  it('despacha cada tipo de operación', () => {
    store().hydrate({ mode: 'free' });
    expect(store().applyCanvasOp({ op: 'add_widget', widgetId: 'kpi-today' }).accepted).toBe(true);
    expect(store().applyCanvasOp({ op: 'add_shape', kind: 'arrow' }).accepted).toBe(true);
    expect(store().applyCanvasOp({ op: 'add_text', text: 'hi' }).accepted).toBe(true);
    expect(store().applyCanvasOp({ op: 'add_note', text: 'n' }).accepted).toBe(true);
    expect(store().applyCanvasOp({ op: 'arrange' }).accepted).toBe(true);
    expect(store().applyCanvasOp({ op: 'set_mode', mode: 'grid' }).accepted).toBe(true);
    expect(store().layout.mode).toBe('grid');
    expect(store().applyCanvasOp({ op: 'clear_canvas' }).accepted).toBe(true);
  });

  it('rechaza operaciones con campos obligatorios ausentes', () => {
    expect(store().applyCanvasOp({ op: 'add_widget' } as { op: 'add_widget' }).accepted).toBe(
      false,
    );
    expect(store().applyCanvasOp({ op: 'remove_element' }).accepted).toBe(false);
    expect(store().applyCanvasOp({ op: 'set_mode' }).accepted).toBe(false);
  });

  it('add_widget sin genericSpec ni widgetId se rechaza', () => {
    const layoutBefore: LayoutPref = store().layout;
    const r = store().applyCanvasOp({ op: 'add_widget' });
    expect(r.accepted).toBe(false);
    expect(store().layout).toBe(layoutBefore);
  });
});
