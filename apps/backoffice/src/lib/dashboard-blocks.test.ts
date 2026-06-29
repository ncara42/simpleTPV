import { describe, expect, it } from 'vitest';

import { BLOCK_CATALOG, BLOCK_IDS, buildBlockSpec } from './dashboard-blocks.js';

describe('dashboard-blocks — bloques pre-cableados (#205)', () => {
  it('el catálogo está vacío (sin bloques)', () => {
    expect(BLOCK_IDS).toEqual([]);
    expect(Object.keys(BLOCK_CATALOG)).toHaveLength(0);
  });

  it('bloque desconocido → null', () => {
    expect(buildBlockSpec('block:no-existe', {})).toBeNull();
    expect(buildBlockSpec('block:', {})).toBeNull();
  });
});
