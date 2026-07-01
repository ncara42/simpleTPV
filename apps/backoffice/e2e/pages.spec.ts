import { expect, test } from '@playwright/test';

import { gotoApp, navTo, selectByLabel } from './helpers.js';

// E2E del backoffice contra backend real (seed-demo). Patrón: descubrir datos por
// etiqueta (los IDs son UUIDs, no se hardcodean) y aserciones alineadas al seed.
// La suite asume una BD recién sembrada (CI siembra una vez; en local: reset+seed).
// Parte autenticada vía storageState (auth.setup.ts) para no repetir login.
test.beforeEach(async ({ page }) => {
  await gotoApp(page);
});

test('Catálogo muestra los productos del seed', async ({ page }) => {
  await navTo(page, 'catalog');
  await expect(page.getByTestId('catalog-table')).toBeVisible();
  // El contador vivía en la descripción del header, retirada en el repaso:
  // verificamos directamente que hay filas de producto. count() no auto-espera:
  // anclar antes la primera fila (mismo patrón que Familias #97).
  await expect(page.getByTestId('product-select').first()).toBeVisible();
  expect(await page.getByTestId('product-select').count()).toBeGreaterThan(0);
});

test('Catálogo: selector jerárquico único de familia (#97)', async ({ page }) => {
  await navTo(page, 'catalog');
  // El modal tiene un único selector jerárquico: se elige un nodo de cualquier
  // nivel (p. ej. la subfamilia "Aceites CBD") sin cascada familia → subfamilia.
  await page.getByTestId('new-product').click();
  await selectByLabel(page, 'form-family', 'Aceites CBD');
  await expect(page.getByTestId('form-subfamily')).toHaveCount(0);
});

test('Catálogo: el modal de producto no desborda en viewports bajos (I-11, E-04)', async ({
  page,
}) => {
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1024, height: 640 },
  ]) {
    await page.setViewportSize(viewport);
    await navTo(page, 'catalog');
    await page.getByTestId('new-product').click();
    await expect(page.getByTestId('product-form')).toBeVisible();
    // Ningún campo puede quedar fuera del rectángulo del modal (el cuerpo scrollea).
    const fueraDelModal = await page.locator('[data-testid="product-form"]').evaluate((el) => {
      const r = el.getBoundingClientRect();
      const fields = Array.from(el.querySelectorAll('input, select, button, output'));
      return fields.filter((f) => {
        const fr = f.getBoundingClientRect();
        return fr.right > r.right + 1 || fr.bottom > r.bottom + 1 || fr.left < r.left - 1;
      }).length;
    });
    expect(fueraDelModal).toBe(0);
    // Las tres secciones del rediseño están presentes.
    await expect(page.getByText('Datos básicos')).toBeVisible();
    await expect(page.getByText('Precios e IVA')).toBeVisible();
    await expect(page.getByText('Clasificación')).toBeVisible();
    await page.keyboard.press('Escape');
  }
});

test('Catálogo: selección múltiple y edición en lote', async ({ page }) => {
  await navTo(page, 'catalog');
  const checks = page.getByTestId('product-select');
  await checks.nth(0).check();
  await checks.nth(1).check();
  await expect(page.getByTestId('selection-count')).toHaveText('2 seleccionados');
  await page.getByTestId('products-edit').click();
  // El asistente recorre los seleccionados de uno en uno.
  await expect(page.getByTestId('form-save')).toHaveText('Siguiente (1 / 2)');
  await page.getByTestId('form-save').click();
  await expect(page.getByTestId('form-save')).toHaveText('Guardar (2 / 2)');
  await page.getByTestId('form-save').click();
  await expect(page.getByTestId('product-form')).toHaveCount(0);
});

test('Tiendas muestra la lista de ubicaciones en 3 paneles', async ({ page }) => {
  await navTo(page, 'stores');
  await expect(page.getByTestId('store-list')).toBeVisible();
  await expect(page.getByTestId('store-lrow')).toHaveCount(6);
  // Sin clic previo: la de mayor ventas queda seleccionada por defecto (paneles
  // 2/3 siempre visibles, ya no hay modal que abrir).
  await expect(page.getByTestId('store-detail-panel')).toBeVisible();
  await expect(page.getByTestId('store-ops-panel')).toBeVisible();
});

test('Tiendas: orden por ventas y acceso directo a stock (UX)', async ({ page }) => {
  await navTo(page, 'stores');
  await expect(page.getByTestId('store-sales').first()).toBeVisible();
  // Los accesos rápidos (Stock/Ventas/Precios) viven en la ficha (panel 2),
  // siempre visible — ya no hace falta abrir nada para llegar a ellos.
  await expect(page.getByTestId('store-open-stock')).toBeVisible();
  await page.getByTestId('store-open-stock').click();
  await expect(page.getByTestId('stock-page')).toBeVisible();
  // Acceso directo "Ventas" → page de Ventas PREFILTRADA por la tienda (I-17).
  await navTo(page, 'stores');
  const row = page.getByTestId('store-lrow').first();
  const storeName = (await row.locator('.store-lrow-name-txt').textContent()) ?? '';
  await row.click();
  await page.getByTestId('store-open-sales').click();
  await expect(page.getByTestId('sales-page')).toBeVisible();
  // Prefiltrada por la tienda (deep-link `?store=`): el ledger se acota a esa tienda,
  // así que el carril de facetas la muestra en la sección Tienda.
  await expect(page.getByTestId('sales-facets')).toContainText(storeName);
});

test('Tiendas: detalle, estado operativo y registro de fichajes (#100, #102)', async ({ page }) => {
  await navTo(page, 'stores');
  // Detalle de "Sur" → seleccionar en la lista actualiza los paneles al instante
  // (sin modal): ficha (identidad + ventas) y operativa quedan en línea.
  await page.getByTestId('store-lrow').filter({ hasText: 'Sur' }).click();
  await expect(page.getByTestId('store-detail-panel')).toBeVisible();
  await expect(page.getByTestId('store-detail-open')).toBeVisible();
  await page.getByTestId('store-log-open').click();
  await expect(page.getByTestId('store-log-drawer')).toBeVisible();
  await expect(page.getByTestId('store-log-table')).toBeVisible();
  await page.getByTestId('store-log-close').click();
  await expect(page.getByTestId('store-log-drawer')).toBeHidden();
  // Token de fichaje REAL (I-08): generar crea un dispositivo y muestra el token
  // una sola vez; el dispositivo aparece en la lista como pendiente y se revoca.
  await page.getByTestId('store-gen-token').click();
  await expect(page.getByTestId('store-token-value')).toContainText('una sola vez');
  await expect(page.getByTestId('store-device-item').first()).toContainText('Pendiente');
  await page.getByTestId('store-device-revoke').first().click();
  await page.getByRole('button', { name: 'Revocar' }).last().click();
  await expect(page.getByTestId('store-device-item')).toHaveCount(0);
});

