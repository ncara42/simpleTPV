import { expect, type Page, test } from '@playwright/test';

import { gotoApp } from './helpers.js';

// El lienzo libre persiste por usuario en /me/preferences: limpia formas/dibujos/textos de
// ejecuciones previas para partir de un estado conocido (dispatchEvent dispara el onClick del
// botón ×, que está a -9px/opacity:0 hasta el hover y haría frágil un click normal).
async function clearDrawElements(page: Page): Promise<void> {
  const sel = '.dash-free-item--shape, .dash-free-item--draw, .dash-free-item--text';
  const loc = page.locator(sel);
  for (let n = await loc.count(); n > 0; n = await loc.count()) {
    await loc.first().locator('.dash-free-remove').dispatchEvent('click');
    await expect(loc).toHaveCount(n - 1);
  }
}

// Dashboard contra backend real (seed-demo). Los KPIs se calculan en vivo, así que
// las aserciones son estructurales (cards visibles, valores no vacíos) en vez de
// cifras exactas de fixture. Parte autenticada vía storageState (auth.setup.ts).
// Desde I-15 el dashboard se organiza en 4 presets (D-08); cada test fija primero
// el preset que necesita (la preferencia persiste entre tests y ejecuciones).
test.beforeEach(async ({ page }) => {
  await gotoApp(page);
  // El modo (D-20) se persiste global en /me/preferences. Si una ejecución previa dejó
  // "Libre" (p. ej. un fallo a mitad del test de modo), volvemos a "Cuadrícula" para que
  // los tests que esperan el tablero (dash-board) no arranquen rotos.
  const grid = page.getByTestId('dash-mode-grid');
  // «Personalizado» es libre-only y oculta el toggle: si quedó persistido, elige un preset
  // normal para recuperar el toggle de modo antes de forzar cuadrícula.
  if ((await grid.count()) === 0) {
    await page.getByTestId('dash-preset-ventas').click();
    await expect(grid).toBeVisible();
  }
  if ((await grid.getAttribute('aria-selected')) !== 'true') {
    await grid.click();
    await expect(page.getByTestId('dash-board')).toBeVisible();
  }
});

test('preset Ventas (default): sus 3 KPI cards y sus paneles (I-15, D-08d)', async ({ page }) => {
  await page.getByTestId('dash-preset-ventas').click();
  await expect(page.getByTestId('dash-board')).toBeVisible();
  for (const id of ['kpi-today', 'kpi-avg-ticket', 'kpi-upt']) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  // El preset cambia el dashboard COMPLETO: las cards de Beneficio no están.
  await expect(page.getByTestId('kpi-margin')).toHaveCount(0);
  // Valores en vivo: no vacíos (contienen algún dígito), sin asumir cifras exactas.
  await expect(page.getByTestId('kpi-today')).toContainText(/\d/);
  await expect(page.getByTestId('dash-period')).toBeVisible();
  // Paneles del preset: ventas hoy vs ayer · por hora · por familia · top ventas.
  for (const id of ['dash-bars', 'dash-hour', 'dash-family', 'dash-rankings']) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  await expect(page.getByTestId('rank-tabs')).toContainText('Top ventas');
  await expect(page.getByTestId('dash-stockout')).toHaveCount(0);
});

test('cambiar de preset cambia KPIs y paneles en 1 clic y se recuerda (I-15)', async ({ page }) => {
  // Beneficio: 4 cards de margen y el ranking arranca en Top margen.
  await page.getByTestId('dash-preset-beneficio').click();
  for (const id of ['kpi-margin', 'kpi-profit', 'kpi-discount', 'kpi-return']) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  await expect(page.getByTestId('kpi-today')).toHaveCount(0);
  await expect(page.getByTestId('rank-tabs')).toContainText('Top margen');
  await expect(page.getByTestId('dash-discount-emp')).toBeVisible();
  // I-16: comparativa de proveedores con el mejor precio marcado (seed con tarifas).
  await expect(page.getByTestId('dash-suppliers')).toBeVisible();
  await expect(
    page.locator('[data-testid="dash-suppliers"] .sp-price-chip.is-best').first(),
  ).toBeVisible();
  // Persiste tras recargar (preferencia dashboard.layout en /me/preferences).
  await page.reload();
  await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('dash-preset-beneficio')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('kpi-margin')).toBeVisible();
  // Restaurar el default para no condicionar otros tests.
  await page.getByTestId('dash-preset-ventas').click();
  await expect(page.getByTestId('kpi-today')).toBeVisible();
});

