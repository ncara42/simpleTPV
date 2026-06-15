import { describe, expect, it } from 'vitest';

import {
  addDraw,
  addNote,
  addShape,
  addText,
  addWidget,
  autoArrangeFree,
  availableWidgets,
  BOARD_COLS,
  bringToFront,
  buildDefaultFreeLayout,
  buildDefaultLayout,
  defaultPanelOrder,
  FREE_COL,
  FREE_GAP,
  FREE_ROW,
  type FreeDraw,
  freeItemSize,
  type FreeShape,
  type FreeText,
  type FreeWidget,
  ITEM_SPECS,
  migrateFreeLayout,
  NOTE_DEFAULT,
  PANEL_CANON,
  presetItemIds,
  PRESETS,
  reconcileFreeLayout,
  reconcileLayout,
  removeElement,
  TEXT_DEFAULT,
} from './dashboard-layout.js';

const ventas = PRESETS.find((p) => p.id === 'ventas')!;

describe('defaultPanelOrder', () => {
  it('preset Ventas: paneles en orden canónico (maquetación), no en el orden del array', () => {
    expect(defaultPanelOrder(ventas)).toEqual([
      'dash-bars',
      'dash-family',
      'rank-sales',
      'dash-hour',
    ]);
  });

  it('preset Inventario: orden canónico', () => {
    const inventario = PRESETS.find((p) => p.id === 'inventario')!;
    expect(defaultPanelOrder(inventario)).toEqual([
      'dash-stockout',
      'rank-rotation',
      'dash-expiring',
      'dash-purchase-orders',
      'dash-rotation',
    ]);
  });

  it('PANEL_CANON no tiene ids duplicados', () => {
    expect(new Set(PANEL_CANON).size).toBe(PANEL_CANON.length);
  });
});

describe('presetItemIds + ITEM_SPECS', () => {
  it('Ventas: tarjetas (en orden de preset) seguidas de paneles (en orden canónico)', () => {
    expect(presetItemIds(ventas)).toEqual([
      'kpi-today',
      'kpi-avg-ticket',
      'kpi-upt',
      'dash-bars',
      'dash-family',
      'rank-sales',
      'dash-hour',
    ]);
  });

  it('cada elemento de cada preset tiene un tamaño en ITEM_SPECS', () => {
    for (const preset of PRESETS) {
      for (const id of presetItemIds(preset)) {
        expect(ITEM_SPECS[id], `falta ITEM_SPECS para ${id}`).toBeDefined();
      }
    }
  });
});

describe('buildDefaultLayout', () => {
  it('Ventas: banda de tarjetas (w2,h1) arriba y paneles fluyendo en filas de 12', () => {
    const layout = buildDefaultLayout(ventas);
    const byId = Object.fromEntries(layout.map((it) => [it.i, it]));
    // Tres KPI de 2 columnas en la fila 0.
    expect(byId['kpi-today']).toEqual({ i: 'kpi-today', x: 0, y: 0, w: 2, h: 1 });
    expect(byId['kpi-avg-ticket']).toEqual({ i: 'kpi-avg-ticket', x: 2, y: 0, w: 2, h: 1 });
    expect(byId['kpi-upt']).toEqual({ i: 'kpi-upt', x: 4, y: 0, w: 2, h: 1 });
    // Primera fila de paneles bajo las tarjetas: bars(7) + family(5) = 12.
    expect(byId['dash-bars']).toEqual({ i: 'dash-bars', x: 0, y: 1, w: 7, h: 2 });
    expect(byId['dash-family']).toEqual({ i: 'dash-family', x: 7, y: 1, w: 5, h: 2 });
    // Segunda fila de paneles: rank-sales(5) + hour(7) = 12.
    expect(byId['rank-sales']).toEqual({ i: 'rank-sales', x: 0, y: 3, w: 5, h: 2 });
    expect(byId['dash-hour']).toEqual({ i: 'dash-hour', x: 5, y: 3, w: 7, h: 2 });
  });

  it('ningún elemento se sale de las 12 columnas', () => {
    for (const preset of PRESETS) {
      for (const it of buildDefaultLayout(preset)) {
        expect(it.x + it.w).toBeLessThanOrEqual(12);
      }
    }
  });

  it('incluye exactamente los elementos del preset', () => {
    for (const preset of PRESETS) {
      const ids = buildDefaultLayout(preset)
        .map((it) => it.i)
        .sort();
      expect(ids).toEqual([...presetItemIds(preset)].sort());
    }
  });
});

