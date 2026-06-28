// Bloques pre-cableados del dashboard (#205, EPIC #201): paneles v2 COMPLETOS que el agente coloca
// con UNA sola llamada `add_widget widget_id='block:<id>'` (sin construir slots). Cada bloque es una
// receta + slots fijos cableados a endpoints concretos (campos verificados contra los DTO del
// backend). Reduce el whack-a-mole al máximo: cero árbol, cero geometría, diseño probado.
//
// Los bloques son CONFIABLES (los autoramos nosotros), así que NO pasan por normalizePanelSpec: ya
// son un GenericSpec panel válido. `params` (period/storeId) se hereda por todas las hojas.

import type { GenericSpec, PieceSpec, RecipeId, SlotName } from './dashboard-layout.js';
import { RECIPE_SIZE } from './dashboard-pieces.js';

export interface BlockParams {
  period?: string;
  storeId?: string | null;
}

// Aplica los params del bloque (period/storeId) a una hoja-pieza (herencia a todas las hojas).
function withParams(piece: PieceSpec, p: BlockParams): PieceSpec {
  return {
    ...piece,
    ...(p.period ? { period: p.period as NonNullable<PieceSpec['period']> } : {}),
    ...(p.storeId != null ? { storeId: p.storeId } : {}),
  };
}

interface BlockDef {
  label: string;
  recipe: RecipeId;
  build: (p: BlockParams) => Partial<Record<SlotName, PieceSpec[]>>;
}

const BLOCKS: Record<string, BlockDef> = {};

// Metadatos de catálogo de los bloques (paleta/snapshot/etiquetas). El render lo produce la
// colocación (un panel v2 bajo id gen:), no estos metadatos.
export const BLOCK_CATALOG: Record<
  string,
  { label: string; defaultSize: { w: number; h: number } }
> = Object.fromEntries(
  Object.entries(BLOCKS).map(([id, def]) => [
    `block:${id}`,
    { label: def.label, defaultSize: RECIPE_SIZE[def.recipe] },
  ]),
);

export const BLOCK_IDS: readonly string[] = Object.keys(BLOCKS).map((id) => `block:${id}`);

// Construye el GenericSpec (panel v2) de un bloque a partir de su id (`block:<id>` o `<id>`) y los
// params del agente. Devuelve null si el bloque no existe.
export function buildBlockSpec(blockId: string, params: BlockParams): GenericSpec | null {
  const id = blockId.startsWith('block:') ? blockId.slice('block:'.length) : blockId;
  const def = BLOCKS[id];
  if (!def) return null;
  return {
    type: 'composite', // bucket de compat; `kind:'panel'` manda en el render
    kind: 'panel',
    version: 2,
    endpoint: '',
    title: def.label,
    defaultSize: RECIPE_SIZE[def.recipe],
    recipe: def.recipe,
    density: 'comfortable',
    slots: def.build(params),
  };
}
