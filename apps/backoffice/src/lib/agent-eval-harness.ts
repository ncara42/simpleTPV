// Arnés de evaluación del agente compositor de dashboards (#226, EPIC #223).
//
// Formaliza el workflow adversarial que se usó UNA vez (6 peticiones reales + juez por
// composición) en un arnés REPETIBLE para no regresionar al tocar prompt/vocabulario.
//
// Dos mitades:
//  1. DETERMINISTA (este módulo, gateable en CI sin LLM): `validateComposition` comprueba que las
//     tool calls del agente usan SOLO vocabulario/endpoints/campos/formatos REALES — la "verdad de
//     tierra" son las mismas allowlists que sanea el runtime (`normalizePanelSpec`). valid=100 %.
//  2. MANUAL (juez LLM, gate al cambiar el prompt): ejecutar el agente con un modelo barato sobre
//     `EVAL_REQUESTS`, validar con `validateComposition`, y puntuar coherencia/jerarquía/anti-
//     saturación con `EVAL_RUBRIC`. Umbral: `EVAL_THRESHOLD`. Procedimiento: docs/agent-eval-harness.md.

import { ALL_WIDGET_IDS } from '../widgets/registry.js';
import type { CanvasOp } from './chat.js';
import { BLOCK_IDS } from './dashboard-blocks.js';
import type { PieceFormat, PieceId, SlotName } from './dashboard-layout.js';
import { MAX_COMPOSITE_LEAVES } from './dashboard-layout.js';
import { PIECE_FORMATS, SLOT_PIECES, WIDGETABLE_ENDPOINTS } from './dashboard-pieces.js';

// Formatos válidos = los del contrato (PIECE_FORMATS), no una copia que pueda quedar desfasada:
// omitir `percentRatio` marcaba como inválidas composiciones correctas (detectado en la tanda viva).
const VALID_FORMATS: ReadonlySet<PieceFormat> = new Set<PieceFormat>(PIECE_FORMATS);

// Campos REALES (camelCase) de cada endpoint widgetable — espejo de `WIDGETABLE_ENDPOINTS` del
// prompt (crates/domain/src/chat/context.rs). Verdad de tierra para validar que `labelField`/
// `valueField`/`columns` que emite el agente EXISTEN en el DTO. La paridad del SET de endpoints ya
// se testea (#206); aquí añadimos los campos para el arnés. Mantener en lockstep con el backend.
export const ENDPOINT_FIELDS: Readonly<Record<string, ReadonlySet<string>>> = {
  '/dashboard/sales-by-family': new Set(['familyName', 'total', 'color']),
  '/dashboard/sales-by-hour': new Set(['hour', 'revenue', 'count']),
  '/dashboard/sales-by-employee': new Set(['userName', 'total', 'salesCount']),
  '/dashboard/sales-by-store': new Set([
    'storeName',
    'revenue',
    'avgTicket',
    'margin',
    'salesCount',
  ]),
  '/dashboard/discount-by-employee': new Set(['userName', 'avgDiscountPct', 'salesCount']),
  // product-rankings: forma legacy (name/total/units) + proyección `?rankBy=` (name/value, #225).
  '/dashboard/product-rankings': new Set(['name', 'total', 'units', 'value']),
  '/dashboard/sales-kpis': new Set(['revenue', 'avgTicket', 'upt', 'discountRate', 'returnRate']),
  '/dashboard/margin-kpis': new Set(['grossMargin', 'realMargin', 'marginPct', 'revenue']),
  '/dashboard/stockout-kpis': new Set(['events', 'resolved', 'open', 'rate', 'estimatedLostSales']),
  '/stock/alerts': new Set(['productName', 'storeName', 'alertType', 'severity']),
  '/stock/expiring': new Set(['productName', 'lotCode', 'expiryDate', 'quantity', 'daysToExpiry']),
  '/products': new Set(['name', 'sku', 'salePrice', 'active']),
  '/product-families': new Set(['name', 'parentId', 'archetype']),
  '/suppliers': new Set(['name', 'contact', 'productCount']),
};