test('preset Inventario: roturas, rotación y peor rotación; Equipo: vendedores y fichajes (I-15)', async ({
  page,
}) => {
  await page.getByTestId('dash-preset-inventario').click();
  await expect(page.getByTestId('kpi-lost-sales')).toBeVisible();
  await expect(page.getByTestId('dash-stockout')).toBeVisible();
  await expect(page.getByTestId('dash-rotation')).toBeVisible();
  await expect(page.getByTestId('rank-tabs')).toContainText('Peor rotación');
  // I-16: lotes por caducar y pedidos de compra pendientes, con datos del seed.
  await expect(page.getByTestId('dash-expiring-row').first()).toBeVisible();
  await expect(page.getByTestId('dash-po-row').first()).toBeVisible();
  // Rotación por arquetipo por defecto (IT-13) con conmutador a producto.
  await expect(page.getByTestId('rotation-by-archetype')).toHaveAttribute('aria-selected', 'true');
  await page.getByTestId('rotation-by-product').click();
  await expect(page.getByTestId('rotation-by-product')).toHaveAttribute('aria-selected', 'true');

  await page.getByTestId('dash-preset-equipo').click();
  // Equipo no define tarjetas KPI (D-08): solo paneles, ninguna card en el tablero.
  await expect(page.locator('[data-testid^="kpi-"]')).toHaveCount(0);
  await expect(page.getByTestId('dash-sales-emp')).toBeVisible();
  await expect(page.getByTestId('dash-discount-emp')).toBeVisible();
  await expect(page.getByTestId('dash-timeclock')).toBeVisible();
  // El seed tiene ventas: el panel de vendedores trae al menos una fila con cifra.
  await expect(page.getByTestId('dash-sales-emp')).toContainText(/\d/);

  // I-16: los paneles enlazan a su page de gestión.
  await page.getByTestId('dash-preset-inventario').click();
  await page.getByTestId('dash-po-link').click();
  await expect(page.getByTestId('suppliers-page')).toBeVisible();
  // Volver y restaurar el preset por defecto.
  await page.getByTestId('nav-dashboard').click();
  await page.getByTestId('dash-preset-ventas').click();
  await expect(page.getByTestId('kpi-today')).toBeVisible();
});

test('D-18: el preset dicta la COMPOSICIÓN; la personalización es solo de orden (D-19)', async ({
  page,
}) => {
  await expect(page.getByTestId('dashboard')).toBeVisible();
  // El antiguo editor de mostrar/ocultar tarjetas no existe: la composición (qué cards y
  // paneles aparecen) la fija el preset, no el usuario.
  await expect(page.getByTestId('dash-customize')).toHaveCount(0);
  await expect(page.getByTestId('dash-cards-editor')).toHaveCount(0);
  // Lo que SÍ hay (D-19) es "Personalizar", que solo reordena dentro del preset.
  await expect(page.getByTestId('dash-edit-toggle')).toBeVisible();
  // Cada preset pinta SIEMPRE sus paneles completos.
  await page.getByTestId('dash-preset-equipo').click();
  await expect(page.getByTestId('dash-discount-emp')).toBeVisible();
  await expect(page.getByTestId('dash-sales-emp')).toBeVisible();
  await page.getByTestId('dash-preset-ventas').click();
});

