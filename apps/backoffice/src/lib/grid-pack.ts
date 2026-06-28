// Empaquetado de tiles del modo CUADRÍCULA. El reto: los widgets tienen ANCHO y ALTO variables (en
// unidades de rejilla) y deben quedar «perfectamente encajados» —sin huecos interiores— ocupando el
// ANCHO COMPLETO, SIN redimensionar ninguno para tapar huecos. Una rejilla CSS con `auto-flow: dense`
// no basta: solo rellena celdas vacías con bloques que quepan en su recorrido, así que bajo un bloque
// alto (h2/h3) queda un escalón vacío cuando no hay un bloque bajo (h1) que entre.
//
// Solución: compactación vertical tipo «skyline». Mantiene la altura ocupada de cada columna y coloca
// cada bloque (en ORDEN de lectura) en el escalón más BAJO donde cabe a lo ancho (empate → más a la
// izquierda). Así un bloque posterior cae dentro del escalón que dejó uno alto anterior, rellenando el
// hueco SIN tocar el tamaño de nadie. Es el mismo principio que la compactación de los dashboards por
// rejilla (react-grid-layout / Gridstack). Coste O(n · columnas).

export interface PackInput {
  id: string;
  /** Ancho en unidades de columna (se capa a las columnas disponibles). */
  cols: number;
  /** Alto en filas. */
  rows: number;
}

export interface PackedTile {
  id: string;
  /** Columna de inicio (base 0). */
  col: number;
  /** Fila de inicio (base 0). */
  row: number;
  /** Ancho efectivo en columnas (ya capado a las disponibles). */
  cols: number;
  /** Alto en filas. */
  rows: number;
}

// Coloca los bloques compactando hacia arriba con la heurística «skyline best-fit». En cada paso:
//   1) localiza el escalón más BAJO de la silueta (su columna inicial `s` y su anchura plana `L`);
//   2) entre los bloques que quedan, EN ORDEN, toma el primero cuyo ancho ≤ L → entra en el escalón
//      sin enterrar nada (encaje limpio). Esto «adelanta» un bloque estrecho posterior para tapar el
//      hueco que dejó uno alto, en vez de dejarlo vacío;
//   3) si ninguno cabe en el escalón (todos más anchos que L), coloca el SIGUIENTE en orden en su
//      mejor posición (la de aterrizaje más bajo) y sigue.
// Resultado: huecos interiores mínimos a ancho completo, SIN redimensionar ningún bloque y con una
// reubicación mínima (solo saltan bloques estrechos para rellenar escalones). Un bloque más ancho
// que `totalCols` se capa a fila completa. La salida NO va en orden de entrada (cada tile se mapea
// por id en el render), sino en el orden en que se fueron colocando.
export function packGridTiles(items: readonly PackInput[], totalCols: number): PackedTile[] {
  const cols = Math.max(1, Math.floor(totalCols));
  const heights = new Array<number>(cols).fill(0); // «skyline»: filas ocupadas por columna
  const pending = items.map((it) => ({
    id: it.id,
    w: Math.min(Math.max(1, it.cols), cols),
    h: Math.max(1, it.rows),
  }));
  const out: PackedTile[] = [];

  // Aterrizaje de silueta más bajo (col/fila) para un bloque de ancho `w`; empate → más a la izda.
  const lowestFor = (w: number): { col: number; row: number } => {
    let bestCol = 0;
    let bestTop = Infinity;
    for (let c = 0; c + w <= cols; c++) {
      let top = 0;
      for (let k = c; k < c + w; k++) {
        const hk = heights[k]!;
        if (hk > top) top = hk;
      }
      if (top < bestTop) {
        bestTop = top;
        bestCol = c;
      }
    }
    return { col: bestCol, row: bestTop };
  };

  while (pending.length > 0) {
    // (1) escalón más bajo de la silueta y su anchura plana.
    let minH = Infinity;
    let s = 0;
    for (let c = 0; c < cols; c++) {
      if (heights[c]! < minH) {
        minH = heights[c]!;
        s = c;
      }
    }
    let ledge = 0;
    while (s + ledge < cols && heights[s + ledge] === minH) ledge++;

    // (2) primer pendiente (en orden) que encaja limpio en ese escalón.
    let idx = pending.findIndex((p) => p.w <= ledge);
    let col: number;
    let row: number;
    if (idx >= 0) {
      col = s;
      row = minH;
    } else {
      // (3) ninguno cabe en el escalón → coloca el siguiente en orden donde aterrice más bajo.
      idx = 0;
      ({ col, row } = lowestFor(pending[0]!.w));
    }
    const chosen = pending.splice(idx, 1)[0]!;
    for (let k = col; k < col + chosen.w; k++) heights[k] = row + chosen.h;
    out.push({ id: chosen.id, col, row, cols: chosen.w, rows: chosen.h });
  }
  return out;
}