test('Tiendas: el estado operativo PERSISTE tras recargar (I-09, E-02)', async ({ page }) => {
  await navTo(page, 'stores');
  await page.getByTestId('store-lrow').filter({ hasText: 'Sur' }).click();
  await expect(page.getByTestId('store-ops')).toBeVisible();
  // Estado inicial → marcar verificada + incidencia y guardar.
  const wasVerified = await page.getByTestId('store-ops-verified').isChecked();
  await page.getByTestId('store-ops-verified').setChecked(!wasVerified, { force: true });
  await page.getByTestId('store-ops-incident').fill('e2e: incidencia de prueba');
  await page.getByTestId('store-ops-save').click();
  await expect(page.getByTestId('store-ops-save')).toContainText('Guardado', { timeout: 10000 });
  // Recargar: el estado viene del backend, no de un useState (anti-test E-02).
  // Con react-router (F0) el reload CONSERVA la ruta (ya no resetea a dashboard);
  // anclamos a float-actions (presente en todas las views) en vez de a 'dashboard'.
  await page.reload();
  await expect(page.getByTestId('topbar')).toBeVisible({ timeout: 15000 });
  await navTo(page, 'stores');
  await page.getByTestId('store-lrow').filter({ hasText: 'Sur' }).click();
  await expect(page.getByTestId('store-ops-verified')).toBeChecked({ checked: !wasVerified });
  await expect(page.getByTestId('store-ops-incident')).toHaveValue('e2e: incidencia de prueba');
  // Restaurar para no contaminar el seed entre runs.
  await page.getByTestId('store-ops-verified').setChecked(wasVerified, { force: true });
  await page.getByTestId('store-ops-incident').fill('');
  await page.getByTestId('store-ops-save').click();
  await expect(page.getByTestId('store-ops-save')).toContainText('Guardado', { timeout: 10000 });
});

test('Tiendas: crear, editar y borrar persisten (I-10)', async ({ page }) => {
  await navTo(page, 'stores');
  // Crear una tienda temporal (código único por run).
  const code = `9${Date.now() % 100000}`.slice(0, 6);
  await page.getByTestId('new-store').click();
  await page.getByTestId('store-name').fill(`Tienda E2E ${code}`);
  await page.getByTestId('store-code').fill(code);
  await page.getByTestId('store-save').click();
  await expect(page.getByTestId('store-form')).toHaveCount(0);
  const row = page.getByTestId('store-lrow').filter({ hasText: `Tienda E2E ${code}` });
  await expect(row).toBeVisible();
  // Editar desde la ficha (panel 2, siempre visible): renombrar.
  await row.click();
  await page.getByTestId('store-edit').click();
  await page.getByTestId('store-name').fill(`Tienda E2E ${code} Editada`);
  await page.getByTestId('store-save').click();
  await expect(page.getByTestId('store-form')).toHaveCount(0);
  // Persiste tras recargar. Con react-router el reload conserva la ruta → ancla float-actions.
  await page.reload();
  await expect(page.getByTestId('topbar')).toBeVisible({ timeout: 15000 });
  await navTo(page, 'stores');
  const renamed = page.getByTestId('store-lrow').filter({ hasText: `Tienda E2E ${code} Editada` });
  await expect(renamed).toBeVisible();
  // Borrar (tienda vacía) con confirmación; desaparece de la lista.
  await renamed.click();
  await page.getByTestId('store-delete').click();
  await page.getByRole('button', { name: 'Borrar' }).last().click();
  await expect(
    page.getByTestId('store-lrow').filter({ hasText: `Tienda E2E ${code}` }),
  ).toHaveCount(0);
});

test('Usuarios muestra 4 usuarios con badge de rol', async ({ page }) => {
  await navTo(page, 'users');
  // El contador vivía en la descripción del header (retirada): contamos filas
  // por su badge de rol (uno por usuario).
  await expect(page.getByTestId('user-role-badge').first()).toBeVisible();
  expect(await page.getByTestId('user-role-badge').count()).toBe(4);
});

test('Usuarios: editar precarga datos y permite renombrar (#104)', async ({ page }) => {
  await navTo(page, 'users');
  await page.getByTestId('user-select').first().check();
  await expect(page.getByTestId('users-edit')).toBeVisible();
  await page.getByTestId('users-edit').click();
  // El nombre se precarga (no vacío); editarlo se refleja en la tabla.
  await expect(page.getByTestId('user-name')).not.toHaveValue('');
  await expect(page.getByTestId('user-role')).toBeVisible();
  const original = await page.getByTestId('user-name').inputValue();
  const renamed = `Usuario Editado ${Date.now()}`;
  await page.getByTestId('user-name').fill(renamed);
  await page.getByTestId('user-save').click();
  await expect(page.getByTestId('users-table')).toContainText(renamed);
  // La edición PERSISTE de verdad: restaurar el nombre original para no
  // contaminar el seed entre runs (el filtro de Ventas depende de 'Dependiente').
  const row = page.getByTestId('user-row').filter({ hasText: renamed });
  await row.getByTestId('user-select').check();
  await page.getByTestId('users-edit').click();
  await page.getByTestId('user-name').fill(original);
  await page.getByTestId('user-save').click();
  await expect(page.getByTestId('users-table')).toContainText(original);
});

test('Usuarios: edición en lote avanza con "Siguiente (n / total)"', async ({ page }) => {
  await navTo(page, 'users');
  const checks = page.getByTestId('user-select');
  await checks.nth(0).check();
  await checks.nth(1).check();
  await expect(page.getByTestId('users-edit')).toHaveText('Editar (2)');
  await page.getByTestId('users-edit').click();
  await expect(page.getByTestId('user-save')).toHaveText('Siguiente (1 / 2)');
  await page.getByTestId('user-save').click();
  await expect(page.getByTestId('user-save')).toHaveText('Guardar (2 / 2)');
  await page.getByTestId('user-save').click();
  await expect(page.getByTestId('user-form')).toHaveCount(0);
});