test('Personalizar (D-19): mover una card por teclado persiste y Restablecer lo deshace', async ({
  page,
}) => {
  await page.getByTestId('dash-preset-ventas').click();
  await expect(page.getByTestId('dash-board')).toBeVisible();

  // El tile (react-grid-item) que contiene la card "Facturación hoy".
  const tile = page.locator('.dash-tile', { has: page.getByTestId('kpi-today') });
  await expect(tile).toBeVisible();
  const start = await tile.boundingBox();
  if (!start) throw new Error('sin bounding box de la card');

  // Entra en edición: el tablero muestra el modo (rejilla de puntos) y los tiles editables.
  await page.getByTestId('dash-edit-toggle').click();
  await expect(page.locator('.dash-board.is-editing')).toBeVisible();
  await expect(page.getByTestId('dash-edit-save')).toBeVisible();

  // Reposicionado por TECLADO (RGL no tiene arrastre por teclado): enfoca el tile y muévelo
  // a la derecha con las flechas (horizontal: la compactación vertical no lo deshace).
  await tile.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.getByTestId('dash-edit-save').click();

  // La card cambió de columna respecto al inicio.
  const sameXAsStart = async (): Promise<boolean> => {
    const b = await tile.boundingBox();
    return !!b && Math.round(b.x) === Math.round(start.x);
  };
  await expect.poll(sameXAsStart).toBe(false);
  const moved = await tile.boundingBox();
  if (!moved) throw new Error('sin bounding box tras mover');

  // Persiste tras recargar (preferencia dashboard.layout en /me/preferences).
  await page.reload();
  await expect(page.getByTestId('dash-board')).toBeVisible({ timeout: 15000 });
  await expect
    .poll(async () => {
      const b = await tile.boundingBox();
      return !!b && Math.round(b.x) === Math.round(moved.x);
    })
    .toBe(true);

  // Restablecer devuelve la colocación por defecto (limpia el estado para otros tests).
  await page.getByTestId('dash-edit-toggle').click();
  await page.getByTestId('dash-edit-reset').click();
  await page.getByTestId('dash-edit-save').click();
  await expect.poll(sameXAsStart).toBe(true);
});

test('Ventas es page propia: el dashboard no embebe la tabla y enlaza al final (I-17, D-06)', async ({
  page,
}) => {
  // El dashboard ya no contiene el historial de ventas (E-10: scroll eterno).
  await expect(page.getByTestId('dashboard')).toBeVisible();
  await expect(page.getByTestId('sales-table')).toHaveCount(0);
  // El pie enlaza a la page de Ventas con su DataTable completo.
  await page.getByTestId('dash-to-sales').click();
  await expect(page.getByTestId('sales-table')).toBeVisible();
  await expect(page.getByTestId('sales-totals')).toBeVisible();
});

test('U-02: el toggle barras ↔ línea cambia los gráficos y persiste', async ({ page }) => {
  await page.getByTestId('dash-preset-ventas').click();
  await expect(page.getByTestId('dash-hour')).toBeVisible();
  // Por defecto, barras.
  await expect(page.getByTestId('dash-hour').locator('.ui-chart-bar').first()).toBeVisible();
  // Cambiar a línea desde el toggle propio de "Ventas por hora" (Ventas tiene el suyo,
  // ambos comparten la misma preferencia global): aparece la polyline y desaparecen las barras.
  await page.getByTestId('dash-hour').getByTestId('dash-chart-kind-line').click();
  await expect(page.getByTestId('dash-hour').locator('.ui-chart-line-path')).toBeVisible();
  await expect(page.getByTestId('dash-hour').locator('.ui-chart-bar')).toHaveCount(0);
  // Persiste tras recargar (preferencia en /me/preferences).
  await page.reload();
  await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('dash-hour').locator('.ui-chart-line-path')).toBeVisible();
  // Restaura a barras para no dejar la preferencia sucia entre tests.
  await page.getByTestId('dash-hour').getByTestId('dash-chart-kind-bars').click();
  await expect(page.getByTestId('dash-hour').locator('.ui-chart-bar').first()).toBeVisible();
});

test('el toggle de gráfico y el desplegable de comparación viven dentro de la card de Ventas', async ({
  page,
}) => {
  await page.getByTestId('dash-preset-ventas').click();
  const bars = page.getByTestId('dash-bars');
  await expect(bars).toBeVisible();
  // El toggle barras/línea ya no está en la cabecera global: vive en la card.
  await expect(bars.getByTestId('dash-chart-kind')).toBeVisible();
  // Desplegable de comparación: por defecto "Hoy vs ayer".
  const compare = bars.getByTestId('dash-compare');
  await expect(compare).toBeVisible();
  await expect(compare).toContainText('Hoy vs ayer');

  // Cambiar a comparación por mes: el desplegable refleja la nueva selección
  // (mes actual vs anterior) y deja de decir Hoy.
  const MONTHS = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ];
  const currentMonth = MONTHS[new Date().getMonth()]!;
  await compare.click();
  await page.locator('[role="option"][data-value="month"]').click();
  await expect(compare).toContainText(currentMonth);
  await expect(compare).not.toContainText('Hoy');

  // Restaura a día para no afectar a otros tests/ejecuciones.
  await compare.click();
  await page.locator('[role="option"][data-value="day"]').click();
  await expect(compare).toContainText('Hoy vs ayer');
});

