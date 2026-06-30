import { describe, expect, it } from 'vitest';

import {
  addDraw,
  addNote,
  addShape,
  addText,
  addWidget,
  addWidgetToGrid,
  autoArrangeFree,
  availableWidgets,
  BOARD_COLS,
  bringToFront,
  buildDefaultFreeLayout,
  buildDefaultLayout,
  clampWidgetPx,
  clampWidgetUnits,
  defaultPanelOrder,
  FREE_COL,
  FREE_GAP,
  FREE_ROW,
  type FreeDraw,
  freeItemSize,
  type FreeShape,
  type FreeText,
  freeUnitsFromPx,
  type FreeWidget,
  GENERIC_DEFAULT_SIZE,
  GRID_BREAKPOINT_COLS,
  GRID_COARSE_COLS,
  gridCoarseUnits,
  ITEM_SPECS,
  migrateFreeLayout,
  NOTE_DEFAULT,
  PANEL_CANON,
  type PresetDef,
  presetItemIds,
  PRESETS,
  reconcileFreeLayout,
  reconcileLayout,
  removeElement,
  TEXT_DEFAULT,
  WIDGET_SIZE_BOUNDS,
  widgetSizeBounds,
} from './dashboard-layout.js';

// F0 (#174) dejó «personalizado» como único preset real (lienzo vacío). Las
// funciones de layout (buildDefaultLayout/defaultPanelOrder/…) siguen aceptando
// cualquier PresetDef, así que estos fixtures reproducen los presets retirados
// (Ventas/Inventario) para no perder la cobertura de la lógica de maquetación.
// El catálogo clásico se redujo (#264) a dos paneles (dash-bars/dash-hour) más las
// Fixtures de presets para tests. Los presets reales solo tienen dos widgets: dash-bars y dash-hour.
const ventas: PresetDef = {
  id: 'ventas',
  label: 'Ventas',
  cards: [],
  panels: ['dash-bars', 'dash-hour'],
};
const inventario: PresetDef = {
  id: 'inventario',
  label: 'Inventario',
  cards: [],
  panels: ['dash-hour'],
};
// Presets a validar en las invariantes «para todos los presets»: los reales + los fixtures.
const ALL_PRESETS: PresetDef[] = [...PRESETS, ventas, inventario];

describe('defaultPanelOrder', () => {
  it('preset Ventas: paneles en orden canónico (maquetación), no en el orden del array', () => {
    expect(defaultPanelOrder(ventas)).toEqual(['dash-bars', 'dash-hour']);
  });

  it('preset Inventario: orden canónico', () => {
    expect(defaultPanelOrder(inventario)).toEqual(['dash-hour']);
  });

  it('PANEL_CANON no tiene ids duplicados', () => {
    expect(new Set(PANEL_CANON).size).toBe(PANEL_CANON.length);
  });
});

describe('presetItemIds + ITEM_SPECS', () => {
  it('Ventas: solo paneles (en orden canónico)', () => {
    expect(presetItemIds(ventas)).toEqual(['dash-bars', 'dash-hour']);
  });

  it('cada elemento de cada preset tiene un tamaño en ITEM_SPECS', () => {
    for (const preset of ALL_PRESETS) {
      for (const id of presetItemIds(preset)) {
        expect(ITEM_SPECS[id], `falta ITEM_SPECS para ${id}`).toBeDefined();
      }
    }
  });
});

describe('ITEM_SPECS · tallas a medida por widget (rejilla fina)', () => {
  it('las tallas son DIVERSAS (la mayoría únicas) — sin volver a tallas de bloque por sección', () => {
    const sizes = Object.values(ITEM_SPECS).map((s) => `${s.w}x${s.h}`);
    const distinct = new Set(sizes).size;
    // No se exige unicidad ESTRICTA: dos widgets con contenido equivalente (p. ej. dos minis o dos
    // tarjetas KPI compactas) pueden compartir talla si es la que su contenido necesita. Lo que se
    // evita es la regresión a «tallas de bloque» compartidas por secciones enteras → mucha diversidad.
    expect(distinct, `pocas tallas distintas (${distinct}/${sizes.length})`).toBeGreaterThanOrEqual(
      Math.ceil(sizes.length * 0.7),
    );
  });

  it('las tallas usan la resolución FINA, no solo un escalado de la rejilla gruesa anterior', () => {
    // La rejilla vieja era múltiplos de 100/160 → en unidades finas serían múltiplos de (4,4). Que NO
    // todas las tallas sean múltiplos de 4 en ambos ejes demuestra que se tallaron a medida del contenido.
    const allCoarse = Object.values(ITEM_SPECS).every((s) => s.w % 4 === 0 && s.h % 4 === 0);
    expect(allCoarse).toBe(false);
  });
});

