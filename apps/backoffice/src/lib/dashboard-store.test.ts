import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getWidgetSpec } from '../widgets/registry.js';
import type { CanvasOp } from './chat.js';
import type {
  CompositeNode,
  FreeElement,
  FreeShape,
  GenericSpec,
  LayoutPref,
} from './dashboard-layout.js';
import { buildCanvasSnapshot, genericElementId, useDashboardStore } from './dashboard-store.js';

const store = () => useDashboardStore.getState();
const PRESET = 'personalizado';

function freeOf(): FreeElement[] {
  return store().layout.freeLayouts?.[PRESET] ?? [];
}

beforeEach(() => {
  vi.useFakeTimers();
  useDashboardStore.setState({ layout: {}, hydrated: false });
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
    store().hydrate({ chartKinds: { sales: 'line' } });
    vi.advanceTimersByTime(1000);
    expect(store().layout.chartKinds?.sales).toBe('line');
    expect(store().hydrated).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('hydrate re-registra en el registry los genéricos persistidos (visibles tras recargar)', () => {
    // El registry es estado de módulo: tras recargar, renderItem('gen:…') solo encuentra el spec
    // si hydrate lo reconstruye desde layout.genericWidgets (#189 slice 0.1).
    const spec: GenericSpec = {
      type: 'bar',
      endpoint: '/dashboard/sales-by-employee',
      title: 'Ventas',
      defaultSize: { w: 6, h: 2 },
    };
    store().hydrate({ genericWidgets: { 'gen:persisted': spec } });
    const registered = getWidgetSpec('gen:persisted');
    expect(registered).toBeDefined();
    expect(registered!.genericSpec?.type).toBe('bar');
    expect(typeof registered!.render).toBe('function');
  });

  it('NO persiste antes de hidratar (evita pisar el layout con {} — StrictMode mount/unmount)', () => {
    // Reproduce la causa del wipe: el persister está puesto pero aún no se ha hidratado; ni
    // setLayout ni flushPersist (cleanup en el desmontaje) deben escribir el `{}` inicial.
    const spy = vi.fn();
    store().setPersister(spy);
    expect(store().hydrated).toBe(false);
    store().setLayout({ chartKinds: { sales: 'bars' } });
    store().flushPersist();
    vi.advanceTimersByTime(1000);
    expect(spy).not.toHaveBeenCalled();
  });

  it('setLayout persiste con debounce de 500ms', () => {
    const spy = vi.fn();
    store().setPersister(spy);
    useDashboardStore.setState({ hydrated: true }); // habilita la persistencia (post-hidratación)
    store().setLayout({ chartKinds: { sales: 'bars' } });
    vi.advanceTimersByTime(499);
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ chartKinds: { sales: 'bars' } });
  });

  it('debouncea varias escrituras en un solo PUT con el último snapshot', () => {
    const spy = vi.fn();
    store().setPersister(spy);
    useDashboardStore.setState({ hydrated: true });
    store().setLayout({ chartKinds: { sales: 'bars' } });
    vi.advanceTimersByTime(200);
    store().setLayout({ chartKinds: { sales: 'line' } });
    vi.advanceTimersByTime(500);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ chartKinds: { sales: 'line' } });
  });

  it('flushPersist fuerza el PUT pendiente y cancela el debounce', () => {
    const spy = vi.fn();
    store().setPersister(spy);
    useDashboardStore.setState({ hydrated: true });
    store().setLayout({ chartKinds: { sales: 'bars' } });
    store().flushPersist();
    expect(spy).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('addWidget (catálogo)', () => {
  it('coloca un widget del catálogo en el lienzo libre (→ freeLayouts)', () => {
    // El preset «personalizado» deriva su lista de widgets de freeLayouts, así que
    // el alta del agente cae en el lienzo libre (fuente de la lista de widgets del preset). Antes
    // escribía en el grid layout, que el render del preset no mira, y el widget no aparecía.
    const r = store().addWidget('dash-bars');
    expect(r.accepted).toBe(true);
    expect(freeOf().some((e) => e.kind === 'widget' && e.widgetId === 'dash-bars')).toBe(true);
  });

  it('coloca un widget en una posición semántica del lienzo', () => {
    store().hydrate({});
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
    store().hydrate({});
    store().addWidget('dash-bars');
    const r = store().addWidget('dash-bars');
    expect(r.accepted).toBe(false);
    expect(r.reason).toMatch(/ya está/);
  });

  it('escalona en el lienzo libre dos widgets distintos en la misma ancla (anti-solape)', () => {
    store().hydrate({});
    store().addWidget('dash-bars', 'center');
    store().addWidget('dash-hour', 'center');
    const els = freeOf().filter((e) => e.kind === 'widget');
    expect(els).toHaveLength(2);
    // No quedan exactamente en la misma posición (offset diagonal aplicado).
    expect(els[0]!.x === els[1]!.x && els[0]!.y === els[1]!.y).toBe(false);
  });
});

describe('formas / texto / notas', () => {
  it('añade una forma', () => {
    store().hydrate({});
    const r = store().addShape('rect', 'top-left');
    expect(r.accepted).toBe(true);
    const shapes = freeOf().filter((e): e is FreeShape => e.kind === 'shape');
    expect(shapes).toHaveLength(1);
    expect(shapes[0]!.shape).toBe('rect');
  });

  it('rechaza una forma desconocida', () => {
    store().hydrate({});
    const r = store().addShape('hexagon');
    expect(r.accepted).toBe(false);
  });

  it('añade texto con su contenido', () => {
    store().hydrate({});
    const r = store().addText('Hola', 'center');
    expect(r.accepted).toBe(true);
    const text = freeOf().find((e) => e.kind === 'text');
    expect(text && 'text' in text ? text.text : '').toBe('Hola');
  });

  it('añade una nota', () => {
    store().hydrate({});
    const r = store().addNote('nota', 'bottom-right');
    expect(r.accepted).toBe(true);
    expect(freeOf().some((e) => e.kind === 'note')).toBe(true);
  });
});

describe('insight / widgets genéricos', () => {
  it('addInsight crea una NOTA editable con el texto del agente embebido (no un genérico)', () => {
    store().hydrate({});
    const r = store().addInsight('**Ventas al alza**', 'Resumen');
    expect(r.accepted).toBe(true);
    // No registra genérico: el insight es ahora una nota del lienzo.
    expect(Object.keys(store().layout.genericWidgets ?? {})).toHaveLength(0);
    const notes = freeOf().filter((e) => e.kind === 'note');
    expect(notes).toHaveLength(1);
    // El doc TipTap embebe el texto (título en negrita + contenido).
    expect(JSON.stringify(notes[0])).toContain('Ventas al alza');
    expect(JSON.stringify(notes[0])).toContain('Resumen');
  });

  it('add_insight con elementId del agente crea la nota bajo ese id (undo posible)', () => {
    store().hydrate({});
    const r = store().applyCanvasOp({ op: 'add_insight', content: '**x**', elementId: 'ins-1' });
    expect(r.accepted).toBe(true);
    expect(freeOf().some((e) => e.id === 'ins-1' && e.kind === 'note')).toBe(true);
    // Undo: removeElement por elementId directo (la nota no lleva prefijo `gen:`).
    expect(store().removeElement('ins-1').accepted).toBe(true);
    expect(freeOf().some((e) => e.id === 'ins-1')).toBe(false);
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

describe('normalizeGenericSpec — composite (#189)', () => {
  // El árbol composite se valida vía applyCanvasOp (normalizeGenericSpec es privado); el spec
  // normalizado queda en layout.genericWidgets. Helper para leer el único genérico colocado.
  function lastGenericSpec(): GenericSpec {
    const widgets = store().layout.genericWidgets ?? {};
    const id = Object.keys(widgets)[0]!;
    return widgets[id]!;
  }
  function leaf(endpoint: string, extra: Record<string, unknown> = {}): unknown {
    return { kind: 'leaf', spec: { type: 'bar', endpoint, ...extra } };
  }
  function addComposite(root: unknown): { accepted: boolean; reason?: string } {
    return store().applyCanvasOp({
      op: 'add_widget',
      position: 'center',
      genericSpec: { type: 'composite', endpoint: '', title: 'Panel', root },
    });
  }

  it('árbol válido se normaliza y acepta (dos hojas en fila)', () => {
    const r = addComposite({
      kind: 'stack',
      dir: 'row',
      children: [
        leaf('/dashboard/sales-by-employee', { fields: ['userName', 'total'], title: 'Ventas' }),
        leaf('/dashboard/sales-kpis', { type: 'kpi', fields: ['revenue'], title: 'KPI' }),
      ],
    });
    expect(r.accepted).toBe(true);
    const spec = lastGenericSpec();
    expect(spec.type).toBe('composite');
    expect(spec.endpoint).toBe('');
    expect(spec.defaultSize).toEqual({ w: 8, h: 5 });
    expect(spec.root?.kind).toBe('stack');
    if (spec.root?.kind === 'stack') {
      expect(spec.root.dir).toBe('row');
      expect(spec.root.children).toHaveLength(2);
    }
  });

  it('hoja con endpoint fuera de allowlist se poda, resto intacto', () => {
    const r = addComposite({
      kind: 'stack',
      dir: 'row',
      children: [leaf('/dashboard/sales-by-employee'), leaf('/evil/secret-export')],
    });
    expect(r.accepted).toBe(true);
    const spec = lastGenericSpec();
    expect(spec.root?.kind).toBe('stack');
    if (spec.root?.kind === 'stack') {
      expect(spec.root.children).toHaveLength(1);
      const only = spec.root.children[0]!;
      expect(only.kind).toBe('leaf');
      if (only.kind === 'leaf') expect(only.spec.endpoint).toBe('/dashboard/sales-by-employee');
    }
  });

  it('árbol demasiado profundo (hoja más allá del máximo) se rechaza', () => {
    // stack(0) → stack(1) → stack(2) → leaf(3): la hoja cae fuera del límite y todo colapsa.
    const r = addComposite({
      kind: 'stack',
      dir: 'col',
      children: [
        {
          kind: 'stack',
          dir: 'col',
          children: [
            { kind: 'stack', dir: 'col', children: [leaf('/dashboard/sales-by-employee')] },
          ],
        },
      ],
    });
    expect(r.accepted).toBe(false);
    expect(r.reason).toMatch(/compuesto|inválido/i);
    expect(Object.keys(store().layout.genericWidgets ?? {})).toHaveLength(0);
  });

  it('más de 12 hojas: se poda desde el exceso (cap a 12)', () => {
    const children = Array.from({ length: 15 }, () =>
      leaf('/dashboard/sales-kpis', { type: 'kpi' }),
    );
    const r = addComposite({ kind: 'stack', dir: 'row', children });
    expect(r.accepted).toBe(true);
    const spec = lastGenericSpec();
    expect(countLeaves(spec.root)).toBe(12);
  });

  it('spec de hoja en snake_case se normaliza a camelCase', () => {
    const r = addComposite({
      kind: 'stack',
      dir: 'row',
      children: [
        leaf('/dashboard/sales-by-employee', { default_size: { w: 4, h: 3 }, store_id: 'S1' }),
      ],
    });
    expect(r.accepted).toBe(true);
    const spec = lastGenericSpec();
    expect(spec.root?.kind).toBe('stack');
    if (spec.root?.kind === 'stack' && spec.root.children[0]?.kind === 'leaf') {
      const leafSpec = spec.root.children[0].spec;
      expect(leafSpec.defaultSize).toEqual({ w: 4, h: 3 });
      expect(leafSpec.storeId).toBe('S1');
      // Las claves snake_case originales no sobreviven al spec normalizado.
      expect((leafSpec as Record<string, unknown>).default_size).toBeUndefined();
      expect((leafSpec as Record<string, unknown>).store_id).toBeUndefined();
    } else {
      throw new Error('estructura de árbol inesperada');
    }
  });

  it('árbol con todas las hojas inválidas → widget rechazado', () => {
    const r = addComposite({
      kind: 'stack',
      dir: 'row',
      children: [
        leaf('/no-permitido'),
        { kind: 'leaf', spec: { type: 'pyramid', endpoint: '/dashboard/sales-kpis' } },
      ],
    });
    expect(r.accepted).toBe(false);
    expect(Object.keys(store().layout.genericWidgets ?? {})).toHaveLength(0);
  });

  it('coloca el compuesto bajo un id derivado del element_id y el undo lo elimina (E2E 4)', () => {
    const elementId = 'elem-abc';
    const r = store().applyCanvasOp({
      op: 'add_widget',
      position: 'center',
      elementId,
      widgetId: 'gen:composite',
      genericSpec: {
        type: 'composite',
        endpoint: '',
        title: 'Panel',
        root: {
          kind: 'stack',
          dir: 'row',
          children: [
            leaf('/dashboard/sales-by-employee'),
            leaf('/dashboard/sales-kpis', { type: 'kpi' }),
          ],
        },
      },
    });
    expect(r.accepted).toBe(true);
    // Id determinista: gen:<element_id>; renderItem lo enruta y el undo lo encuentra.
    const id = genericElementId(elementId);
    expect(id).toBe('gen:elem-abc');
    expect(store().layout.genericWidgets?.[id]).toBeDefined();
    expect(getWidgetSpec(id)).toBeDefined();
    // Undo (lo que hace App.handleUndoCanvasOps para genéricos): removeElement(genericElementId).
    const undo = store().removeElement(id);
    expect(undo.accepted).toBe(true);
    expect(store().layout.genericWidgets?.[id]).toBeUndefined();
    expect(getWidgetSpec(id)).toBeUndefined();
    expect(freeOf().some((e) => e.id === id)).toBe(false);
  });
});

describe('normalizeGenericSpec — panel v2 (#204): REPARA en vez de podar', () => {
  function addPanel(genericSpec: NonNullable<CanvasOp['genericSpec']>) {
    return store().applyCanvasOp({ op: 'add_widget', position: 'center', genericSpec });
  }
  function lastSpec(): GenericSpec {
    const widgets = store().layout.genericWidgets ?? {};
    return widgets[Object.keys(widgets)[0]!]!;
  }

  it('panel válido (kind:panel + slots tipados) se normaliza y acepta', () => {
    const r = addPanel({
      kind: 'panel',
      title: 'Rendimiento de ventas',
      recipe: 'kpiRow+oneChart',
      density: 'comfortable',
      slots: {
        kpis: [
          {
            piece: 'kpiTile',
            title: 'Facturación',
            endpoint: '/dashboard/sales-kpis',
            valueField: 'revenue',
            format: 'eur',
          },
        ],
        charts: [
          {
            piece: 'comparisonBars',
            title: 'Por vendedor',
            endpoint: '/dashboard/sales-by-employee',
            labelField: 'userName',
            valueField: 'total',
          },
        ],
      },
    });
    expect(r.accepted).toBe(true);
    const spec = lastSpec();
    expect(spec.kind).toBe('panel');
    expect(spec.type).toBe('composite'); // bucket de compat
    expect(spec.recipe).toBe('kpiRow+oneChart');
    expect(spec.density).toBe('comfortable');
    expect(spec.slots?.kpis).toHaveLength(1);
    expect(spec.slots?.charts?.[0]?.piece).toBe('comparisonBars');
    expect(spec.defaultSize).toEqual({ w: 6, h: 3 }); // RECIPE_SIZE (kpiRow+oneChart, media anchura)
  });

  it('REUBICA una pieza en el slot equivocado (no la descarta) y lo reporta en reason', () => {
    const r = addPanel({
      kind: 'panel',
      title: 'X',
      recipe: 'kpiRow',
      slots: {
        kpis: [
          {
            piece: 'comparisonBars',
            endpoint: '/dashboard/sales-by-employee',
            labelField: 'userName',
            valueField: 'total',
          },
        ],
      },
    });
    expect(r.accepted).toBe(true);
    expect(r.reason).toMatch(/reubiqué/);
    const spec = lastSpec();
    expect(spec.slots?.charts?.[0]?.piece).toBe('comparisonBars');
    expect(spec.slots?.kpis ?? []).toHaveLength(0);
  });

  it('INFIERE el format ausente por nombre de campo (revenue→eur)', () => {
    const r = addPanel({
      kind: 'panel',
      title: 'X',
      recipe: 'kpiRow',
      slots: {
        kpis: [{ piece: 'kpiTile', endpoint: '/dashboard/sales-kpis', valueField: 'revenue' }],
      },
    });
    expect(r.accepted).toBe(true);
    expect(r.reason).toMatch(/inferí format=eur/);
    expect(lastSpec().slots?.kpis?.[0]?.format).toBe('eur');
  });

  it('CLAMPA una receta inválida a la más cercana por nº de slots (2 charts → kpiRow+twoCharts)', () => {
    const r = addPanel({
      kind: 'panel',
      title: 'X',
      recipe: 'piramide',
      slots: {
        kpis: [{ piece: 'kpiTile', endpoint: '/dashboard/sales-kpis', valueField: 'revenue' }],
        charts: [
          {
            piece: 'comparisonBars',
            endpoint: '/dashboard/sales-by-employee',
            labelField: 'userName',
            valueField: 'total',
          },
          {
            piece: 'trendArea',
            endpoint: '/dashboard/sales-by-hour',
            labelField: 'hour',
            valueField: 'revenue',
          },
        ],
      },
    });
    expect(r.accepted).toBe(true);
    expect(r.reason).toMatch(/ajusté la receta/);
    expect(lastSpec().recipe).toBe('kpiRow+twoCharts');
  });

  it('RECONCILIA una receta válida pero contradictoria con el nº de piezas y avisa (#212)', () => {
    const r = addPanel({
      kind: 'panel',
      title: 'X',
      recipe: 'kpiRow', // válida, pero pide 0 charts y le pasamos 2
      slots: {
        charts: [
          {
            piece: 'comparisonBars',
            endpoint: '/dashboard/sales-by-employee',
            labelField: 'userName',
            valueField: 'total',
          },
          {
            piece: 'trendArea',
            endpoint: '/dashboard/sales-by-hour',
            labelField: 'hour',
            valueField: 'revenue',
          },
        ],
      },
    });
    expect(r.accepted).toBe(true);
    expect(r.reason).toMatch(/ajusté la receta.*no encajaba/);
    expect(lastSpec().recipe).toBe('kpiRow+twoCharts');
  });

  it('CLAMPA maxBars/maxRows fuera de rango al máximo horneado', () => {
    const r = addPanel({
      kind: 'panel',
      title: 'X',
      recipe: 'kpiRow+oneChart',
      slots: {
        charts: [
          {
            piece: 'comparisonBars',
            endpoint: '/dashboard/sales-by-employee',
            labelField: 'userName',
            valueField: 'total',
            maxBars: 99,
          },
        ],
      },
    });
    expect(r.accepted).toBe(true);
    expect(lastSpec().slots?.charts?.[0]?.maxBars).toBe(8);
  });

  it('PODA DURA: pieza con endpoint fuera de allowlist se descarta, el resto queda intacto', () => {
    const r = addPanel({
      kind: 'panel',
      title: 'X',
      recipe: 'kpiRow+oneChart',
      slots: {
        kpis: [{ piece: 'kpiTile', endpoint: '/dashboard/sales-kpis', valueField: 'revenue' }],
        charts: [
          { piece: 'comparisonBars', endpoint: '/evil/export', labelField: 'a', valueField: 'b' },
        ],
      },
    });
    expect(r.accepted).toBe(true);
    expect(r.reason).toMatch(/endpoint no permitido/);
    const spec = lastSpec();
    expect(spec.slots?.kpis).toHaveLength(1);
    expect(spec.slots?.charts ?? []).toHaveLength(0);
  });

  it('FALLBACK: panel sin piezas válidas degrada a tarjeta de texto (nunca panel vacío)', () => {
    const r = addPanel({
      kind: 'panel',
      title: 'Roto',
      recipe: 'kpiRow',
      slots: { kpis: [{ piece: 'kpiTile', endpoint: '/evil/x', valueField: 'revenue' }] },
    });
    expect(r.accepted).toBe(true);
    expect(r.reason).toMatch(/tarjeta de texto/);
    const spec = lastSpec();
    expect(spec.type).toBe('insight');
    expect(spec.kind).toBeUndefined();
    expect(typeof spec.params?.markdown).toBe('string');
  });

  it('normaliza snake_case del agente (label_field/value_field/max_rows/store_id)', () => {
    const r = addPanel({
      kind: 'panel',
      title: 'X',
      recipe: 'tableFull',
      slots: {
        charts: [
          {
            piece: 'rankBarList',
            endpoint: '/dashboard/product-rankings',
            label_field: 'name',
            value_field: 'units',
            max_rows: 5,
            store_id: 'S1',
          },
        ],
      },
    });
    expect(r.accepted).toBe(true);
    const charts = lastSpec().slots?.charts ?? [];
    const piece = charts[0]!;
    expect(piece.labelField).toBe('name');
    expect(piece.valueField).toBe('units');
    expect(piece.maxRows).toBe(5);
    expect(piece.storeId).toBe('S1');
  });

  it('detecta v2 por version:2 aunque falte kind', () => {
    const r = addPanel({
      version: 2,
      title: 'X',
      recipe: 'kpiRow',
      slots: {
        kpis: [
          {
            piece: 'kpiTile',
            endpoint: '/dashboard/sales-kpis',
            valueField: 'revenue',
            format: 'eur',
          },
        ],
      },
    });
    expect(r.accepted).toBe(true);
    expect(lastSpec().kind).toBe('panel');
  });

  it('TRUNCA el panel al máximo de piezas (12)', () => {
    const charts = Array.from({ length: 15 }, () => ({
      piece: 'comparisonBars',
      endpoint: '/dashboard/sales-by-employee',
      labelField: 'userName',
      valueField: 'total',
    }));
    const r = addPanel({
      kind: 'panel',
      title: 'X',
      recipe: 'kpiRow+twoCharts',
      slots: { charts },
    });
    expect(r.accepted).toBe(true);
    expect(r.reason).toMatch(/recorté el panel a 12/);
    const spec = lastSpec();
    const count = (spec.slots?.kpis?.length ?? 0) + (spec.slots?.charts?.length ?? 0);
    expect(count).toBe(12);
  });
});

// Cuenta hojas de un árbol composite normalizado (para aserciones de poda).
function countLeaves(node: CompositeNode | undefined): number {
  if (!node) return 0;
  return node.kind === 'leaf' ? 1 : node.children.reduce((s, c) => s + countLeaves(c), 0);
}

describe('remove / clear / arrange', () => {
  it('removeElement quita un elemento del lienzo libre', () => {
    store().hydrate({});
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

  // Editar y reenviar (criterio F4.2): el undo de canvas_ops quita las add_* del turno por su
  // id (widgetId para catálogo) y el reenvío no las duplica. Reproduce lo que hace
  // handleUndoCanvasOps en App.tsx (op.elementId ?? op.widgetId → removeElement).
  it('add_widget → undo (por widgetId) → re-add no duplica el widget en el lienzo', () => {
    const count = () =>
      freeOf().filter((e) => e.kind === 'widget' && e.widgetId === 'dash-bars').length;
    store().applyCanvasOp({ op: 'add_widget', widgetId: 'dash-bars' });
    expect(count()).toBe(1);
    // Undo: el CanvasOp persistido lleva widgetId (no elementId) para widgets de catálogo, y el
    // elemento libre usa el widgetId como id, así que removeElement(widgetId) lo encuentra.
    store().removeElement('dash-bars');
    expect(count()).toBe(0);
    // Reenvío del turno corregido: vuelve a añadirse una sola vez.
    store().applyCanvasOp({ op: 'add_widget', widgetId: 'dash-bars' });
    expect(count()).toBe(1);
  });

  it('removeElement desregistra un genérico del registry', () => {
    store().addInsight('x');
    const id = Object.keys(store().layout.genericWidgets ?? {})[0]!;
    store().removeElement(id);
    expect(store().layout.genericWidgets?.[id]).toBeUndefined();
    expect(getWidgetSpec(id)).toBeUndefined();
  });

  it('clearCanvas vacía rejilla, lienzo y genéricos', () => {
    store().hydrate({});
    store().addWidget('dash-bars');
    store().addInsight('x');
    const r = store().clearCanvas();
    expect(r.accepted).toBe(true);
    expect(freeOf()).toHaveLength(0);
    expect(Object.keys(store().layout.genericWidgets ?? {})).toHaveLength(0);
  });

  it('arrange reorganiza el lienzo libre', () => {
    store().hydrate({});
    store().addWidget('dash-bars', 'bottom-right');
    store().addWidget('dash-hour', 'bottom-right');
    const r = store().arrange();
    expect(r.accepted).toBe(true);
    // autoArrangeFree coloca el primero en el origen del flujo.
    expect(freeOf().some((e) => e.x === 0 && e.y === 0)).toBe(true);
  });
});

describe('applyCanvasOp (despacho)', () => {
  it('despacha cada tipo de operación', () => {
    store().hydrate({});
    expect(store().applyCanvasOp({ op: 'add_widget', widgetId: 'dash-bars' }).accepted).toBe(true);
    expect(store().applyCanvasOp({ op: 'add_shape', kind: 'arrow' }).accepted).toBe(true);
    expect(store().applyCanvasOp({ op: 'add_text', text: 'hi' }).accepted).toBe(true);
    expect(store().applyCanvasOp({ op: 'add_note', text: 'n' }).accepted).toBe(true);
    expect(store().applyCanvasOp({ op: 'arrange' }).accepted).toBe(true);
    expect(store().applyCanvasOp({ op: 'clear_canvas' }).accepted).toBe(true);
  });

  it('rechaza operaciones con campos obligatorios ausentes', () => {
    expect(store().applyCanvasOp({ op: 'add_widget' } as { op: 'add_widget' }).accepted).toBe(
      false,
    );
    expect(store().applyCanvasOp({ op: 'remove_element' }).accepted).toBe(false);
  });

  it('add_widget sin genericSpec ni widgetId se rechaza', () => {
    const layoutBefore: LayoutPref = store().layout;
    const r = store().applyCanvasOp({ op: 'add_widget' });
    expect(r.accepted).toBe(false);
    expect(store().layout).toBe(layoutBefore);
  });
});

describe('buildCanvasSnapshot (para el system prompt, F5)', () => {
  it('lienzo vacío', () => {
    const snap = buildCanvasSnapshot();
    expect(snap.elements).toHaveLength(0);
    expect(snap.totalElements).toBe(0);
  });

  it('lista widgets con id y label humano', () => {
    store().addWidget('dash-bars', 'top-left');
    const snap = buildCanvasSnapshot();
    const el = snap.elements.find((e) => e.id === 'dash-bars');
    expect(el).toBeDefined();
    expect(el!.label).toBe('Ventas');
    expect(typeof el!.x).toBe('number');
  });

  it('incluye coords y etiqueta por tipo de elemento', () => {
    store().hydrate({});
    store().addWidget('dash-bars', 'center');
    store().addShape('rect', 'top-left');
    const snap = buildCanvasSnapshot();
    expect(
      snap.elements.some((e) => e.label === 'Ventas (gráfico)' || e.label.includes('Ventas')),
    ).toBe(true);
    expect(snap.elements.some((e) => e.label.startsWith('Forma'))).toBe(true);
    expect(snap.elements.every((e) => typeof e.x === 'number' && typeof e.y === 'number')).toBe(
      true,
    );
  });

  it('trunca a 30 elementos pero reporta el total real', () => {
    store().hydrate({});
    // Inyecta 40 elementos directamente en el preset activo.
    const many = Array.from({ length: 40 }, (_, i) => ({
      kind: 'text' as const,
      id: `t${i}`,
      x: i,
      y: i,
      w: 100,
      h: 40,
      z: i,
      text: `T${i}`,
      color: '#000',
      fontSize: 16,
    }));
    useDashboardStore.setState({
      layout: { freeLayouts: { personalizado: many } },
    });
    const snap = buildCanvasSnapshot();
    expect(snap.elements).toHaveLength(30);
    expect(snap.totalElements).toBe(40);
  });
});