test('Ventas por familia: lista con scroll vertical y buscador', async ({ page }) => {
  await page.getByTestId('dash-preset-ventas').click();
  const fam = page.getByTestId('dash-family');
  await expect(fam).toBeVisible();
  // Se renderizan TODAS las familias (el seed-demo tiene más de 5); la lista
  // hace scroll en vez de paginar.
  const list = fam.getByTestId('dash-family-list');
  const total = await list.locator('li').count();
  expect(total).toBeGreaterThan(5);
  // El contenedor de scroll desborda → indicador "hay más" presente.
  await expect(fam.locator('.dash-family-scroll')).toHaveClass(/has-more/);
  // Buscador: sin coincidencias → estado vacío; al limpiar, vuelve a la lista.
  await fam.getByTestId('dash-family-search').fill('zzz-no-existe');
  await expect(fam.locator('.catalog-empty')).toBeVisible();
  await fam.getByTestId('dash-family-search').fill('');
  await expect(list.locator('li')).toHaveCount(total);
});

test('preferencias por defecto: el dashboard recuerda el periodo elegido (IT-16)', async ({
  page,
}) => {
  // Espera a que carguen los KPIs antes de tocar el selector: si llega data a media
  // interacción, un re-render cierra el desplegable y la selección se pierde.
  await page.getByTestId('dash-preset-ventas').click();
  await expect(page.getByTestId('kpi-today')).toContainText(/\d/);
  // Cambiar a Semana y comprobar que el periodo persiste tras recargar.
  await page.getByTestId('dash-period').click();
  await page.locator('[role="option"][data-value="week"]').click();
  await expect(page.getByTestId('dash-period')).toContainText('Semana');
  await page.reload();
  await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('dash-period')).toContainText('Semana');
  // Volver a Hoy también persiste (no se asume el estado inicial: es una preferencia
  // que otros tests/ejecuciones pueden haber cambiado).
  await page.getByTestId('dash-period').click();
  await page.locator('[role="option"][data-value="today"]').click();
  await expect(page.getByTestId('dash-period')).toContainText('Hoy');
  await page.reload();
  await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('dash-period')).toContainText('Hoy');
});

test('Modo Libre (D-20): toggle a lienzo edgeless, mover una card a píxel y persiste', async ({
  page,
}) => {
  await page.getByTestId('dash-preset-ventas').click();
  // Por defecto se entra en Cuadrícula.
  await expect(page.getByTestId('dash-board')).toBeVisible();

  // Cambiar a Libre: aparece el lienzo y sus controles de zoom; desaparece el tablero.
  await page.getByTestId('dash-mode-free').click();
  await expect(page.getByTestId('dash-free')).toBeVisible();
  await expect(page.getByTestId('dash-free-zoom')).toBeVisible();
  await expect(page.getByTestId('dash-board')).toHaveCount(0);

  // Normaliza la disposición (Ordenar) para que las cards estén a la vista y a un zoom usable:
  // robusto frente al "drift" que acumulan las ejecuciones locales repetidas de este test.
  await page.getByTestId('dash-free-arrange').click();
  await page.waitForTimeout(400);

  // Las cards del preset se pintan en el lienzo (a píxel). Mover "Facturación hoy".
  const item = page.locator('.dash-free-item', { has: page.getByTestId('kpi-today') });
  await expect(item).toBeVisible();
  // El transform inline de la card es su posición de MUNDO (independiente del pan/zoom).
  const worldTf = (): Promise<string> => item.evaluate((el) => (el as HTMLElement).style.transform);
  const tf0 = await worldTf();
  const b = await item.boundingBox();
  if (!b) throw new Error('sin bounding box de la card');
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 140, b.y + b.height / 2 + 100, { steps: 12 });
  // Al soltar se persiste la disposición (PUT optimista a /me/preferences): espera a que el
  // servidor lo confirme antes de recargar, o el reload puede correr antes que el PUT.
  const persisted = page.waitForResponse(
    (r) => r.url().includes('/me/preferences/dashboard.layout') && r.request().method() === 'PUT',
  );
  await page.mouse.up();
  await expect.poll(worldTf).not.toBe(tf0);
  const tf1 = await worldTf();
  await persisted;

  // Persiste tras recargar: sigue en Libre y la card conserva su posición de mundo.
  await page.reload();
  await expect(page.getByTestId('dash-free')).toBeVisible({ timeout: 15000 });
  const item2 = page.locator('.dash-free-item', { has: page.getByTestId('kpi-today') });
  await expect.poll(() => item2.evaluate((el) => (el as HTMLElement).style.transform)).toBe(tf1);

  // Volver a Cuadrícula (restaura el modo por defecto para el resto de tests).
  await page.getByTestId('dash-mode-grid').click();
  await expect(page.getByTestId('dash-board')).toBeVisible();
  await expect(page.getByTestId('dash-free')).toHaveCount(0);
});

