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

// Limpia todos los widgets del lienzo libre (para partir de un estado conocido).
async function clearFreeWidgets(page: Page): Promise<void> {
  const widgets = page.locator('.dash-free-item--widget');
  for (let n = await widgets.count(); n > 0; n = await widgets.count()) {
    await widgets.first().locator('.dash-free-remove').dispatchEvent('click');
    await expect(widgets).toHaveCount(n - 1);
  }
}

// Las herramientas del lienzo (widget/nota/texto/dibujar/deshacer/ordenar) viven ahora dentro
// del menú «+» del dock inferior: hay que abrirlo antes de pulsar cada acción (al pulsar una, el
// menú se cierra). Cada acción dispara el handle imperativo de FreeBoard.
async function clickTool(page: Page, testId: string): Promise<void> {
  await page.getByTestId('dash-free-tools').click();
  await page.getByTestId(testId).click();
}

// «Deshacer» con comprobación de disabled: abre el menú, deshace si puede; devuelve si actuó.
async function undoOnce(page: Page): Promise<boolean> {
  await page.getByTestId('dash-free-tools').click();
  const undo = page.getByTestId('dash-free-undo');
  if (await undo.isDisabled()) {
    await page.keyboard.press('Escape');
    return false;
  }
  await undo.click();
  return true;
}

// Dashboard contra backend real (seed-demo). Los tests son estructurales (dashboard visible,
// chip «Personalizado» presente, lienzo libre funcional). Parte autenticada vía storageState.
// El dashboard es SIEMPRE un lienzo libre (el modo Cuadrícula se eliminó).
test.beforeEach(async ({ page }) => {
  await gotoApp(page);
  await expect(page.getByTestId('dash-free')).toBeVisible();
});

// ── Tests skipped hasta F1.1/F1.2 (widgets configurables por el agente) ──────────────────

test.skip('preset Ventas (default): sus 3 KPI cards y sus paneles (I-15, D-08d)', async () => {
  // Reimplementar en F1.1 — el agente configura los widgets en vez de presets fijos.
});

test.skip('cambiar de preset cambia KPIs y paneles en 1 clic y se recuerda (I-15)', async () => {
  // Reimplementar en F1.1 — presets eliminados en F0.
});

test.skip('preset Inventario y Equipo: sus paneles respectivos (I-15)', async () => {
  // Reimplementar en F1.1 — presets eliminados en F0.
});

test.skip('D-18: el preset dicta la COMPOSICIÓN; la personalización es solo de orden (D-19)', async () => {
  // Feature eliminada en F0 — la composición la decide el agente (F2+).
});

test.skip('Personalizar (D-19): mover una card por teclado persiste y Restablecer lo deshace', async () => {
  // Reimplementar en F1.1/F4.1 — requiere widgets en el lienzo configurados por el agente.
});

test.skip('U-02: el toggle barras ↔ línea cambia los gráficos y persiste', async () => {
  // Reimplementar en F1.2 — requiere widgets de gráfico en el lienzo.
});

test.skip('el toggle de gráfico y el desplegable de comparación viven dentro de la card de Ventas', async () => {
  // Reimplementar en F1.2 — requiere widgets de ventas en el lienzo.
});

test.skip('Ventas por familia: lista con scroll vertical y buscador', async () => {
  // Reimplementar en F1.2 — requiere widget dash-family en el lienzo.
});

test.skip('preferencias por defecto: el dashboard recuerda el periodo elegido (IT-16)', async () => {
  // Eliminado en F0 — el selector de período fue retirado de la cabecera.
});

// ── Tests activos ─────────────────────────────────────────────────────────────────────────

test('cabecera muestra el nombre por defecto del lienzo y el dashboard es un lienzo libre', async ({
  page,
}) => {
  await expect(page.getByTestId('dashboard')).toBeVisible();
  // Nombre por defecto del lienzo, editable al pulsar encima.
  await expect(page.getByTestId('dash-preset-personalizado')).toBeVisible();
  await expect(page.getByTestId('dash-preset-personalizado')).toContainText('Canvas 1');
  // El lienzo libre es la única vista (el modo Cuadrícula y su toggle se eliminaron).
  await expect(page.getByTestId('dash-free')).toBeVisible();
  await expect(page.getByTestId('dash-free-toolbar')).toBeVisible();
  await expect(page.getByTestId('dash-mode')).toHaveCount(0);
  await expect(page.getByTestId('dash-board')).toHaveCount(0);
  // No existen los selectores de preset antiguo, periodo ni tienda.
  await expect(page.getByTestId('dash-preset-ventas')).toHaveCount(0);
  await expect(page.getByTestId('dash-preset-beneficio')).toHaveCount(0);
  await expect(page.getByTestId('dash-period')).toHaveCount(0);
  await expect(page.getByTestId('dash-store')).toHaveCount(0);
});

test('el nombre del lienzo se renombra al pulsar encima', async ({ page }) => {
  await expect(page.getByTestId('dashboard')).toBeVisible();
  await page.getByTestId('dash-preset-personalizado').click();
  const input = page.getByTestId('dash-preset-name-input');
  await expect(input).toBeVisible();
  await input.fill('Mi panel');
  await input.press('Enter');
  await expect(page.getByTestId('dash-preset-personalizado')).toContainText('Mi panel');
});

test('el dashboard no embebe la tabla de ventas (I-17, D-06)', async ({ page }) => {
  // El dashboard ya no contiene el historial de ventas (E-10: scroll eterno); Ventas es
  // page propia accesible desde el sidebar.
  await expect(page.getByTestId('dashboard')).toBeVisible();
  await expect(page.getByTestId('sales-table')).toHaveCount(0);
});

