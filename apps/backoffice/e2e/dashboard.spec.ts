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

// Limpia las notas con la GOMA: las notas ya no llevan «×», se borran con un clic en modo borrar.
// Activa el modo, hace clic en cada nota (sus hijos van inertes, el clic lo recibe la tarjeta) y sale.
async function clearNotes(page: Page): Promise<void> {
  const notes = page.locator('.dash-free-item--note');
  if ((await notes.count()) === 0) return;
  await page.getByTestId('dash-free-mode-erase').click();
  for (let n = await notes.count(); n > 0; n = await notes.count()) {
    await notes.first().click();
    await expect(notes).toHaveCount(n - 1);
  }
  await page.getByTestId('dash-free-mode-erase').click(); // volver a seleccionar
}

// Las acciones de composición del lienzo (widget/nota/texto/dibujar/ordenar) viven dentro del menú
// «Editar»: hay que abrirlo antes de pulsar cada una (al pulsar una, el menú se cierra). Cada acción
// dispara el handle imperativo de FreeBoard. «Deshacer» NO vive aquí: es un botón suelto junto a la
// goma, siempre visible (ver undoOnce).
async function clickTool(page: Page, testId: string): Promise<void> {
  await page.getByTestId('dash-free-tools').click();
  await page.getByTestId(testId).click();
}

