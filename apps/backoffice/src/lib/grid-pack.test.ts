import { describe, expect, it } from 'vitest';

import { type PackedTile, packGridTiles } from './grid-pack.js';

// Reconstruye el mapa de ocupación y comprueba invariantes duros del empaquetado.
function assertValid(placed: PackedTile[], totalCols: number): void {
  const occ = new Set<string>();
  for (const p of placed) {
    expect(p.cols).toBeGreaterThanOrEqual(1);
    expect(p.rows).toBeGreaterThanOrEqual(1);
    // No desborda el ancho de la rejilla.
    expect(p.col).toBeGreaterThanOrEqual(0);
    expect(p.col + p.cols).toBeLessThanOrEqual(totalCols);
    // No se solapa con ningún otro bloque ya colocado.
    for (let r = p.row; r < p.row + p.rows; r++) {
      for (let c = p.col; c < p.col + p.cols; c++) {
        const key = `${r},${c}`;
        expect(occ.has(key)).toBe(false);
        occ.add(key);
      }
    }
  }
}

describe('packGridTiles', () => {
  it('coloca todos los bloques sin solapes ni desbordes', () => {
    const items = [
      { id: 'a', cols: 12, rows: 1 },
      { id: 'b', cols: 3, rows: 1 },
      { id: 'c', cols: 6, rows: 2 },
      { id: 'd', cols: 4, rows: 3 },
      { id: 'e', cols: 5, rows: 2 },
      { id: 'f', cols: 7, rows: 2 },
      { id: 'g', cols: 3, rows: 2 },
    ];
    const placed = packGridTiles(items, 12);
    expect(placed).toHaveLength(items.length);
    expect(new Set(placed.map((p) => p.id))).toEqual(new Set(items.map((i) => i.id)));
    assertValid(placed, 12);
  });

  it('capa el ancho a las columnas disponibles (un bloque > totalCols ocupa la fila completa)', () => {
    const placed = packGridTiles([{ id: 'wide', cols: 12, rows: 1 }], 3);
    expect(placed[0]).toMatchObject({ id: 'wide', col: 0, cols: 3, rows: 1 });
  });

  it('rellena el escalón bajo un bloque alto con un bloque estrecho posterior (sin huecos)', () => {
    // Reproduce el caso real: kpi (w3·h1) deja un escalón a su lado de un gráfico alto; un compacto
    // (w3·h2) posterior debe SUBIR a ese escalón en vez de dejar el hueco. Con 6 columnas: la banda
    // [kpi(0..2), graf(3..5 h2)] deja el escalón col0..2 en la fila 1 → el w3·h2 entra ahí.
    const placed = packGridTiles(
      [
        { id: 'kpi', cols: 3, rows: 1 },
        { id: 'graf', cols: 3, rows: 2 },
        { id: 'cmp', cols: 3, rows: 2 },
      ],
      6,
    );
    const byId = Object.fromEntries(placed.map((p) => [p.id, p]));
    // kpi arriba-izquierda; graf a su derecha; cmp rellena el escalón bajo el kpi (col 0, fila 1).
    expect(byId.kpi).toMatchObject({ col: 0, row: 0 });
    expect(byId.cmp).toMatchObject({ col: 0, row: 1 });
    assertValid(placed, 6);
  });

  it('es determinista (misma entrada → misma salida)', () => {
    const items = [
      { id: 'a', cols: 3, rows: 1 },
      { id: 'b', cols: 6, rows: 2 },
      { id: 'c', cols: 3, rows: 2 },
      { id: 'd', cols: 4, rows: 3 },
    ];
    expect(packGridTiles(items, 12)).toEqual(packGridTiles(items, 12));
  });

  it('tesela sin huecos una fila exacta (4+4+4 en 12 columnas)', () => {
    const placed = packGridTiles(
      [
        { id: 'a', cols: 4, rows: 3 },
        { id: 'b', cols: 4, rows: 3 },
        { id: 'c', cols: 4, rows: 3 },
      ],
      12,
    );
    // Las tres listas comparten fila 0 y cubren las 12 columnas sin hueco.
    expect(placed.every((p) => p.row === 0)).toBe(true);
    expect(placed.map((p) => p.col).sort((x, y) => x - y)).toEqual([0, 4, 8]);
    assertValid(placed, 12);
  });
});