test('Modo Libre: añadir nota y widget, quitar, deshacer y ordenar; minimapa visible', async ({
  page,
}) => {
  await page.getByTestId('dash-preset-ventas').click();
  await page.getByTestId('dash-mode-free').click();
  await expect(page.getByTestId('dash-free')).toBeVisible();
  await expect(page.getByTestId('dash-free-toolbar')).toBeVisible();
  // El minimapa se pinta en la esquina del lienzo.
  await expect(page.getByTestId('dash-free-minimap')).toBeVisible();

  // El layout libre persiste en /me/preferences: limpia notas de ejecuciones previas para
  // partir de un estado conocido (0 notas). dispatchEvent dispara el onClick directo en el
  // nodo (el botón × está a -9px y opacity:0 hasta el hover → click normal sería frágil).
  const notes = page.locator('.dash-free-item--note');
  for (let n = await notes.count(); n > 0; n = await notes.count()) {
    await notes.first().locator('.dash-free-remove').dispatchEvent('click');
    await expect(notes).toHaveCount(n - 1);
  }

  const items = page.locator('.dash-free-item');
  const baseCount = await items.count();

  // Añadir una NOTA: aparece una tarjeta de nota con su editor (carga diferida de TipTap).
  await page.getByTestId('dash-free-add-note').click();
  await expect(notes).toHaveCount(1);
  await expect(notes.locator('.dash-free-note-content').first()).toBeVisible();

  // Deshacer ("botón volver") quita la nota recién creada.
  await page.getByTestId('dash-free-undo').click();
  await expect(notes).toHaveCount(0);

  // Añadir un WIDGET desde la paleta (uno que no estaba en el preset Ventas).
  await page.getByTestId('dash-free-add-widget').click();
  const palette = page.locator('.dash-free-palette');
  await expect(palette).toBeVisible();
  await palette.locator('button[role="menuitem"]').first().click();
  await expect(items).toHaveCount(baseCount + 1);

  // Deshacer también revierte el alta del widget.
  await page.getByTestId('dash-free-undo').click();
  await expect(items).toHaveCount(baseCount);

  // Ordenar (reorganizar automático): recoloca → cambia el transform de mundo de una card.
  const first = page.locator('.dash-free-item', { has: page.getByTestId('kpi-today') });
  const tf0 = await first.evaluate((el) => (el as HTMLElement).style.transform);
  await page.getByTestId('dash-free-arrange').click();
  await expect
    .poll(() => first.evaluate((el) => (el as HTMLElement).style.transform))
    .not.toBe(tf0);

  // Restaurar el modo por defecto para el resto de tests.
  await page.getByTestId('dash-mode-grid').click();
  await expect(page.getByTestId('dash-board')).toBeVisible();
});

test('Modo Libre: la flecha de orientación aparece al alejarse y encuadra al pulsarla', async ({
  page,
}) => {
  await page.getByTestId('dash-preset-ventas').click();
  await page.getByTestId('dash-mode-free').click();
  const canvas = page.getByTestId('dash-free');
  await expect(canvas).toBeVisible();
  // Sin formas/dibujos sueltos lejanos: así el contenido a encuadrar son solo los widgets.
  await clearDrawElements(page);

  // Alejar la vista con el teclado hasta perder de vista el dashboard.
  await canvas.focus();
  for (let i = 0; i < 80; i++) await page.keyboard.press('ArrowRight');

  // La flecha de orientación aparece pegada al margen.
  const arrow = page.getByTestId('dash-free-arrow');
  await expect(arrow).toBeVisible();
  // Pulsarla vuelve a encuadrar el contenido → la flecha desaparece.
  await arrow.click();
  await expect(arrow).toHaveCount(0);

  await page.getByTestId('dash-mode-grid').click();
  await expect(page.getByTestId('dash-board')).toBeVisible();
});