test('Usuarios: el foco no salta al teclear en el alta (regresión bug de foco)', async ({
  page,
}) => {
  await navTo(page, 'users');
  await page.getByTestId('new-user').click();
  await expect(page.getByTestId('user-form')).toBeVisible();
  // Teclea carácter a carácter (cada tecla re-renderiza): el foco debe quedarse en el
  // campo y conservar el valor completo (antes saltaba al primer campo en cada tecla).
  const pw = page.getByTestId('user-password');
  await pw.click();
  await pw.pressSequentially('secret123', { delay: 20 });
  await expect(pw).toBeFocused();
  await expect(pw).toHaveValue('secret123');
});

test('Stock global muestra la tabla con filas por producto', async ({ page }) => {
  await navTo(page, 'stock');
  await expect(page.getByTestId('stock-table')).toBeVisible();
  // El DataTable pinta skeleton mientras carga: esperar a la primera fila real.
  await expect(page.getByTestId('stock-row').first()).toBeVisible();
  expect(await page.getByTestId('stock-row').count()).toBeGreaterThan(0);
});

test('Stock: filtro por rotación re-renderiza la tabla (#96)', async ({ page }) => {
  await navTo(page, 'stock');
  await expect(page.getByTestId('stock-table')).toBeVisible();
  const total = await page.getByTestId('stock-row').count();
  // Filtrar por rotación baja (faceta de casilla): puede dejar 0 filas, nunca más que el total.
  await page.getByTestId('stock-rotation-baja').click();
  expect(await page.getByTestId('stock-row').count()).toBeLessThanOrEqual(total);
});

test('Movimientos de stock viven en el detalle del producto (I-12, D-05)', async ({ page }) => {
  // La tabla de Stock ya no tiene el botón repetido por fila.
  await navTo(page, 'stock');
  await expect(page.getByTestId('stock-row').first()).toBeVisible();
  await expect(page.getByTestId('stock-history')).toHaveCount(0);
  // El histórico se consulta desde la edición del producto (carga lazy).
  await navTo(page, 'catalog');
  await page.getByTestId('product-select').first().check();
  await page.getByTestId('products-edit').click();
  await expect(page.getByTestId('product-form')).toBeVisible();
  await page.getByTestId('product-movements-open').click();
  await expect(
    page.getByTestId('movements-table').or(page.getByTestId('movements-empty')),
  ).toBeVisible();
  await page.keyboard.press('Escape');
});

test('Stock: ajustar existencias PERSISTE tras recargar (E-01)', async ({ page }) => {
  await navTo(page, 'stock');
  await expect(page.getByTestId('stock-row').first()).toBeVisible();
  // Acotar el ámbito a una tienda concreta: así «Disponible» = stock de esa tienda
  // y el ajuste actúa sobre ella (no sobre la suma global).
  await page.getByTestId('existences-store').first().click();
  const firstRow = page.getByTestId('stock-row').first();
  const productName = (await firstRow.locator('td').first().innerText()).trim();
  // Abrir el ajuste desde el badge de disponible de la fila.
  await firstRow.getByTestId('stock-disp').click();
  await expect(page.getByTestId('stock-adjust-form')).toBeVisible();
  const original = await page.getByTestId('stock-adjust-qty').inputValue();
  const target = String(Number(original) + 7);
  await page.getByTestId('stock-adjust-qty').fill(target);
  await page.getByTestId('stock-adjust-reason').fill('e2e: anti-regresión E-01');
  await page.getByTestId('stock-adjust-save').click();
  await expect(page.getByTestId('stock-adjust-form')).toHaveCount(0);
  // Recargar: la cantidad debe venir del backend, no de un overlay local.
  // Con react-router el reload conserva la ruta → ancla float-actions.
  await page.reload();
  await expect(page.getByTestId('topbar')).toBeVisible({ timeout: 15000 });
  await navTo(page, 'stock');
  await page.getByTestId('existences-store').first().click();
  const row = page.getByTestId('stock-row').filter({ hasText: productName }).first();
  await expect(row).toBeVisible();
  await expect(row.getByTestId('stock-disp')).toContainText(target);
  // Restaurar el valor original para no contaminar el seed entre runs.
  await row.getByTestId('stock-disp').click();
  await page.getByTestId('stock-adjust-qty').fill(original);
  await page.getByTestId('stock-adjust-reason').fill('e2e: restaurar');
  await page.getByTestId('stock-adjust-save').click();
  await expect(page.getByTestId('stock-adjust-form')).toHaveCount(0);
});