describe('WIDGET_SIZE_BOUNDS · límites de tamaño coherentes', () => {
  it('cada widget del catálogo tiene un rango propio (sin caer al genérico)', () => {
    for (const id of Object.keys(ITEM_SPECS)) {
      expect(WIDGET_SIZE_BOUNDS[id], `falta WIDGET_SIZE_BOUNDS para ${id}`).toBeDefined();
    }
  });

  it('todos los rangos son válidos: 1 ≤ minW ≤ maxW ≤ BOARD_COLS y 1 ≤ minH ≤ maxH ≤ 24', () => {
    for (const [id, b] of Object.entries(WIDGET_SIZE_BOUNDS)) {
      expect(b.minW, `${id}.minW ≥ 1`).toBeGreaterThanOrEqual(1);
      expect(b.minW, `${id}.minW ≤ maxW`).toBeLessThanOrEqual(b.maxW);
      expect(b.maxW, `${id}.maxW ≤ ${BOARD_COLS}`).toBeLessThanOrEqual(BOARD_COLS);
      expect(b.minH, `${id}.minH ≥ 1`).toBeGreaterThanOrEqual(1);
      expect(b.minH, `${id}.minH ≤ maxH`).toBeLessThanOrEqual(b.maxH);
      expect(b.maxH, `${id}.maxH ≤ 24`).toBeLessThanOrEqual(24);
    }
  });

  it('el tamaño de catálogo (ITEM_SPECS) SIEMPRE cae dentro de su rango', () => {
    for (const [id, spec] of Object.entries(ITEM_SPECS)) {
      const b = widgetSizeBounds(id);
      expect(spec.w, `${id}: w=${spec.w} ∈ [${b.minW},${b.maxW}]`).toBeGreaterThanOrEqual(b.minW);
      expect(spec.w, `${id}: w=${spec.w} ∈ [${b.minW},${b.maxW}]`).toBeLessThanOrEqual(b.maxW);
      expect(spec.h, `${id}: h=${spec.h} ∈ [${b.minH},${b.maxH}]`).toBeGreaterThanOrEqual(b.minH);
      expect(spec.h, `${id}: h=${spec.h} ∈ [${b.minH},${b.maxH}]`).toBeLessThanOrEqual(b.maxH);
    }
  });

  it('clampWidgetUnits acota a [min,max] tanto por arriba como por abajo', () => {
    const b = widgetSizeBounds('mini-tiendas');
    expect(clampWidgetUnits('mini-tiendas', 999, 999)).toEqual({ cols: b.maxW, rows: b.maxH });
    expect(clampWidgetUnits('mini-tiendas', 1, 1)).toEqual({ cols: b.minW, rows: b.minH });
    // la talla de catálogo siempre cae dentro de rango → sin cambios
    const spec = ITEM_SPECS['mini-tiendas']!;
    expect(clampWidgetUnits('mini-tiendas', spec.w, spec.h)).toEqual({
      cols: spec.w,
      rows: spec.h,
    });
  });

  it('un id desconocido cae al rango genérico (DEFAULT_SIZE_BOUNDS)', () => {
    const b = widgetSizeBounds('id-que-no-existe');
    expect(b).toEqual({ minW: 8, maxW: 32, minH: 4, maxH: 20 });
  });

  it('clampWidgetPx convierte px→unidades, acota y vuelve a px (round-trip de la barrera)', () => {
    const b = widgetSizeBounds('cmp-donut');
    // Un tamaño px enorme → px del techo del rango.
    const huge = clampWidgetPx('cmp-donut', 9999, 9999);
    expect(huge).toEqual({ w: b.maxW * FREE_COL - FREE_GAP, h: b.maxH * FREE_ROW - FREE_GAP });
    // Un tamaño px diminuto → px del suelo del rango.
    const tiny = clampWidgetPx('cmp-donut', 5, 5);
    expect(tiny).toEqual({ w: b.minW * FREE_COL - FREE_GAP, h: b.minH * FREE_ROW - FREE_GAP });
  });

  it('migrateFreeLayout aplica el clamp a tamaños persistidos fuera de rango', () => {
    const b = widgetSizeBounds('mini-tiendas');
    // Un widget guardado con un tamaño px absurdo (mini, pedido enorme) sale clampado al techo.
    const [el] = migrateFreeLayout([
      { kind: 'widget', id: 'w1', widgetId: 'mini-tiendas', x: 0, y: 0, w: 5000, h: 5000, z: 0 },
    ]) as FreeWidget[];
    expect(el!.w).toBe(b.maxW * FREE_COL - FREE_GAP);
    expect(el!.h).toBe(b.maxH * FREE_ROW - FREE_GAP);
  });
});