// Petición representativa + señales de tierra esperadas (endpoints/bloques que una buena
// composición DEBERÍA tocar). `expectsAnyOf` es laxo a propósito: hay varias composiciones válidas;
// solo exigimos que el agente aterrice en el subsistema de datos correcto.
export interface EvalRequest {
  id: string;
  prompt: string;
  intent: string;
  expectsAnyOf: readonly string[];
  // Solución de referencia (Anthropic, *Demystifying evals*: "create a reference solution: a known
  // working output that passes all graders"). Ancla el grader: una composición conocida-buena para
  // esta petición que `validateComposition` debe aceptar (test determinista). Opcional.
  reference?: readonly CanvasOp[];
}

export const EVAL_REQUESTS: readonly EvalRequest[] = [
  {
    id: 'briefing-matinal',
    prompt: '¿Cómo va la mañana? Dame un resumen rápido de ventas de hoy.',
    intent: 'Resumen de ventas del día (KPIs + tendencia).',
    expectsAnyOf: ['block:sales-overview', '/dashboard/sales-kpis', '/dashboard/sales-by-hour'],
    reference: [
      { op: 'add_widget', widgetId: 'block:sales-overview', position: 'top-left', period: 'today' },
    ],
  },
  {
    id: 'rentabilidad',
    prompt: '¿Qué productos me dejan más margen este mes?',
    intent: 'Top de productos por margen.',
    expectsAnyOf: ['block:top-margin', '/dashboard/product-rankings', '/dashboard/margin-kpis'],
  },
  {
    id: 'control-descuento',
    prompt: '¿Quién está regalando descuentos? Quiero controlar el descuento por vendedor.',
    intent: 'Descuento por empleado.',
    expectsAnyOf: ['/dashboard/discount-by-employee'],
  },
  {
    id: 'mix-ventas',
    prompt: '¿Cómo se reparten las ventas por familia de producto?',
    intent: 'Reparto/mix de ventas por familia (donut).',
    expectsAnyOf: ['/dashboard/sales-by-family'],
  },
  {
    id: 'comparar-tiendas',
    prompt: '¿Qué tienda sube y cuál baja esta semana? ¿Quién es el rezagado?',
    intent: 'Comparativa entre tiendas (multitienda).',
    expectsAnyOf: ['block:store-comparison', '/dashboard/sales-by-store'],
    reference: [
      {
        op: 'add_widget',
        widgetId: 'block:store-comparison',
        position: 'top-left',
        period: 'week',
      },
    ],
  },
  {
    id: 'cierre-de-mes',
    prompt: 'Prepárame un cuadro de cierre de mes: facturación, margen y top productos.',
    intent: 'Panel compuesto de cierre (KPIs + margen + ranking).',
    expectsAnyOf: [
      '/dashboard/sales-kpis',
      '/dashboard/margin-kpis',
      '/dashboard/product-rankings',
    ],
    // Referencia gen:panel (ejercita la validación de hojas: slot-fit, endpoints, campos, formato).
    reference: [
      {
        op: 'add_widget',
        widgetId: 'gen:panel',
        position: 'top-left',
        genericSpec: {
          kind: 'panel',
          recipe: 'kpiRow+oneChart',
          title: 'Cierre de mes',
          slots: {
            kpis: [
              {
                piece: 'kpiTile',
                title: 'Facturación',
                endpoint: '/dashboard/sales-kpis',
                valueField: 'revenue',
                format: 'eur',
                params: { period: 'month' },
              },
              {
                piece: 'kpiTile',
                title: '% margen',
                endpoint: '/dashboard/margin-kpis',
                valueField: 'marginPct',
                format: 'percentRatio',
                params: { period: 'month' },
              },
            ],
            charts: [
              {
                piece: 'rankBarList',
                title: 'Top productos por ventas',
                endpoint: '/dashboard/product-rankings',
                labelField: 'name',
                valueField: 'value',
                format: 'eur',
                params: { rankBy: 'sales', period: 'month' },
              },
            ],
          },
        },
      },
    ],
  },
  {
    id: 'peor-rotacion',
    prompt: '¿Qué productos no se mueven? Enséñame el stock muerto.',
    intent: 'Productos de peor rotación.',
    expectsAnyOf: ['block:dead-stock', '/dashboard/product-rankings'],
  },
];