describe('reconcileLayout', () => {
  it('añade al final (con su tamaño por defecto) los elementos que falten', () => {
    const saved = [{ i: 'kpi-today', x: 0, y: 0, w: 2, h: 1 }];
    const result = reconcileLayout(saved, ['kpi-today', 'kpi-avg-ticket']);
    expect(result).toHaveLength(2);
    const added = result.find((it) => it.i === 'kpi-avg-ticket')!;
    expect(added).toMatchObject({ w: 2, h: 1 });
    expect(added.y).toBeGreaterThanOrEqual(1);
  });

  it('descarta coordenadas de ids que ya no existen en el preset', () => {
    const saved = [
      { i: 'kpi-today', x: 0, y: 0, w: 2, h: 1 },
      { i: 'obsoleto', x: 2, y: 0, w: 2, h: 1 },
    ];
    const result = reconcileLayout(saved, ['kpi-today']);
    expect(result.map((it) => it.i)).toEqual(['kpi-today']);
  });

  it('layout completo: devuelve los mismos elementos sin tocar el orden', () => {
    const saved = [
      { i: 'kpi-today', x: 0, y: 0, w: 2, h: 1 },
      { i: 'kpi-upt', x: 2, y: 0, w: 2, h: 1 },
    ];
    const result = reconcileLayout(saved, ['kpi-today', 'kpi-upt']);
    expect(result).toEqual(saved);
  });
});

describe('freeItemSize', () => {
  it('traduce el tamaño de rejilla a píxeles (col×FREE_COL − gap, fila×FREE_ROW − gap)', () => {
    // kpi = {w:2,h:1}
    expect(freeItemSize('kpi-today')).toEqual({
      w: 2 * FREE_COL - FREE_GAP,
      h: 1 * FREE_ROW - FREE_GAP,
    });
    // dash-bars = {w:7,h:2}
    expect(freeItemSize('dash-bars')).toEqual({
      w: 7 * FREE_COL - FREE_GAP,
      h: 2 * FREE_ROW - FREE_GAP,
    });
  });

  it('cae al tamaño por defecto para ids desconocidos', () => {
    expect(freeItemSize('no-existe')).toEqual({
      w: 4 * FREE_COL - FREE_GAP,
      h: 2 * FREE_ROW - FREE_GAP,
    });
  });
});

describe('buildDefaultFreeLayout', () => {
  it('Ventas: deriva de la maquetación del grid pasada a píxel, como widgets', () => {
    const free = buildDefaultFreeLayout(ventas);
    const grid = buildDefaultLayout(ventas);
    expect(free).toHaveLength(grid.length);
    expect(free.every((e) => e.kind === 'widget')).toBe(true);
    const byId = Object.fromEntries(free.map((c) => [c.id, c]));
    const gById = Object.fromEntries(grid.map((c) => [c.i, c]));
    for (const id of Object.keys(byId)) {
      const w = byId[id] as FreeWidget;
      expect(w.widgetId).toBe(id);
      expect(w.x).toBe(gById[id]!.x * FREE_COL);
      expect(w.y).toBe(gById[id]!.y * FREE_ROW);
      expect(w.w).toBe(gById[id]!.w * FREE_COL - FREE_GAP);
      expect(w.h).toBe(gById[id]!.h * FREE_ROW - FREE_GAP);
    }
  });
});

describe('migrateFreeLayout', () => {
  it('convierte el formato antiguo (FreeCoords plano) en widgets', () => {
    const result = migrateFreeLayout([{ i: 'kpi-today', x: 10, y: 20, w: 184, h: 144 }]);
    expect(result).toEqual([
      {
        kind: 'widget',
        id: 'kpi-today',
        widgetId: 'kpi-today',
        x: 10,
        y: 20,
        w: 184,
        h: 144,
        z: 0,
      },
    ]);
  });

  it('conserva notas con su doc y descarta entradas irrecuperables', () => {
    const result = migrateFreeLayout([
      { kind: 'note', id: 'n1', x: 0, y: 0, w: 200, h: 150, z: 5, doc: { type: 'doc' } },
      null,
      { x: 1, y: 1 }, // sin i ni widgetId → se descarta
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: 'note', id: 'n1', doc: { type: 'doc' } });
  });
});