describe('buildDefaultLayout', () => {
  it('Ventas: paneles (bars y hour) fluyendo en filas de BOARD_COLS', () => {
    const layout = buildDefaultLayout(ventas);
    const byId = Object.fromEntries(layout.map((it) => [it.i, it]));
    const bars = ITEM_SPECS['dash-bars']!;
    const hour = ITEM_SPECS['dash-hour']!;
    // bars ocupa la primera fila.
    expect(byId['dash-bars']).toEqual({ i: 'dash-bars', x: 0, y: 0, w: bars.w, h: bars.h });
    // hour no cabe junto a bars (2 gráficas grandes > ancho): salta a la fila siguiente (y = alto de bars).
    expect(byId['dash-hour']).toEqual({ i: 'dash-hour', x: 0, y: bars.h, w: hour.w, h: hour.h });
  });

  it('ningún elemento se sale del ancho del tablero (BOARD_COLS)', () => {
    for (const preset of ALL_PRESETS) {
      for (const it of buildDefaultLayout(preset)) {
        expect(it.x + it.w).toBeLessThanOrEqual(BOARD_COLS);
      }
    }
  });

  it('incluye exactamente los elementos del preset', () => {
    for (const preset of ALL_PRESETS) {
      const ids = buildDefaultLayout(preset)
        .map((it) => it.i)
        .sort();
      expect(ids).toEqual([...presetItemIds(preset)].sort());
    }
  });
});

describe('reconcileLayout', () => {
  it('añade al final (con su tamaño por defecto) los elementos que falten', () => {
    const saved = [{ i: 'dash-bars', x: 0, y: 0, w: 7, h: 2 }];
    const result = reconcileLayout(saved, ['dash-bars', 'dash-hour']);
    expect(result).toHaveLength(2);
    const added = result.find((it) => it.i === 'dash-hour')!;
    const hour = ITEM_SPECS['dash-hour']!;
    expect(added).toMatchObject({ w: hour.w, h: hour.h });
    expect(added.y).toBeGreaterThanOrEqual(2);
  });

  it('descarta coordenadas de ids que ya no existen en el preset', () => {
    const saved = [
      { i: 'dash-bars', x: 0, y: 0, w: 7, h: 2 },
      { i: 'obsoleto', x: 3, y: 0, w: 2, h: 1 },
    ];
    const result = reconcileLayout(saved, ['dash-bars']);
    expect(result.map((it) => it.i)).toEqual(['dash-bars']);
  });

  it('layout completo: devuelve los mismos elementos sin tocar el orden', () => {
    const saved = [
      { i: 'geist-stat-today', x: 0, y: 0, w: 3, h: 2 },
      { i: 'dash-bars', x: 3, y: 0, w: 7, h: 2 },
    ];
    const result = reconcileLayout(saved, ['geist-stat-today', 'dash-bars']);
    expect(result).toEqual(saved);
  });
});