test('Modo Libre: herramientas de dibujo (forma, lápiz a mano y texto libre)', async ({ page }) => {
  await page.getByTestId('dash-preset-ventas').click();
  await page.getByTestId('dash-mode-free').click();
  await expect(page.getByTestId('dash-free-toolbar')).toBeVisible();
  await clearDrawElements(page);

  const canvas = page.getByTestId('dash-free');
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  const items = page.locator('.dash-free-item');
  const base = await items.count();
  const shapes = page.locator('.dash-free-shape-svg');
  const shapesBase = await shapes.count();

  // "Dibujar" abre el pill horizontal de herramientas encima de la barra inferior.
  await page.getByTestId('dash-free-draw').click();
  await expect(page.getByTestId('dash-free-draw-pill')).toBeVisible();

  // Forma: rectángulo (arrastrar sobre el fondo). En modo dibujo los elementos son inertes,
  // así que el gesto llega al lienzo aunque pase por encima de un widget.
  await page.getByTestId('dash-free-tool-rect').click();
  await page.mouse.move(cx - 220, cy - 80);
  await page.mouse.down();
  await page.mouse.move(cx - 70, cy + 30, { steps: 6 });
  await page.mouse.up();
  await expect(shapes).toHaveCount(shapesBase + 1);

  // Lápiz: trazo a mano alzada (varios puntos).
  await page.getByTestId('dash-free-tool-pen').click();
  await page.mouse.move(cx - 220, cy + 120);
  await page.mouse.down();
  for (let i = 0; i <= 12; i++) {
    await page.mouse.move(cx - 220 + i * 14, cy + 120 + Math.sin(i / 2) * 20, { steps: 1 });
  }
  await page.mouse.up();
  await expect(shapes).toHaveCount(shapesBase + 2);

  // Cierra el pill (vuelve a seleccionar) y crea un TEXTO libre desde su botón: aparece
  // centrado y en edición (textarea); se escribe y al desenfocar persiste.
  await page.getByTestId('dash-free-draw').click();
  await page.getByTestId('dash-free-add-text').click();
  const textInput = page.locator('.dash-free-text-input');
  await expect(textInput).toBeVisible();
  await textInput.fill('Hola');
  await page.mouse.click(box.x + 30, box.y + 30); // clic fuera → blur
  await expect(page.locator('.dash-free-item--text')).toContainText('Hola');

  // Limpieza: deshacer hasta volver al estado base para no ensuciar las preferencias.
  const undoBtn = page.getByTestId('dash-free-undo');
  for (let i = 0; i < 8 && (await items.count()) > base; i++) {
    if (await undoBtn.isDisabled()) break;
    await undoBtn.click();
  }
  await page.getByTestId('dash-mode-grid').click();
  await expect(page.getByTestId('dash-board')).toBeVisible();
});

test('Modo Libre · Personalizado: lienzo vacío con + que abre el buscador de widgets', async ({
  page,
}) => {
  // Seleccionar «Personalizado» entra en modo libre con un lienzo en blanco. Es libre-only:
  // el toggle Cuadrícula/Libre se oculta (no tendría sentido un tablero vacío).
  await page.getByTestId('dash-preset-personalizado').click();
  await expect(page.getByTestId('dash-free')).toBeVisible();
  await expect(page.getByTestId('dash-mode')).toHaveCount(0);

  // Limpia widgets que pudieran haber quedado de ejecuciones previas (estado persistido).
  const widgets = page.locator('.dash-free-item--widget');
  for (let n = await widgets.count(); n > 0; n = await widgets.count()) {
    await widgets.first().locator('.dash-free-remove').dispatchEvent('click');
    await expect(widgets).toHaveCount(n - 1);
  }

  // Estado vacío: "+" central.
  await expect(page.getByTestId('dash-free-empty')).toBeVisible();
  await page.getByTestId('dash-free-empty-add').click();

  // Buscador: filtra el catálogo y añade un widget.
  const search = page.getByTestId('dash-free-palette-search');
  await expect(search).toBeVisible();
  await search.fill('familia');
  await page.locator('.dash-free-palette-list button').first().click();
  await expect(widgets).toHaveCount(1);
  await expect(page.getByTestId('dash-free-empty')).toHaveCount(0);

  // Limpieza: quita el widget y vuelve a Ventas + Cuadrícula para el resto de tests.
  await widgets.first().locator('.dash-free-remove').dispatchEvent('click');
  await page.getByTestId('dash-preset-ventas').click();
  await page.getByTestId('dash-mode-grid').click();
  await expect(page.getByTestId('dash-board')).toBeVisible();
});