// «Deshacer» es un botón suelto junto a la goma (fuera del menú): comprueba disabled y, si puede,
// deshace. Devuelve si actuó.
async function undoOnce(page: Page): Promise<boolean> {
  const undo = page.getByTestId('dash-free-undo');
  if (await undo.isDisabled()) return false;
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

test('la etiqueta flotante muestra la view activa y el dashboard es un lienzo libre', async ({
  page,
}) => {
  await expect(page.getByTestId('dashboard')).toBeVisible();
  // En el Dashboard el título flotante de la view se OCULTA: la barra de herramientas del lienzo
  // (Editar→despliega + Mover + Goma) ocupa su sitio (arriba-centro). En el resto de views el
  // título flotante sigue (page-heading) — esto solo cambia en Dashboard.
  await expect(page.getByTestId('page-heading')).toHaveCount(0);
  await expect(page.getByTestId('dash-free-toolbar')).toBeVisible();
  // El chip de preset antiguo ya no existe (lo sustituye la etiqueta flotante de view).
  await expect(page.getByTestId('dash-preset-personalizado')).toHaveCount(0);
  // El lienzo libre es la única vista (el modo Cuadrícula y su toggle se eliminaron).
  await expect(page.getByTestId('dash-free')).toBeVisible();
  await expect(page.getByTestId('dash-free-toolbar')).toBeVisible();
  await expect(page.getByTestId('dash-mode')).toHaveCount(0);
  await expect(page.getByTestId('dash-board')).toHaveCount(0);
  // No existen: chip de preset antiguo, viejo <Select> de periodo (dash-period), selector de
  // tienda, NI el segmentado de periodo S-11 (period-seg) — el filtro de tiempo se retiró del
  // dashboard por preferencia del usuario.
  await expect(page.getByTestId('dash-preset-ventas')).toHaveCount(0);
  await expect(page.getByTestId('dash-preset-beneficio')).toHaveCount(0);
  await expect(page.getByTestId('dash-period')).toHaveCount(0);
  await expect(page.getByTestId('dash-store')).toHaveCount(0);
  await expect(page.getByTestId('period-seg')).toHaveCount(0);
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

test('lienzo libre: añadir nota y widget, quitar, deshacer/rehacer y ordenar; minimapa visible', async ({
  page,
}) => {
  await expect(page.getByTestId('dash-free')).toBeVisible();
  await expect(page.getByTestId('dash-free-toolbar')).toBeVisible();

  // El preset «personalizado» nace VACÍO (se compone con el agente): sin contenido no hay
  // minimapa. Limpia notas (con la goma: ya no llevan «×») y widgets de ejecuciones previas.
  const notes = page.locator('.dash-free-item--note');
  await clearNotes(page);
  await clearFreeWidgets(page);

  const items = page.locator('.dash-free-item');
  const baseCount = await items.count();

  // Añadir una NOTA: aparece una tarjeta de nota con su editor (carga diferida de TipTap).
  await clickTool(page, 'dash-free-add-note');
  await expect(notes).toHaveCount(1);
  await expect(notes.locator('.dash-free-note-content').first()).toBeVisible();
  // Con contenido en el lienzo, el minimapa se pinta en la esquina.
  await expect(page.getByTestId('dash-free-minimap')).toBeVisible();

  // Sin pasos para rehacer todavía: «Rehacer» está deshabilitado.
  const redo = page.getByTestId('dash-free-redo');
  await expect(redo).toBeDisabled();

  // Deshacer (botón suelto junto a la goma) quita la nota recién creada.
  await page.getByTestId('dash-free-undo').click();
  await expect(notes).toHaveCount(0);

  // Rehacer la repone y agota su pila (vuelve a deshabilitarse).
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect(notes).toHaveCount(1);
  await expect(redo).toBeDisabled();

  // Deja el lienzo sin nota para la parte de widget/ordenar (estado base).
  await page.getByTestId('dash-free-undo').click();
  await expect(notes).toHaveCount(0);

  // Añadir un WIDGET desde la paleta.
  await clickTool(page, 'dash-free-add-widget');
  const palette = page.locator('.dash-free-palette');
  await expect(palette).toBeVisible();
  await palette.locator('button[role="menuitem"]').first().click();
  await expect(items).toHaveCount(baseCount + 1);

  // Ordenar recoloca un widget movido. Se arrastra desde la zona superior de la tarjeta
  // (no el centro, donde una pieza pesada captura el puntero) para mover de forma fiable.
  const first = items.first();
  const fb = await first.boundingBox();
  if (fb) {
    await page.mouse.move(fb.x + fb.width / 2, fb.y + 12);
    await page.mouse.down();
    await page.mouse.move(fb.x + fb.width / 2 + 160, fb.y + 132, { steps: 12 });
    await page.mouse.up();
    const tfMoved = await first.evaluate((el) => (el as HTMLElement).style.transform);
    await clickTool(page, 'dash-free-arrange');
    await expect
      .poll(() => first.evaluate((el) => (el as HTMLElement).style.transform))
      .not.toBe(tfMoved);
  }

  // Limpieza: quita el widget añadido para no contaminar el lienzo entre runs.
  await clearFreeWidgets(page);
  await expect(items).toHaveCount(baseCount);
});

test('lienzo libre: la nota hace scroll vertical aunque sea pequeña', async ({ page }) => {
  await expect(page.getByTestId('dash-free')).toBeVisible();
  await clearNotes(page);
  await clearFreeWidgets(page);

  // Añadir una nota (nace pequeña, tamaño por defecto).
  await clickTool(page, 'dash-free-add-note');
  const note = page.locator('.dash-free-item--note').first();
  await expect(note).toBeVisible();
  const editable = note.locator('.dash-free-note-content');
  await expect(editable).toBeVisible();

  // Escribir bastante texto: en una nota estrecha se envuelve en muchas líneas y desborda el alto.
  await editable.click();
  await page.keyboard.type(
    'Línea de prueba para forzar el desbordamiento vertical de la nota. '.repeat(10),
  );

  // El contenedor de scroll (.dash-free-note-scroll) tiene alto ACOTADO y su contenido desborda
  // → es scrollable, sin importar el tamaño pequeño de la nota.
  const scroll = note.locator('.dash-free-note-scroll');
  const m = await scroll.evaluate((el) => ({
    scrollH: el.scrollHeight,
    clientH: el.clientHeight,
    overflowY: getComputedStyle(el).overflowY,
  }));
  expect(m.overflowY).toBe('auto');
  expect(m.scrollH).toBeGreaterThan(m.clientH); // hay contenido oculto → se puede hacer scroll

  // Y la RUEDA del ratón sobre la nota la desplaza (el lienzo ya no le roba el evento de rueda).
  const box = await scroll.boundingBox();
  if (!box) throw new Error('sin caja del área de scroll de la nota');
  await scroll.evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 220);
  await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

  await clearNotes(page);
});

test('lienzo libre: la vista solo se mueve con la mano o la barra espaciadora, no al arrastrar el fondo ni con la rueda', async ({
  page,
}) => {
  const canvas = page.getByTestId('dash-free');
  await expect(canvas).toBeVisible();

  // Estado conocido: lienzo vacío. El estado vacío («+») es pointer-events:none salvo su botón
  // central, así que casi todo el lienzo es fondo puro; sin elementos tampoco hay minimapa ni
  // flecha en las esquinas. Agarramos en el borde izquierdo-medio: lejos del «+» central, del dock
  // inferior, de los controles de zoom (abajo-dcha) y de los controles flotantes superiores.
  await clearDrawElements(page);
  await clearNotes(page);
  await clearFreeWidgets(page);

  const world = page.locator('.dash-free-world');
  const transformOf = (): Promise<string> =>
    world.evaluate((el) => (el as HTMLElement).style.transform);
  const box = await canvas.boundingBox();
  if (!box) throw new Error('sin viewport del lienzo');
  const gx = box.x + box.width * 0.2;
  const gy = box.y + box.height * 0.5;

  const initial = await transformOf();

  // 1) Arrastrar el FONDO en modo normal NO mueve la vista (el pan ya no vive en el fondo).
  await page.mouse.move(gx, gy);
  await page.mouse.down();
  await page.mouse.move(gx + 170, gy + 90, { steps: 10 });
  await page.mouse.up();
  expect(await transformOf()).toBe(initial);

  // 2) La rueda / dos dedos del trackpad SIN ⌘/Ctrl tampoco mueve la vista.
  await page.mouse.move(gx, gy);
  await page.mouse.wheel(0, 240);
  await page.mouse.wheel(160, 0);
  expect(await transformOf()).toBe(initial);

  // 3) Con el botón de la MANO activo, arrastrar SÍ mueve la vista.
  await page.getByTestId('dash-free-mode-pan').click();
  await page.mouse.move(gx, gy);
  await page.mouse.down();
  await page.mouse.move(gx + 170, gy + 90, { steps: 10 });
  await page.mouse.up();
  const afterHand = await transformOf();
  expect(afterHand).not.toBe(initial);
  await page.getByTestId('dash-free-mode-pan').click(); // volver a modo normal

  // 4) La barra espaciadora (mano temporal) también mueve la vista.
  await page.mouse.move(gx, gy); // hover → el lienzo empieza a escuchar el espacio
  await page.keyboard.down('Space');
  await page.mouse.down();
  await page.mouse.move(gx + 120, gy + 70, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  expect(await transformOf()).not.toBe(afterHand);
});

test('lienzo libre: la flecha de orientación aparece al alejarse y encuadra al pulsarla', async ({
  page,
}) => {
  const canvas = page.getByTestId('dash-free');
  await expect(canvas).toBeVisible();
  // Sin formas/dibujos sueltos lejanos.
  await clearDrawElements(page);

  // El preset «personalizado» nace vacío: añade un widget para tener contenido al que
  // orientarse (la flecha solo aparece cuando hay algo fuera de la vista).
  await clearFreeWidgets(page);
  await clickTool(page, 'dash-free-add-widget');
  const palette = page.locator('.dash-free-palette');
  await expect(palette).toBeVisible();
  await palette.locator('button[role="menuitem"]').first().click();
  await expect(page.locator('.dash-free-item--widget')).toHaveCount(1);

  // Alejar la vista con el teclado hasta perder de vista el contenido.
  await canvas.focus();
  for (let i = 0; i < 80; i++) await page.keyboard.press('ArrowRight');

  // La flecha de orientación aparece pegada al margen.
  const arrow = page.getByTestId('dash-free-arrow');
  await expect(arrow).toBeVisible();
  // Pulsarla vuelve a encuadrar el contenido → la flecha desaparece.
  await arrow.click();
  await expect(arrow).toHaveCount(0);

  // Limpieza: quita el widget añadido.
  await clearFreeWidgets(page);
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