test('Ventas: ledger facetado con lista, ficha y split de cobro', async ({ page }) => {
  await navTo(page, 'sales');
  // El ledger de 3 columnas: carril de facetas · lista · ficha.
  await expect(page.getByTestId('sales-page')).toBeVisible();
  await expect(page.getByTestId('sales-facets')).toBeVisible();
  await expect(page.getByTestId('sales-list')).toBeVisible();
  // Chips de cobro (Cobrado/Pendiente/Vencido).
  await expect(page.getByTestId('sales-summary')).toBeVisible();
  // El periodo arranca en «Hoy» (la línea base de la vista). Para ejercitar el ledger
  // histórico de forma determinista, ampliamos a «Año» antes de aseverar filas.
  await page.getByTestId('sales-period').getByTestId('period-opt-year').click();
  const rows = page.getByTestId('sales-row');
  // Aserción con reintento: el listado se carga de forma asíncrona (useQuery).
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThan(0);
  // Abrir un ticket muestra su ficha (desglose + seguimiento del cobro + acciones).
  await rows.first().click();
  await expect(page.getByTestId('sales-detail')).toBeVisible();
  await expect(page.getByTestId('sales-detail-name')).toBeVisible();
  await expect(page.getByTestId('sales-view-invoice')).toBeVisible();
  // Vista guardada «Vencidas»: el botón queda activo (aria-pressed).
  await page.getByTestId('sales-view-overdue').click();
  await expect(page.getByTestId('sales-view-overdue')).toHaveAttribute('aria-pressed', 'true');
  // «Limpiar filtros» (carril) resetea vista, facetas y periodo a la línea base («Hoy»).
  await page.getByTestId('sales-clear').click();
  await expect(page.getByTestId('sales-view-all')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('sales-period').getByTestId('period-opt-today')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('Ventas: «Registrar cobro» marca una factura a crédito como pagada', async ({ page }) => {
  await navTo(page, 'sales');
  await expect(page.getByTestId('sales-page')).toBeVisible();
  // El periodo arranca en «Hoy»; ampliamos a «Año» para abarcar las facturas B2B a
  // crédito que el seed reparte a lo largo del histórico.
  await page.getByTestId('sales-period').getByTestId('period-opt-year').click();
  // Vista «Pendientes de cobro»: el seed crea facturas B2B a crédito.
  await page.getByTestId('sales-view-pending').click();
  const pendingRows = page.getByTestId('sales-row');
  // Espera (con reintento) a que carguen las pendientes antes de contarlas.
  await expect(pendingRows.first()).toBeVisible();
  const before = await pendingRows.count();
  expect(before).toBeGreaterThan(0);
  // Abrir la primera pendiente y registrar su cobro.
  await pendingRows.first().click();
  await expect(page.getByTestId('sales-collect')).toBeVisible();
  await page.getByTestId('sales-collect').click();
  // Cobrada → sale de «Pendientes de cobro»: una fila menos en la vista.
  await expect(pendingRows).toHaveCount(before - 1);
});

test('S-11: el periodo de Ventas filtra el ledger y persiste en la URL', async ({ page }) => {
  await navTo(page, 'sales');
  await expect(page.getByTestId('sales-page')).toBeVisible();

  // El control de periodo (segmentado) vive en el clúster derecho del topbar.
  const periodFilter = page.getByTestId('sales-period');
  await expect(periodFilter).toBeVisible();

  // Elegir "Hoy" acota el ledger al día y escribe ?period=today en la URL.
  await periodFilter.getByTestId('period-opt-today').click();
  await expect(periodFilter.getByTestId('period-opt-today')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect.poll(() => new URL(page.url()).searchParams.get('period')).toBe('today');

  // Recargar conserva el periodo desde la URL.
  await page.reload();
  await expect(page.getByTestId('sales-page')).toBeVisible();
  await expect(page.getByTestId('sales-period').getByTestId('period-opt-today')).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // "Limpiar filtros" resetea el periodo (y quita ?period= de la URL).
  await page.getByTestId('sales-clear').click();
  await expect.poll(() => new URL(page.url()).searchParams.get('period')).toBeNull();
});

test('Compras y VeriFactu están retiradas del menú (#106)', async ({ page }) => {
  await expect(page.getByTestId('nav-purchases')).toHaveCount(0);
  await expect(page.getByTestId('nav-verifactu')).toHaveCount(0);
});

test('Familias muestra las raíz con subfamilias anidadas (#97)', async ({ page }) => {
  await navTo(page, 'families');
  // Árbol canónico del seed: 4 raíces + 2 subfamilias + 6 arquetipos = 12 nodos.
  // >= por si otros tests crean subfamilias. count() no auto-espera: anclar antes
  // la primera fila para no contar durante la carga.
  await expect(page.getByTestId('fam-row').first()).toBeVisible();
  expect(await page.getByTestId('fam-row').count()).toBeGreaterThanOrEqual(12);
  await expect(page.getByText('Aceites CBD')).toBeVisible();
  await expect(page.getByTestId('fam-count').first()).toContainText('productos');
});

test('Familias: crear una subfamilia anidada (profundidad arbitraria, UX)', async ({ page }) => {
  await navTo(page, 'families');
  const aceitesCbd = page.getByTestId('fam-row').filter({ hasText: 'Aceites CBD' }).first();
  await aceitesCbd.click();
  await aceitesCbd.getByTestId('fam-add-child').click();
  const subName = `Subfamilia E2E ${Date.now()}`;
  await page.getByTestId('family-name').fill(subName);
  await page.getByTestId('family-save').click();
  await expect(page.getByTestId('fam-tree')).toContainText(subName);
});

test('Familias: árbol con raíz en orden y todas las filas (#98)', async ({ page }) => {
  await navTo(page, 'families');
  const rows = page.getByTestId('fam-row');
  // Orden por defecto: la primera raíz es "Aceites" (sortOrder 1).
  await expect(rows.first()).toContainText('Aceites');
  // El árbol expone todas las filas (4 raíces + 2 subfamilias + 6 arquetipos). El
  // reordenado por drag&drop nativo HTML5 no es fiable en Playwright; unit lo cubre.
  expect(await rows.count()).toBeGreaterThanOrEqual(12);
});

test('Familias: marcar una subfamilia como arquetipo la distingue y oculta "Añadir subfamilia"', async ({
  page,
}) => {
  await navTo(page, 'families');
  // Crear una subfamilia bajo "Flores CBD" (no una raíz, para no alterar el orden de
  // raíces en reruns) y marcarlo como arquetipo.
  const flores = page.getByTestId('fam-row').filter({ hasText: 'Flores CBD' }).first();
  await flores.click();
  await flores.getByTestId('fam-add-child').click();
  const name = `Arq E2E ${Date.now()}`;
  await page.getByTestId('family-name').fill(name);
  await page.getByTestId('family-archetype').check();
  await page.getByTestId('family-save').click();
  await expect(page.getByTestId('family-form')).toHaveCount(0);
  // El nodo aparece con el distintivo "Arquetipo".
  const row = page.getByTestId('fam-row').filter({ hasText: name });
  await expect(row.getByTestId('fam-archetype-badge')).toBeVisible();
  // Al seleccionarlo NO ofrece crear subfamilias (un arquetipo solo contiene productos).
  await row.click();
  await expect(row.getByTestId('fam-add-child')).toHaveCount(0);
});

test('Familias: panel de productos del nodo — ver, añadir aquí y mover (I-13, E-16)', async ({
  page,
}) => {
  await navTo(page, 'families');
  // Seleccionar el arquetipo "Aceite CBD 10%" abre el panel con sus productos.
  const arq = page.getByTestId('fam-row').filter({ hasText: 'Aceite CBD 10%' }).first();
  await arq.click();
  await expect(page.getByTestId('fam-products-panel')).toBeVisible();
  await expect(page.getByTestId('fam-product-item').first()).toBeVisible();
  const items = await page.getByTestId('fam-product-item').count();
  expect(items).toBeGreaterThanOrEqual(3); // el seed da 3 al arquetipo
  // El contador de la fila dice la VERDAD (E-16): coincide con el panel.
  await expect(arq.getByTestId('fam-count')).toHaveText(`${items} productos`);
  // En un arquetipo no hay toggle de subfamilias (no tiene descendientes)…
  await expect(page.getByTestId('fam-panel-subtree')).toHaveCount(0);

  // …y en una familia raíz sí: incluir subfamilias amplía la lista. Se clica el
  // NOMBRE (no el centro de la fila, que ahora puede caer sobre las acciones
  // siempre visibles de U-13) para seleccionar "Aceites" de forma estable.
  await page.getByTestId('fam-row').first().locator('.fam-name').click();
  await expect(page.getByTestId('fam-products-panel')).toBeVisible();
  await expect(page.getByTestId('fam-panel-subtree')).toBeVisible();
  const direct = await page.getByTestId('fam-product-item').count();
  await page.getByTestId('fam-panel-subtree').check();
  await expect.poll(() => page.getByTestId('fam-product-item').count()).toBeGreaterThan(direct);

  // "Añadir producto aquí": modal con el nodo precargado; aparece en el panel.
  await arq.click();
  await page.getByTestId('fam-panel-add-product').click();
  await expect(page.getByTestId('product-form')).toContainText('Aceite CBD 10%');
  const name = `Producto E2E ${Date.now()}`;
  await page.getByTestId('form-name').fill(name);
  await page.getByTestId('form-price').fill('12.5');
  await page.getByTestId('form-save').click();
  await expect(page.getByTestId('product-form')).toHaveCount(0);
  await expect(page.getByTestId('fam-product-list')).toContainText(name);

  // Mover el producto a otro arquetipo desde el panel: sale de esta lista…
  const item = page.getByTestId('fam-product-item').filter({ hasText: name });
  await item.getByTestId('fam-product-move').click();
  await page.locator('[role="option"]', { hasText: 'Aceite CBD 20%' }).first().click();
  await expect(page.getByTestId('fam-product-list')).not.toContainText(name);
  // …y aparece en la del destino.
  await page.getByTestId('fam-row').filter({ hasText: 'Aceite CBD 20%' }).first().click();
  await expect(page.getByTestId('fam-product-list')).toContainText(name);

  // "Ver en Catálogo →" navega al catálogo filtrado por el nodo.
  await page.getByTestId('fam-panel-to-catalog').click();
  await expect(page.getByTestId('catalog-table')).toBeVisible();
  await expect(page.getByTestId('catalog-table')).toContainText(name);

  // Limpieza: borrar el producto creado para no contaminar el seed. S-02 fases B-E:
  // el Catálogo ya no tiene caja propia (`catalog-search`); la búsqueda es el filtro
  // COMPARTIDO del shell de Inventario (`inventory-search`).
  await page.getByTestId('inventory-search').fill(name);
  await expect(page.getByTestId('product-select')).toHaveCount(1);
  await page.getByTestId('product-select').check();
  await page.getByTestId('products-delete').click();
  await expect(page.getByTestId('catalog-table')).not.toContainText(name);
});

test('Familias: añadir productos existentes a un nodo desde el picker (S-18)', async ({ page }) => {
  await navTo(page, 'families');
  // Origen: arquetipo "Aceite CBD 20%". Tomamos un producto suyo para reasignarlo
  // a otro nodo desde el picker de "Añadir productos existentes".
  const origen = page.getByTestId('fam-row').filter({ hasText: 'Aceite CBD 20%' }).first();
  await origen.click();
  await expect(page.getByTestId('fam-products-panel')).toBeVisible();
  await expect(page.getByTestId('fam-product-item').first()).toBeVisible();
  const movableName = await page
    .getByTestId('fam-product-item')
    .first()
    .locator('.fam-product-name')
    .innerText();

  // Destino: arquetipo "Aceite CBD 10%". Abrimos el picker desde su panel.
  const destino = page.getByTestId('fam-row').filter({ hasText: 'Aceite CBD 10%' }).first();
  await destino.click();
  await expect(page.getByTestId('fam-products-panel')).toBeVisible();
  const before = await page.getByTestId('fam-product-item').count();

  await page.getByTestId('fam-panel-add-existing').click();
  await expect(page.getByTestId('fam-add-existing-modal')).toBeVisible();

  // Buscar el producto del otro arquetipo: muestra el badge "ya en otra familia".
  await page.getByTestId('fam-add-existing-search').fill(movableName);
  const row = page.getByTestId('fam-add-existing-item').filter({ hasText: movableName }).first();
  await expect(row).toBeVisible();
  await expect(row.getByTestId('fam-add-existing-other')).toBeVisible();

  // Seleccionarlo y confirmar: el modal se cierra y el producto aparece en el panel
  // del destino; el contador del nodo sube.
  await row.getByTestId('fam-add-existing-check').check();
  await page.getByTestId('fam-add-existing-confirm').click();
  await expect(page.getByTestId('fam-add-existing-modal')).toHaveCount(0);
  await expect(page.getByTestId('fam-product-list')).toContainText(movableName);
  await expect.poll(() => page.getByTestId('fam-product-item').count()).toBe(before + 1);
  await expect(destino.getByTestId('fam-count')).toHaveText(`${before + 1} productos`);

  // Limpieza: devolver el producto a su arquetipo de origen vía "Mover" del panel.
  const moved = page.getByTestId('fam-product-item').filter({ hasText: movableName });
  await moved.getByTestId('fam-product-move').click();
  await page.locator('[role="option"]', { hasText: 'Aceite CBD 20%' }).first().click();
  await expect(page.getByTestId('fam-product-list')).not.toContainText(movableName);
});

test('Proveedores: vista detalle — datos editables, tarifa con import CSV y pedidos (I-18, D-07)', async ({
  page,
}) => {
  await navTo(page, 'suppliers');
  await page
    .getByTestId('supplier-row')
    .filter({ hasText: 'Distribuciones Norte' })
    .first()
    .click();
  await expect(page.getByTestId('supplier-detail')).toBeVisible();
  // Sus tarifas con el proveedor FIJO (sin selector ni comparativa)…
  await expect(page.getByTestId('sp-row').first()).toBeVisible();
  await expect(page.getByTestId('sp-supplier')).toHaveCount(0);
  await expect(page.getByTestId('sp-view-tabs')).toHaveCount(0);
  // …y sus pedidos de compra (seed: pedido confirmado de Distribuciones Norte).
  await expect(page.getByTestId('order-row').first()).toBeVisible();

  // Editar los datos PERSISTE (PATCH /suppliers/:id): volver y reabrir.
  await page.getByTestId('sd-phone').fill('600123123');
  await page.getByTestId('sd-save').click();
  await expect(page.getByTestId('sd-save')).toHaveText('Guardado ✓');
  await page.getByTestId('supplier-back').click();
  await page
    .getByTestId('supplier-row')
    .filter({ hasText: 'Distribuciones Norte' })
    .first()
    .click();
  await expect(page.getByTestId('sd-phone')).toHaveValue('600123123');

  // Import CSV desde el detalle: una fila con un SKU del seed (upsert, idempotente).
  await page.getByTestId('sp-import').click();
  await page.locator('[data-testid="sp-import-modal"] input[type="file"]').setInputFiles({
    name: 'tarifa.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('sku,price\nSKU-001,3.21\n'),
  });
  await expect(page.getByTestId('csv-dropzone-result')).toContainText('1 fila');
  await page.getByRole('button', { name: 'Cerrar' }).click();
  await expect(page.getByTestId('sp-table')).toContainText('3,21');
});

test('Control horario muestra la tabla de fichajes agrupada por día', async ({ page }) => {
  await navTo(page, 'timeclock');
  await expect(page.getByTestId('timeclock-table')).toBeVisible();
  await expect(page.getByTestId('timeclock-row').first()).toBeVisible();
  expect(await page.getByTestId('timeclock-row').count()).toBeGreaterThan(0);
  // Carril de facetas + cabeceras de grupo por día (mismo aspecto que Inventario).
  await expect(page.getByTestId('timeclock-facets')).toBeVisible();
  await expect(page.locator('.cat-group-name').first()).toBeVisible();
});

test('Control horario: faceta de empleado reduce las jornadas', async ({ page }) => {
  await navTo(page, 'timeclock');
  await expect(page.getByTestId('timeclock-table')).toBeVisible();
  // Filtrar por la encargada desde el carril (faceta del empleado): solo sus jornadas.
  const encargada = page
    .getByTestId('timeclock-facets')
    .locator('label.cat-facet-opt', { hasText: 'Encargada' });
  await encargada.click();
  const rows = page.getByTestId('timeclock-row');
  expect(await rows.count()).toBeGreaterThan(0);
  await expect(rows.first()).toContainText('Encargada');
  // Quitar la faceta vuelve a mostrar todas las jornadas.
  await encargada.click();
  expect(await page.getByTestId('timeclock-row').count()).toBeGreaterThan(0);
});

test('Promociones: filtro por 3 grupos y constructor de reglas (#99)', async ({ page }) => {
  await navTo(page, 'promotions');
  const cards = page.getByTestId('promo-card');
  await expect(cards.first()).toBeVisible(); // esperar a que cargue la lista
  // Por defecto se ven todas las promos (el seed crea 2 activas, 1 programada, 1 inactiva).
  const total = await cards.count();
  expect(total).toBeGreaterThanOrEqual(4);
  // Desactivar "Programadas" e "Inactivas" reduce a solo las activas.
  await page.getByTestId('promo-group-programada').click();
  await page.getByTestId('promo-group-inactiva').click();
  const active = await cards.count();
  expect(active).toBeGreaterThan(0);
  expect(active).toBeLessThan(total);
  // Constructor con previsualización del impacto.
  await page.getByTestId('new-promo').click();
  await expect(page.getByTestId('promo-preview')).toBeVisible();
  const promoName = `Test 3x2 ${Date.now()}`;
  await page.getByTestId('promo-name').fill(promoName);
  await page.getByTestId('promo-save').click();
  await expect(page.getByTestId('promo-list')).toContainText(promoName);
});

test('Mayorista: clientes, tarifas y pedidos en sub-pestañas (IT-17)', async ({ page }) => {
  await navTo(page, 'b2b');
  await expect(page.getByTestId('b2b-page')).toBeVisible();

  // Clientes: alta de uno nuevo (nombre único) que aparece en la tabla.
  await expect(page.getByTestId('b2b-customer-row').first()).toBeVisible(); // esperar carga
  expect(await page.getByTestId('b2b-customer-row').count()).toBeGreaterThanOrEqual(2);
  const customerName = `Cliente E2E ${Date.now()}`;
  await page.getByTestId('b2b-new-customer').click();
  await page.getByTestId('b2b-customer-name').fill(customerName);
  await page.getByTestId('b2b-customer-save').click();
  await expect(page.getByTestId('b2b-customer-form')).toHaveCount(0);
  await expect(page.getByTestId('b2b-customers-table')).toContainText(customerName);

  // Tarifas: al menos una y el detalle de precios.
  await page.getByTestId('b2b-tab-pricelists').click();
  expect(await page.getByTestId('b2b-pricelist-row').count()).toBeGreaterThan(0);
  await page
    .getByTestId('b2b-pricelists-table')
    .getByRole('button', { name: 'Precios' })
    .first()
    .click();
  await expect(page.getByTestId('b2b-pricelist-detail')).toBeVisible();
  await expect(page.getByTestId('b2b-pricelist-item').first()).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar' }).click();

  // Pedidos: alta de un pedido (cliente + 1 línea) que aumenta la lista.
  await page.getByTestId('b2b-tab-orders').click();
  await expect(page.getByTestId('b2b-order-row').first()).toBeVisible(); // esperar carga
  const before = await page.getByTestId('b2b-order-row').count();
  await page.getByTestId('b2b-new-order').click();
  await selectByLabel(page, 'b2b-order-customer', 'Herbolario');
  await selectByLabel(page, 'b2b-order-line-product', 'Aceite CBD 10%');
  await page.getByTestId('b2b-order-save').click();
  await expect(page.getByTestId('b2b-order-row')).toHaveCount(before + 1, { timeout: 10000 });
});

test('Traspasos: modal de nuevo traspaso con el patrón estándar (UX)', async ({ page }) => {
  await navTo(page, 'transfers');
  await page.getByTestId('new-transfer').click();
  const form = page.getByTestId('transfer-form');
  await expect(form).toBeVisible();
  await expect(form).toHaveAttribute('role', 'dialog');
  await expect(page.getByTestId('transfer-origin')).toBeVisible();
  await expect(page.getByTestId('transfer-product')).toBeVisible();
  await expect(page.getByTestId('transfer-qty')).toBeVisible();
});

test('Ayuda: hero del centro de ayuda (IT-20)', async ({ page }) => {
  await navTo(page, 'help');
  await expect(page.getByTestId('help-page')).toBeVisible();
  await expect(page.getByRole('heading', { name: '¿En qué podemos ayudarte?' })).toBeVisible();
  await expect(page.getByTestId('help-search')).toBeVisible();
});

test('Confirmación: borrar cliente usa el diálogo del design system (IT-19)', async ({ page }) => {
  await navTo(page, 'b2b');
  const victim = `Cliente a borrar ${Date.now()}`;
  await page.getByTestId('b2b-new-customer').click();
  await page.getByTestId('b2b-customer-name').fill(victim);
  await page.getByTestId('b2b-customer-save').click();
  await expect(page.getByTestId('b2b-customer-form')).toHaveCount(0);
  await expect(page.getByTestId('b2b-customers-table')).toContainText(victim);
  // El borrado vive ahora en la cabecera de la ficha (ya no hay papelera por fila):
  // seleccionamos el cliente y pulsamos «Borrar» en su ficha.
  await page.getByTestId('b2b-customer-row').filter({ hasText: victim }).click();
  await page.getByTestId('b2b-customer-delete').click();
  await expect(page.getByTestId('confirm-dialog')).toBeVisible();
  await page.getByTestId('confirm-accept').click();
  await expect(page.getByTestId('b2b-customers-table')).not.toContainText(victim);
  await expect(page.locator('[data-sileo-toast]')).toContainText('Cliente eliminado');
});

test('Modal: accesible (role dialog) y se cierra con Escape (IT-19)', async ({ page }) => {
  await navTo(page, 'b2b');
  await page.getByTestId('b2b-new-customer').click();
  const form = page.getByTestId('b2b-customer-form');
  await expect(form).toHaveAttribute('role', 'dialog');
  await expect(form).toHaveAttribute('aria-modal', 'true');
  await page.keyboard.press('Escape');
  await expect(form).toHaveCount(0);
});

test('API Keys (en Ajustes → Integraciones): lista, alta y banner de un solo uso (IT-18)', async ({
  page,
}) => {
  await navTo(page, 'settings');
  await expect(page.getByTestId('settings-integrations')).toBeVisible();
  await expect(page.getByTestId('apikeys-page')).toBeVisible();
  // Sin keys la tabla puede no existir (estado vacío): al crear una debe aparecer.
  const keyName = `Key E2E ${Date.now()}`;
  await page.getByTestId('apikey-new').click();
  await page.getByTestId('apikey-name').fill(keyName);
  await page.getByRole('button', { name: 'Crear' }).click();
  await expect(page.getByTestId('apikey-banner')).toContainText('no se mostrará');
  await expect(page.getByTestId('apikeys-table')).toContainText(keyName);
});

test('U-04: shell flotante — grupos desplegables abren su flyout y navegan', async ({ page }) => {
  // El shell flotante (sin header) presenta los grupos del sidebar como desplegables; el
  // rail contraíble se retiró en este diseño (`collapsible && !floating` en el componente).
  // Clic en el grupo abre el flyout con sus opciones.
  await page.getByTestId('nav-group-inventory').click();
  // S-02 fase A: Catálogo/Familias/Existencias se unifican en la entrada "Inventario".
  await expect(page.getByTestId('nav-inventory')).toBeVisible();
  await page.getByTestId('nav-inventory').click();
  // Navega al shell de Inventario (vista Catálogo por defecto) y el desplegable se cierra.
  await expect(page.getByTestId('inventory-page')).toBeVisible();
  await expect(page.getByTestId('nav-inventory')).toBeHidden();
  // El control segmentado conmuta a Existencias dentro del mismo shell.
  await page.getByTestId('inventory-view-existencias').click();
  await expect(page.getByTestId('stock-page')).toBeVisible();
});

test('S-03: el botón atrás del clúster flotante vuelve a la vista anterior', async ({ page }) => {
  // react-router (F0) + botón atrás (S-03): navegar a una vista y volver con float-back.
  await navTo(page, 'stores');
  await expect(page.getByTestId('page-heading')).toContainText('Tiendas');
  await navTo(page, 'suppliers');
  await expect(page.getByTestId('page-heading')).toContainText('Proveedores');
  // Atrás → vuelve a Tiendas (historial del router), no al Dashboard.
  await page.getByTestId('topbar-back').click();
  await expect(page.getByTestId('page-heading')).toContainText('Tiendas');
});

test('U-06: la búsqueda de funciones del header navega por nombre y sinónimo', async ({ page }) => {
  // El título de la vista vive en la zona izquierda de la TopBar; la búsqueda es
  // un lanzador a la derecha (entre la campana y el conmutador) que abre el
  // palette central donde se escribe y se ven las sugerencias.
  await expect(page.getByTestId('page-heading')).toBeVisible();
  // Por sinónimo: abrir el palette con el lanzador, "tarifas" → Proveedores.
  await page.getByTestId('function-search-launcher').click();
  await page.getByTestId('function-search-input').fill('tarifas');
  // El índice es granular: varias acciones comparten destino, basta la primera.
  await expect(page.getByTestId('function-search-result-suppliers').first()).toBeVisible();
  await page.getByTestId('function-search-result-suppliers').first().click();
  await expect(page.getByTestId('page-heading')).toContainText('Proveedores');
  // Por nombre con teclado: Ctrl+K abre el palette y enfoca el campo. S-01: 'usuarios'
  // resuelve a la Tab oculta 'users', que redirige al shell de Personal (?vista=equipo);
  // el page-heading deriva del label del sidebar de la Tab activa → 'Personal'.
  await page.keyboard.press('Control+k');
  await page.getByTestId('function-search-input').fill('usuarios');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('page-heading')).toContainText('Personal');
});

test('S-21: el buscador "tarifas b2b" aterriza en la subsección Tarifas (no en Clientes)', async ({
  page,
}) => {
  // P127: la vía a las Tarifas B2B mayoristas debe ser descubrible. El resultado del
  // buscador navega por deep-link a `/b2b?section=pricelists`, de modo que `B2bPage`
  // arranca con la subtab Tarifas activa (antes caía en la subtab Clientes por defecto).
  await expect(page.getByTestId('page-heading')).toBeVisible();
  await page.getByTestId('function-search-launcher').click();
  await page.getByTestId('function-search-input').fill('tarifas b2b');
  // La entrada "Tarifas B2B" comparte la Tab 'b2b' con Clientes/Pedidos; al traer
  // params { section: 'pricelists' } su resultado abre la subsección Tarifas.
  await page.getByTestId('function-search-result-b2b').first().click();
  // Aterriza en la page B2B con la subtab Tarifas ACTIVA y su tabla de tarifas visible.
  await expect(page.getByTestId('b2b-page')).toBeVisible();
  await expect(page.getByTestId('b2b-tab-pricelists')).toHaveClass(/active/);
  await expect(page.getByTestId('b2b-tab-customers')).not.toHaveClass(/active/);
  await expect(page.getByTestId('b2b-pricelists-table')).toBeVisible();
  // El deep-link queda reflejado en la URL (compartible / sobrevive al reload).
  await expect(page).toHaveURL(/\/b2b\?section=pricelists/);
});

test('U-08: la marca corporativa se aplica como tema en vivo y persiste', async ({ page }) => {
  const brandVar = () =>
    page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--ui-brand').trim(),
    );
  await navTo(page, 'settings');
  // La org puede traer YA un color guardado (uso real): capturarlo para
  // restaurarlo al final sin pisar la configuración del usuario.
  await expect(page.getByTestId('brand-color-hex')).toBeVisible();
  const initialHex = await page.getByTestId('brand-color-hex').inputValue();
  await page.getByTestId('brand-color-hex').fill('#aa00ff');
  await page.getByTestId('settings-save').click();
  await expect(page.getByTestId('settings-save')).toContainText('Guardado');
  // El token de acento cambia en vivo (useBranding re-aplica al invalidarse).
  await expect.poll(brandVar).toBe('#aa00ff');
  // Persiste tras recargar (viene de la organización, no de localStorage).
  // Con react-router el reload conserva la ruta → ancla float-actions.
  await page.reload();
  await expect(page.getByTestId('topbar')).toBeVisible({ timeout: 15000 });
  await expect.poll(brandVar).toBe('#aa00ff');
  // Restaurar el estado original (color guardado previo, o el default).
  await navTo(page, 'settings');
  if (initialHex) {
    await page.getByTestId('brand-color-hex').fill(initialHex);
  } else {
    await page.getByTestId('settings-reset').click();
  }
  await page.getByTestId('settings-save').click();
  await expect(page.getByTestId('settings-save')).toContainText('Guardado');
  await expect.poll(brandVar).not.toBe('#aa00ff');
});

test('U-10/U-09: avisos de stock en panel propio encima y botón Columnas en la toolbar', async ({
  page,
}) => {
  await navTo(page, 'stock');
  await expect(page.getByTestId('stock-page')).toBeVisible();
  // El panel de avisos es una card propia, hermana de la tabla (no anidada dentro).
  const alertsPanel = page.getByTestId('stock-alerts-panel');
  await expect(alertsPanel).toBeVisible();
  const nestedTables = await alertsPanel.locator('table').count();
  expect(nestedTables).toBe(0);
  // El botón de columnas vive en la toolbar de filtros, no flotando sobre la tabla.
  await expect(page.getByTestId('stock-columns-toggle')).toBeVisible();
});

test('U-11/U-12: la campana abre Notificaciones y "Resolver" lleva a Stock del producto', async ({
  page,
}) => {
  // La campana vive en el clúster de acciones flotante (sustituye a la TopBar), con badge de roturas.
  await expect(page.getByTestId('topbar-notifications')).toBeVisible();
  await page.getByTestId('topbar-notifications').click();
  await expect(page.getByTestId('notifications-page')).toBeVisible();
  // Cada alerta tiene su botón Resolver → Stock filtrado por el producto.
  const firstAlert = page.getByTestId('alert-row').first();
  const productName = (await firstAlert.locator('td').first().textContent())?.trim() ?? '';
  await firstAlert.getByTestId('alert-resolve').click();
  await expect(page.getByTestId('stock-page')).toBeVisible();
  // S-02 fases B-E: Existencias ya no tiene caja propia (`stock-search`); la búsqueda
  // es el filtro COMPARTIDO del shell de Inventario, poblado desde el deep-link `?q=`.
  await expect(page.getByTestId('inventory-search')).toHaveValue(productName);
});

test('La campana togglea Notificaciones y vuelve a la página anterior', async ({ page }) => {
  const bell = page.getByTestId('topbar-notifications');

  // Desde Stock: abrir Notificaciones con la campana, cerrarla y volver a Stock.
  await navTo(page, 'stock');
  await expect(page.getByTestId('stock-page')).toBeVisible();
  await bell.click();
  await expect(page.getByTestId('notifications-page')).toBeVisible();
  await expect(bell).toHaveAttribute('aria-pressed', 'true');
  await bell.click();
  await expect(page.getByTestId('stock-page')).toBeVisible();
  await expect(page.getByTestId('notifications-page')).toHaveCount(0);
  await expect(bell).toHaveAttribute('aria-pressed', 'false');

  // Mismo toggle desde otra página de origen (Catálogo) → vuelve a Catálogo.
  await navTo(page, 'catalog');
  await expect(page.getByTestId('catalog-table')).toBeVisible();
  await bell.click();
  await expect(page.getByTestId('notifications-page')).toBeVisible();
  await bell.click();
  await expect(page.getByTestId('catalog-table')).toBeVisible();
  await expect(page.getByTestId('notifications-page')).toHaveCount(0);
});

test('Proveedores · Comparativa: gráficos de media/mediana y de producto buscado', async ({
  page,
}) => {
  await navTo(page, 'suppliers');
  await page.getByTestId('suppliers-tab-prices').click();
  await page.getByTestId('sp-view-comparativa').click();
  // Gráfico de media/mediana por proveedor (Chart común del sistema).
  await expect(page.getByTestId('sp-cmp-avg')).toBeVisible();
  await expect(page.getByTestId('sp-cmp-avg').locator('.ui-chart')).toBeVisible();
  // La tabla de apoyo se retiró: solo quedan los dos paneles de gráficos.
  await expect(page.getByTestId('sp-comparison-table')).toHaveCount(0);
  // Sin selección, el panel de producto invita a buscar.
  await expect(page.getByTestId('sp-cmp-product')).toContainText('Busca un producto');
  // Buscar puebla el gráfico del producto.
  await page.getByTestId('sp-cmp-search').fill('Aceite CBD 10% — Beemine');
  await expect(page.getByTestId('sp-cmp-product')).toContainText('Aceite CBD 10% — Beemine');
  await expect(page.getByTestId('sp-cmp-product').locator('.ui-chart')).toBeVisible();
  // Una búsqueda amplia ofrece píldoras de coincidencias; clicar una selecciona.
  await page.getByTestId('sp-cmp-search').fill('Aceite');
  const suggestions = page.getByTestId('sp-cmp-suggestion');
  await expect(suggestions.first()).toBeVisible();
  const picked = (await suggestions.nth(1).textContent()) ?? '';
  await suggestions.nth(1).click();
  await expect(page.getByTestId('sp-cmp-product')).toContainText(picked.trim());
  await expect(page.getByTestId('sp-cmp-product').locator('.ui-chart')).toBeVisible();
});