describe('freeItemSize', () => {
  it('traduce el tamaño de rejilla a píxeles (col×FREE_COL − gap, fila×FREE_ROW − gap)', () => {
    const bars = ITEM_SPECS['dash-bars']!;
    expect(freeItemSize('dash-bars')).toEqual({
      w: bars.w * FREE_COL - FREE_GAP,
      h: bars.h * FREE_ROW - FREE_GAP,
    });
    const hour = ITEM_SPECS['dash-hour']!;
    expect(freeItemSize('dash-hour')).toEqual({
      w: hour.w * FREE_COL - FREE_GAP,
      h: hour.h * FREE_ROW - FREE_GAP,
    });
  });

  it('cae al tamaño por defecto (DEFAULT_SPEC = 16×8) para ids desconocidos', () => {
    expect(freeItemSize('no-existe')).toEqual({
      w: 16 * FREE_COL - FREE_GAP,
      h: 8 * FREE_ROW - FREE_GAP,
    });
  });
});

describe('freeUnitsFromPx', () => {
  it('es la INVERSA EXACTA de freeItemSize para todo el catálogo (round-trip sin pérdida)', () => {
    // El modo CUADRÍCULA depende de recuperar las unidades enteras EXACTAS desde el px del lienzo;
    // si esto perdiera precisión, los tiles dejarían de teselar limpio. `cols` se clampa a BOARD_COLS.
    for (const [id, spec] of Object.entries(ITEM_SPECS)) {
      const { w, h } = freeItemSize(id);
      expect(freeUnitsFromPx(w, h)).toEqual({
        cols: Math.min(BOARD_COLS, spec.w),
        rows: spec.h,
      });
    }
  });

  it('recupera las unidades de un tamaño genérico (u·FREE_COL − GAP)', () => {
    // Un widget genérico del agente con defaultSize {w:6,h:3} sembrado en el lienzo.
    expect(freeUnitsFromPx(6 * FREE_COL - FREE_GAP, 3 * FREE_ROW - FREE_GAP)).toEqual({
      cols: 6,
      rows: 3,
    });
  });

  it('clampa columnas a [1, BOARD_COLS] y filas a ≥1', () => {
    expect(freeUnitsFromPx(99999, 99999).cols).toBe(BOARD_COLS);
    expect(freeUnitsFromPx(0, 0)).toEqual({ cols: 1, rows: 1 });
    expect(freeUnitsFromPx(-500, -500)).toEqual({ cols: 1, rows: 1 });
  });

  it('redondea al entero de celdas más cercano para tamaños libres (notas)', () => {
    // NOTE_DEFAULT = 240×180 → round((240+16)/25)=10 col, round((180+16)/40)=5 fila.
    expect(freeUnitsFromPx(NOTE_DEFAULT.w, NOTE_DEFAULT.h)).toEqual({ cols: 10, rows: 5 });
  });
});