describe('reconcileFreeLayout', () => {
  it('sin nada guardado siembra desde el preset (retrocompatible)', () => {
    expect(reconcileFreeLayout([], ventas)).toEqual(buildDefaultFreeLayout(ventas));
  });

  it('NO re-añade widgets que el usuario quitó: conserva exactamente lo guardado', () => {
    // El usuario dejó solo un widget del preset Ventas.
    const saved = [{ i: 'kpi-today', x: 50, y: 60, w: 184, h: 144 }];
    const result = reconcileFreeLayout(saved, ventas);
    expect(result.map((e) => e.id)).toEqual(['kpi-today']);
  });

  it('descarta widgets cuyo id ya no existe en el catálogo pero conserva notas', () => {
    const saved = [
      { i: 'kpi-today', x: 0, y: 0, w: 1, h: 1 },
      { i: 'obsoleta', x: 5, y: 5, w: 1, h: 1 },
      { kind: 'note', id: 'n1', x: 9, y: 9, w: 200, h: 150, z: 2, doc: null },
    ];
    const result = reconcileFreeLayout(saved, ventas);
    expect(result.map((e) => e.id).sort()).toEqual(['kpi-today', 'n1']);
  });
});

describe('helpers de añadir/quitar/orden', () => {
  it('availableWidgets devuelve el catálogo menos los ya presentes', () => {
    const layout = buildDefaultFreeLayout(ventas);
    const available = availableWidgets(layout);
    expect(available).not.toContain('kpi-today'); // está en el preset Ventas
    expect(available).toContain('dash-suppliers'); // no está en Ventas
    expect(available.every((id) => id in ITEM_SPECS)).toBe(true);
  });

  it('addWidget centra el widget en el punto y lo pone al frente; no duplica', () => {
    const layout = addWidget([], 'dash-bars', { x: 500, y: 300 });
    const el = layout[0] as FreeWidget;
    const size = freeItemSize('dash-bars');
    expect(el.kind).toBe('widget');
    expect(el.x).toBe(500 - size.w / 2);
    expect(el.y).toBe(300 - size.h / 2);
    // Añadir el mismo de nuevo es no-op.
    expect(addWidget(layout, 'dash-bars', { x: 0, y: 0 })).toHaveLength(1);
    // Id desconocido también es no-op.
    expect(addWidget(layout, 'no-existe', { x: 0, y: 0 })).toHaveLength(1);
  });

  it('addNote crea una nota vacía centrada con el tamaño por defecto', () => {
    const layout = addNote([], 'n-1', { x: 100, y: 100 }, '#ffd');
    expect(layout[0]).toMatchObject({
      kind: 'note',
      id: 'n-1',
      x: 100 - NOTE_DEFAULT.w / 2,
      y: 100 - NOTE_DEFAULT.h / 2,
      w: NOTE_DEFAULT.w,
      h: NOTE_DEFAULT.h,
      doc: null,
      color: '#ffd',
    });
  });

  it('removeElement quita por id', () => {
    const layout = addNote([], 'n-1', { x: 0, y: 0 });
    expect(removeElement(layout, 'n-1')).toHaveLength(0);
    expect(removeElement(layout, 'otro')).toHaveLength(1);
  });

  it('bringToFront da al elemento el mayor z', () => {
    const a = addWidget([], 'kpi-today', { x: 0, y: 0 });
    const b = addWidget(a, 'kpi-upt', { x: 0, y: 0 });
    const front = bringToFront(b, 'kpi-today');
    const top = front.find((e) => e.id === 'kpi-today')!;
    expect(top.z).toBeGreaterThan(front.find((e) => e.id === 'kpi-upt')!.z);
  });

  it('autoArrangeFree recoloca en filas sin solaparse, conservando el orden por z', () => {
    const layout = autoArrangeFree(buildDefaultFreeLayout(ventas));
    // Primer elemento en el origen.
    expect(layout[0]!.x).toBe(0);
    expect(layout[0]!.y).toBe(0);
    // z reindexado 0..n-1 y cada elemento empieza dentro del ancho del tablero.
    expect(layout.map((e) => e.z)).toEqual(layout.map((_, i) => i));
    expect(layout.every((e) => e.x >= 0 && e.x < BOARD_COLS * FREE_COL)).toBe(true);
  });
});

