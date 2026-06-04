import { describe, expect, it } from 'vitest';

import { DEMO_FAMILIES } from '../demo/demoData.js';
import { familySubtreeIds, searchProducts } from './catalog.js';

describe('familySubtreeIds', () => {
  it('incluye la familia y todas sus descendientes', () => {
    const ids = familySubtreeIds(DEMO_FAMILIES, 'fam-aceites');
    expect([...ids].sort()).toEqual(
      ['fam-aceites', 'fam-aceites-cbd10', 'fam-aceites-cbd5', 'fam-aceites-full'].sort(),
    );
  });

  it('una familia hoja solo se contiene a sí misma', () => {
    expect([...familySubtreeIds(DEMO_FAMILIES, 'fam-cosmetica')]).toEqual(['fam-cosmetica']);
  });

  it('una subfamilia (hoja) solo se contiene a sí misma', () => {
    expect([...familySubtreeIds(DEMO_FAMILIES, 'fam-aceites-cbd10')]).toEqual([
      'fam-aceites-cbd10',
    ]);
  });

  it('familia inexistente → conjunto vacío', () => {
    expect(familySubtreeIds(DEMO_FAMILIES, 'no-existe').size).toBe(0);
  });
});

describe('searchProducts', () => {
  it('sin familia devuelve todos los productos demo', async () => {
    expect(await searchProducts('', null)).toHaveLength(12);
  });

  it('una familia PADRE devuelve los productos de todas sus subfamilias (subárbol)', async () => {
    const aceites = await searchProducts('', 'fam-aceites');
    expect(aceites).toHaveLength(3); // CBD 10%, CBD 5%, Full spectrum
    expect(aceites.map((p) => p.id).sort()).toEqual(
      ['p-aceite-cbd-10', 'p-aceite-cbd-5', 'p-aceite-full'].sort(),
    );
  });

  it('una subfamilia hoja filtra solo sus productos', async () => {
    const cbd10 = await searchProducts('', 'fam-aceites-cbd10');
    expect(cbd10).toHaveLength(1);
    expect(cbd10[0]!.id).toBe('p-aceite-cbd-10');
  });

  it('una familia hoja filtra directamente sus productos', async () => {
    expect(await searchProducts('', 'fam-cosmetica')).toHaveLength(2);
  });

  it('combina término de búsqueda y familia', async () => {
    const r = await searchProducts('full', 'fam-aceites');
    expect(r).toHaveLength(1);
    expect(r[0]!.name).toBe('Aceite full spectrum');
  });
});