test('lienzo libre: añadir un widget desde la paleta y quitarlo', async ({ page }) => {
  await expect(page.getByTestId('dash-free')).toBeVisible();
  // Parte de un estado conocido: sin widgets de ejecuciones previas.
  await clearFreeWidgets(page);

  const widgets = page.locator('.dash-free-item--widget');
  await clickTool(page, 'dash-free-add-widget');
  const palette = page.locator('.dash-free-palette');
  await expect(palette).toBeVisible();
  await palette.locator('button[role="menuitem"]').first().click();
  await expect(widgets).toHaveCount(1);

  // Limpieza: quita el widget añadido.
  await widgets.first().locator('.dash-free-remove').dispatchEvent('click');
  await expect(widgets).toHaveCount(0);
});

test('lienzo libre: añadir nota y widget, quitar, deshacer y ordenar; minimapa visible', async ({
  page,
}) => {
  await expect(page.getByTestId('dash-free')).toBeVisible();
  await expect(page.getByTestId('dash-free-toolbar')).toBeVisible();
  // El minimapa se pinta en la esquina del lienzo.
  await expect(page.getByTestId('dash-free-minimap')).toBeVisible();

  // El layout libre persiste en /me/preferences: limpia notas de ejecuciones previas.
  const notes = page.locator('.dash-free-item--note');
  for (let n = await notes.count(); n > 0; n = await notes.count()) {
    await notes.first().locator('.dash-free-remove').dispatchEvent('click');
    await expect(notes).toHaveCount(n - 1);
  }

  const items = page.locator('.dash-free-item');
  const baseCount = await items.count();

  // Añadir una NOTA: aparece una tarjeta de nota con su editor (carga diferida de TipTap).
  await clickTool(page, 'dash-free-add-note');
  await expect(notes).toHaveCount(1);
  await expect(notes.locator('.dash-free-note-content').first()).toBeVisible();

  // Deshacer ("botón volver") quita la nota recién creada.
  await clickTool(page, 'dash-free-undo');
  await expect(notes).toHaveCount(0);

  // Añadir un WIDGET desde la paleta.
  await clickTool(page, 'dash-free-add-widget');
  const palette = page.locator('.dash-free-palette');
  await expect(palette).toBeVisible();
  await palette.locator('button[role="menuitem"]').first().click();
  await expect(items).toHaveCount(baseCount + 1);

  // Deshacer también revierte el alta del widget.
  await clickTool(page, 'dash-free-undo');
  await expect(items).toHaveCount(baseCount);

  // Ordenar: si hay widgets, mueve uno y verifica que Ordenar lo recoloca.
  if (baseCount > 0) {
    const first = items.first();
    const fb = await first.boundingBox();
    if (fb) {
      await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2);
      await page.mouse.down();
      await page.mouse.move(fb.x + fb.width / 2 + 160, fb.y + fb.height / 2 + 120, { steps: 12 });
      await page.mouse.up();
      const tfMoved = await first.evaluate((el) => (el as HTMLElement).style.transform);
      await clickTool(page, 'dash-free-arrange');
      await expect
        .poll(() => first.evaluate((el) => (el as HTMLElement).style.transform))
        .not.toBe(tfMoved);
    }
  }
});

test('lienzo libre: la flecha de orientación aparece al alejarse y encuadra al pulsarla', async ({
  page,
}) => {
  const canvas = page.getByTestId('dash-free');
  await expect(canvas).toBeVisible();
  // Sin formas/dibujos sueltos lejanos.
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
});

test('lienzo libre: herramientas de dibujo (forma, lápiz a mano y texto libre)', async ({
  page,
}) => {
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

  // "Dibujar" (en el menú «+») abre el pill horizontal de herramientas encima del dock.
  await clickTool(page, 'dash-free-draw');
  await expect(page.getByTestId('dash-free-draw-pill')).toBeVisible();

  // Forma: rectángulo (arrastrar sobre el fondo).
  await page.getByTestId('dash-free-tool-rect').click();
  await page.mouse.move(cx - 220, cy - 80);
  await page.mouse.down();
  await page.mouse.move(cx - 70, cy + 30, { steps: 6 });
  await page.mouse.up();
  await expect(shapes).toHaveCount(shapesBase + 1);

  // Lápiz: trazo a mano alzada.
  await page.getByTestId('dash-free-tool-pen').click();
  await page.mouse.move(cx - 220, cy + 120);
  await page.mouse.down();
  for (let i = 0; i <= 12; i++) {
    await page.mouse.move(cx - 220 + i * 14, cy + 120 + Math.sin(i / 2) * 20, { steps: 1 });
  }
  await page.mouse.up();
  await expect(shapes).toHaveCount(shapesBase + 2);

  // Cierra el pill y crea un TEXTO libre.
  await clickTool(page, 'dash-free-draw');
  await clickTool(page, 'dash-free-add-text');
  const textInput = page.locator('.dash-free-text-input');
  await expect(textInput).toBeVisible();
  await textInput.fill('Hola');
  await page.mouse.click(box.x + 30, box.y + 30);
  await expect(page.locator('.dash-free-item--text')).toContainText('Hola');

  // Limpieza: deshacer hasta volver al estado base.
  for (let i = 0; i < 8 && (await items.count()) > base; i++) {
    if (!(await undoOnce(page))) break;
  }
});