describe('gridCoarseUnits · cuantización a la rejilla gruesa del modo Cuadrícula', () => {
  it('divide las unidades finas por GRID_COARSEN (≈÷4), redondea y capa a GRID_COARSE_COLS', () => {
    expect(gridCoarseUnits(48, 8)).toEqual({ cols: GRID_COARSE_COLS, rows: 2 }); // banda ancha → 12×2
    expect(gridCoarseUnits(16, 8)).toEqual({ cols: 4, rows: 2 }); // tabla → 4×2
    expect(gridCoarseUnits(29, 9)).toEqual({ cols: 7, rows: 2 }); // gráfica grande → 7×2
  });

  it('nunca baja de 1×1 y no excede GRID_COARSE_COLS de ancho', () => {
    expect(gridCoarseUnits(1, 1)).toEqual({ cols: 1, rows: 1 });
    expect(gridCoarseUnits(999, 999).cols).toBe(GRID_COARSE_COLS);
  });

  it('toda talla de catálogo cuantiza a una rejilla válida (1..GRID_COARSE_COLS col, ≥1 fila)', () => {
    for (const [id, s] of Object.entries(ITEM_SPECS)) {
      const u = gridCoarseUnits(s.w, s.h);
      expect(u.cols, `${id} cols ≥ 1`).toBeGreaterThanOrEqual(1);
      expect(u.cols, `${id} cols ≤ ${GRID_COARSE_COLS}`).toBeLessThanOrEqual(GRID_COARSE_COLS);
      expect(u.rows, `${id} rows ≥ 1`).toBeGreaterThanOrEqual(1);
    }
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
    const result = migrateFreeLayout([{ i: 'geist-stat-today', x: 10, y: 20, w: 184, h: 144 }]);
    expect(result).toEqual([
      {
        kind: 'widget',
        id: 'geist-stat-today',
        widgetId: 'geist-stat-today',
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
    const saved = [{ i: 'dash-hour', x: 50, y: 60, w: 184, h: 144 }];
    const result = reconcileFreeLayout(saved, ventas);
    expect(result.map((e) => e.id)).toEqual(['dash-hour']);
  });

  it('descarta widgets cuyo id ya no existe en el catálogo pero conserva notas', () => {
    const saved = [
      { i: 'dash-hour', x: 0, y: 0, w: 1, h: 1 },
      { i: 'obsoleta', x: 5, y: 5, w: 1, h: 1 },
      { kind: 'note', id: 'n1', x: 9, y: 9, w: 200, h: 150, z: 2, doc: null },
    ];
    const result = reconcileFreeLayout(saved, ventas);
    expect(result.map((e) => e.id).sort()).toEqual(['dash-hour', 'n1']);
  });

  it('CONSERVA los widgets genéricos del agente (gen:*), aunque no estén en ITEM_SPECS (#188/#189)', () => {
    // Regresión: el filtro por catálogo borraba los gen:* del lienzo → no se renderizaban (ni el
    // composite). Deben sobrevivir igual que el catálogo; solo se descartan ids de catálogo obsoletos.
    const saved = [
      {
        kind: 'widget',
        id: 'dash-hour',
        widgetId: 'dash-hour',
        x: 0,
        y: 0,
        w: 184,
        h: 144,
        z: 0,
      },
      {
        kind: 'widget',
        id: 'gen:comp-1',
        widgetId: 'gen:comp-1',
        x: 500,
        y: 360,
        w: 784,
        h: 784,
        z: 1,
      },
      { i: 'obsoleta', x: 5, y: 5, w: 1, h: 1 },
    ];
    const result = reconcileFreeLayout(saved, ventas);
    expect(result.map((e) => e.id).sort()).toEqual(['dash-hour', 'gen:comp-1']);
  });
});

describe('helpers de añadir/quitar/orden', () => {
  it('availableWidgets devuelve el catálogo menos los ya presentes', () => {
    const layout = buildDefaultFreeLayout(ventas);
    const present = new Set(
      layout.filter((el): el is FreeWidget => el.kind === 'widget').map((el) => el.id),
    );
    const available = availableWidgets(layout);
    // Ningún disponible está ya en el lienzo, y todos existen en el catálogo.
    expect(available.every((id) => id in ITEM_SPECS && !present.has(id))).toBe(true);
    // Presentes ∪ disponibles = catálogo completo, sin solapamiento (invariante estable por tandas).
    expect([...present, ...available].sort()).toEqual(Object.keys(ITEM_SPECS).sort());
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
    const a = addWidget([], 'dash-bars', { x: 0, y: 0 });
    const b = addWidget(a, 'dash-hour', { x: 0, y: 0 });
    const front = bringToFront(b, 'dash-bars');
    const top = front.find((e) => e.id === 'dash-bars')!;
    expect(top.z).toBeGreaterThan(front.find((e) => e.id === 'dash-hour')!.z);
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

  it('autoArrangeFree: empaqueta sin solapes y dentro del ancho del tablero', () => {
    const arranged = autoArrangeFree(buildDefaultFreeLayout(ventas));
    for (let i = 0; i < arranged.length; i++) {
      for (let j = i + 1; j < arranged.length; j++) {
        const a = arranged[i]!;
        const b = arranged[j]!;
        const overlap = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
        expect(overlap, `${a.id} solapa con ${b.id}`).toBe(false);
      }
    }
    expect(arranged.every((e) => e.x + e.w <= BOARD_COLS * FREE_COL)).toBe(true);
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

describe('GENERIC_DEFAULT_SIZE', () => {
  it('define un tamaño por cada tipo de widget genérico', () => {
    const types = ['table', 'bar', 'line', 'area', 'stacked', 'pie', 'donut', 'kpi', 'insight'];
    for (const t of types) {
      const size = GENERIC_DEFAULT_SIZE[t as keyof typeof GENERIC_DEFAULT_SIZE];
      expect(size, `falta tamaño para ${t}`).toBeDefined();
      expect(size.w).toBeGreaterThan(0);
      expect(size.h).toBeGreaterThan(0);
    }
    // Valores clave del plan (rejilla fina, ×4 respecto a la rejilla gruesa anterior).
    expect(GENERIC_DEFAULT_SIZE.table).toEqual({ w: 24, h: 12 });
    expect(GENERIC_DEFAULT_SIZE.pie).toEqual({ w: 16, h: 12 });
    expect(GENERIC_DEFAULT_SIZE.kpi).toEqual({ w: 8, h: 4 });
  });
});

describe('addWidgetToGrid', () => {
  it('inserta en lg en top-left con el tamaño dado', () => {
    const result = addWidgetToGrid({}, 'gen:abc', { w: 6, h: 2 }, 'top-left');
    expect(result.lg).toEqual([{ i: 'gen:abc', x: 0, y: 0, w: 6, h: 2 }]);
  });

  it('top-right ancla el widget al borde derecho de las BOARD_COLS columnas', () => {
    const result = addWidgetToGrid({}, 'geist-stat-today', { w: 2, h: 1 }, 'top-right');
    expect(result.lg).toEqual([{ i: 'geist-stat-today', x: BOARD_COLS - 2, y: 0, w: 2, h: 1 }]);
  });

  it('top-center centra el widget', () => {
    const result = addWidgetToGrid({}, 'w', { w: 4, h: 2 }, 'top-center');
    expect(result.lg![0]).toMatchObject({ x: Math.floor((BOARD_COLS - 4) / 2), w: 4 });
  });

  it('bottom-left lo coloca bajo lo existente', () => {
    const base = { lg: [{ i: 'a', x: 0, y: 0, w: 12, h: 3 }] };
    const result = addWidgetToGrid(base, 'b', { w: 6, h: 2 }, 'bottom-left');
    const added = result.lg!.find((it) => it.i === 'b')!;
    expect(added).toEqual({ i: 'b', x: 0, y: 3, w: 6, h: 2 });
  });

  it('clampa el ancho a las columnas de cada breakpoint presente', () => {
    // sm tiene 24 columnas: un widget de w:30 se clampa a 24; en lg (48) cabe entero.
    const base = { lg: [], sm: [] };
    const result = addWidgetToGrid(base, 'wide', { w: 30, h: 2 }, 'top-left');
    expect(result.lg![0]!.w).toBe(30); // lg = 48 cols → cabe
    expect(result.sm![0]!.w).toBe(GRID_BREAKPOINT_COLS.sm); // 24 → clampado
  });

  it('reemplaza el widget si ya estaba (no lo duplica)', () => {
    const base = { lg: [{ i: 'x', x: 0, y: 0, w: 2, h: 1 }] };
    const result = addWidgetToGrid(base, 'x', { w: 4, h: 2 }, 'top-left');
    expect(result.lg!.filter((it) => it.i === 'x')).toHaveLength(1);
    expect(result.lg![0]).toMatchObject({ w: 4, h: 2 });
  });

  it('no muta el layout de entrada', () => {
    const base = { lg: [{ i: 'a', x: 0, y: 0, w: 2, h: 1 }] };
    const snapshot = JSON.stringify(base);
    addWidgetToGrid(base, 'b', { w: 2, h: 1 }, 'top-left');
    expect(JSON.stringify(base)).toBe(snapshot);
  });

  it('busca el primer hueco libre: no solapa con un widget ya en top-left (F4.2)', () => {
    const base = { lg: [{ i: 'a', x: 0, y: 0, w: 6, h: 2 }] };
    const result = addWidgetToGrid(base, 'b', { w: 6, h: 2 }, 'top-left');
    const added = result.lg!.find((it) => it.i === 'b')!;
    // El hueco libre más alto-izquierdo es la columna 6 de la fila 0 (a ocupa 0–5).
    expect(added).toEqual({ i: 'b', x: 6, y: 0, w: 6, h: 2 });
  });

  it('apila en la fila siguiente cuando la primera está llena (F4.2)', () => {
    const base = { lg: [{ i: 'a', x: 0, y: 0, w: BOARD_COLS, h: 2 }] };
    const result = addWidgetToGrid(base, 'b', { w: 6, h: 2 }, 'top-left');
    const added = result.lg!.find((it) => it.i === 'b')!;
    expect(added).toEqual({ i: 'b', x: 0, y: 2, w: 6, h: 2 });
  });
});