describe('preset Personalizado (lienzo vacío)', () => {
  const custom = PRESETS.find((p) => p.id === 'personalizado')!;

  it('existe y va sin cards ni paneles', () => {
    expect(custom).toBeDefined();
    expect(custom.cards).toEqual([]);
    expect(custom.panels).toEqual([]);
  });

  it('arranca con un lienzo libre vacío', () => {
    expect(buildDefaultFreeLayout(custom)).toEqual([]);
    expect(reconcileFreeLayout([], custom)).toEqual([]);
  });
});

describe('herramientas de dibujo (formas, trazos, texto)', () => {
  it('addShape crea una forma con su caja y estilo al frente', () => {
    const layout = addShape(
      [],
      's1',
      'rect',
      { x: 10, y: 20, w: 120, h: 80 },
      {
        stroke: '#dc2626',
        strokeWidth: 3,
        diag: 'main',
      },
    );
    const el = layout[0] as FreeShape;
    expect(el).toMatchObject({
      kind: 'shape',
      shape: 'rect',
      x: 10,
      y: 20,
      w: 120,
      h: 80,
      stroke: '#dc2626',
      strokeWidth: 3,
      diag: 'main',
    });
  });

  it('addDraw calcula la bounding box (con margen) y relativiza los puntos; no-op con <2 puntos', () => {
    const pts: Array<[number, number]> = [
      [100, 100],
      [140, 130],
      [120, 160],
    ];
    const layout = addDraw([], 'd1', pts, '#2563eb', 4);
    const el = layout[0] as FreeDraw;
    const pad = 4 + 2;
    expect(el.kind).toBe('draw');
    expect(el.x).toBe(100 - pad);
    expect(el.y).toBe(100 - pad);
    expect(el.w).toBe(40 + 2 * pad);
    expect(el.h).toBe(60 + 2 * pad);
    // Primer punto relativo a la esquina = (pad, pad).
    expect(el.points[0]).toEqual([pad, pad]);
    // Menos de 2 puntos: no añade nada.
    expect(addDraw([], 'd2', [[0, 0]], '#000', 3)).toHaveLength(0);
  });

  it('addText crea un texto libre vacío con su esquina y tamaño por defecto', () => {
    const layout = addText([], 't1', { x: 50, y: 60 }, '#16a34a');
    expect(layout[0]).toMatchObject({
      kind: 'text',
      id: 't1',
      x: 50,
      y: 60,
      w: TEXT_DEFAULT.w,
      h: TEXT_DEFAULT.h,
      text: '',
      color: '#16a34a',
      fontSize: TEXT_DEFAULT.fontSize,
    });
  });

  it('migrateFreeLayout preserva formas, trazos y textos; reconcile los conserva', () => {
    const saved = [
      {
        kind: 'shape',
        id: 's',
        shape: 'arrow',
        x: 0,
        y: 0,
        w: 50,
        h: 50,
        z: 1,
        stroke: '#000',
        strokeWidth: 2,
        diag: 'anti',
      },
      {
        kind: 'draw',
        id: 'd',
        x: 0,
        y: 0,
        w: 10,
        h: 10,
        z: 2,
        points: [
          [0, 0],
          [5, 5],
        ],
        stroke: '#111',
        strokeWidth: 3,
      },
      {
        kind: 'text',
        id: 't',
        x: 0,
        y: 0,
        w: 100,
        h: 40,
        z: 3,
        text: 'hola',
        color: '#222',
        fontSize: 18,
      },
    ];
    const migrated = migrateFreeLayout(saved);
    expect(migrated.map((e) => e.kind)).toEqual(['shape', 'draw', 'text']);
    expect((migrated[0] as FreeShape).diag).toBe('anti');
    expect((migrated[1] as FreeDraw).points).toEqual([
      [0, 0],
      [5, 5],
    ]);
    expect((migrated[2] as FreeText).text).toBe('hola');
    // Reconcile (preset Ventas) conserva todos los no-widget.
    expect(
      reconcileFreeLayout(saved, ventas)
        .map((e) => e.id)
        .sort(),
    ).toEqual(['d', 's', 't']);
  });
});