// Petición NEGATIVA: el agente NO debe componer un widget de datos (Anthropic, *Demystifying
// evals*: "Test both the cases where a behavior should occur and where it shouldn't. One-sided
// evals create one-sided optimization."). El gate en vivo (`runNegativeSuite`) exige
// `hasDataComposition(ops) === false` y que el agente responda en el chat.
export interface NegativeEvalRequest {
  id: string;
  prompt: string;
  intent: string;
}

export const EVAL_NEGATIVE_REQUESTS: readonly NegativeEvalRequest[] = [
  {
    id: 'fuera-de-tema',
    prompt: '¿Qué tiempo hará mañana en Madrid?',
    intent: 'Ajeno al negocio → no compone; dice que está fuera de alcance.',
  },
  {
    id: 'metrica-inexistente',
    prompt: 'Enséñame el NPS y la satisfacción del cliente de este mes.',
    intent: 'Métrica sin endpoint en el dominio → no inventa un panel.',
  },
  {
    id: 'charla',
    prompt: 'Gracias, muy buen trabajo 🙂',
    intent: 'Cortesía → responde en el chat, sin tocar el lienzo.',
  },
];

// Rúbrica del juez LLM (mitad manual). Cada dimensión 0–10; el gate exige media >= 8 y valid=100 %.
export const EVAL_RUBRIC: ReadonlyArray<{ key: string; description: string }> = [
  {
    key: 'coherencia',
    description: 'La composición responde de verdad a la intención de negocio.',
  },
  {
    key: 'jerarquia',
    description:
      'Hay jerarquía (pirámide invertida): lo importante primero, KPIs antes que detalle.',
  },
  {
    key: 'anti-saturacion',
    description: 'No satura (<=4 piezas relevantes; sin gráficas redundantes ni ruido).',
  },
  {
    key: 'fidelidad',
    description: 'No inventa cifras: narra hechos sobre los datos reales que pidió.',
  },
];

export const EVAL_THRESHOLD = { minValidPct: 100, minMeanScore: 8 } as const;

export interface Violation {
  opIndex: number;
  code:
    | 'unknown-widget'
    | 'endpoint-not-allowlisted'
    | 'unknown-piece'
    | 'piece-wrong-slot'
    | 'unknown-field'
    | 'invalid-format'
    | 'oversaturated'
    | 'empty-panel';
  detail: string;
}

export interface CompositionReport {
  valid: boolean;
  violations: Violation[];
  widgetCount: number;
}

function isKnownWidgetId(widgetId: string): boolean {
  return (
    widgetId === 'gen:panel' ||
    (BLOCK_IDS as readonly string[]).includes(widgetId) ||
    (ALL_WIDGET_IDS as readonly string[]).includes(widgetId)
  );
}

// Lee un campo "field" de una pieza laxa (el agente usa snake o camel: value_field/valueField).
function leafField(piece: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = piece[k];
    if (typeof v === 'string' && v) return v;
  }
  return undefined;
}

// Valida una pieza de un panel `gen:panel` contra la verdad de tierra. Acumula violaciones.
function validateLeaf(rawPiece: unknown, slot: SlotName, opIndex: number, out: Violation[]): void {
  const piece = (rawPiece && typeof rawPiece === 'object' ? rawPiece : {}) as Record<
    string,
    unknown
  >;
  const pieceId = leafField(piece, 'piece') as PieceId | undefined;
  if (!pieceId || !(SLOT_PIECES.charts.has(pieceId) || SLOT_PIECES.kpis.has(pieceId))) {
    out.push({ opIndex, code: 'unknown-piece', detail: `pieza desconocida: ${String(pieceId)}` });
    return;
  }
  if (!SLOT_PIECES[slot].has(pieceId)) {
    out.push({
      opIndex,
      code: 'piece-wrong-slot',
      detail: `${pieceId} no admitida en slot ${slot}`,
    });
  }
  const endpoint = leafField(piece, 'endpoint');
  if (!endpoint || !WIDGETABLE_ENDPOINTS.has(endpoint)) {
    out.push({
      opIndex,
      code: 'endpoint-not-allowlisted',
      detail: `endpoint fuera de allowlist: ${String(endpoint)}`,
    });
    return; // sin endpoint válido no podemos validar campos
  }
  const known = ENDPOINT_FIELDS[endpoint];
  const fields = [
    leafField(piece, 'labelField', 'label_field'),
    leafField(piece, 'valueField', 'value_field'),
  ].filter((f): f is string => f != null);
  for (const f of fields) {
    if (known && !known.has(f)) {
      out.push({
        opIndex,
        code: 'unknown-field',
        detail: `campo «${f}» no existe en ${endpoint}`,
      });
    }
  }
  const format = leafField(piece, 'format');
  if (format && !VALID_FORMATS.has(format as PieceFormat)) {
    out.push({ opIndex, code: 'invalid-format', detail: `formato inválido: ${format}` });
  }
}

// Valida una composición (lista de CanvasOp del agente) contra la verdad de tierra. PURA: no toca
// el store ni la red. Devuelve todas las violaciones (no corta en la primera) para diagnóstico.
export function validateComposition(ops: readonly CanvasOp[]): CompositionReport {
  const violations: Violation[] = [];
  let widgetCount = 0;

  ops.forEach((op, opIndex) => {
    if (op.op !== 'add_widget') return; // formas, texto y notas no consumen vocabulario de datos
    widgetCount += 1;
    const widgetId = op.widgetId ?? '';
    if (!isKnownWidgetId(widgetId)) {
      violations.push({ opIndex, code: 'unknown-widget', detail: `widget_id: ${widgetId}` });
      return;
    }
    if (widgetId !== 'gen:panel') return; // bloque/catálogo: ya cableados, sin slots que validar

    const spec = op.genericSpec;
    const slotsRaw = (spec?.slots && typeof spec.slots === 'object' ? spec.slots : {}) as Record<
      string,
      unknown
    >;
    let leaves = 0;
    for (const slot of ['kpis', 'charts'] as SlotName[]) {
      const arr = Array.isArray(slotsRaw[slot]) ? (slotsRaw[slot] as unknown[]) : [];
      leaves += arr.length;
      for (const piece of arr) validateLeaf(piece, slot, opIndex, violations);
    }
    if (leaves === 0) {
      violations.push({ opIndex, code: 'empty-panel', detail: 'panel gen:panel sin piezas' });
    }
    if (leaves > MAX_COMPOSITE_LEAVES) {
      violations.push({
        opIndex,
        code: 'oversaturated',
        detail: `${leaves} piezas > máx ${MAX_COMPOSITE_LEAVES}`,
      });
    }
  });

  return { valid: violations.length === 0, violations, widgetCount };
}

// ¿La composición incluye al menos un widget de DATOS (bloque/panel/catálogo)? Grader de los casos
// negativos: en ellos debe ser `false` (el agente no debe montar un panel para una petición que no
// lo amerita). Formas/texto/notas NO cuentan como composición de datos.
export function hasDataComposition(ops: readonly CanvasOp[]): boolean {
  return ops.some((op) => op.op === 'add_widget' && isKnownWidgetId(op.widgetId ?? ''));
}
