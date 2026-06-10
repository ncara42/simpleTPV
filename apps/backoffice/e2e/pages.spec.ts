import { expect, test } from '@playwright/test';

import { gotoApp, navTo, selectByLabel, selectByValue } from './helpers.js';

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
  await expect(page.getByTestId('catalog-count')).toContainText(/\d/);
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
  await expect(page.getByTestId('products-edit')).toHaveText('Editar (2)');
  await page.getByTestId('products-edit').click();
  // El asistente recorre los seleccionados de uno en uno.
  await expect(page.getByTestId('form-save')).toHaveText('Siguiente (1 / 2)');
  await page.getByTestId('form-save').click();
  await expect(page.getByTestId('form-save')).toHaveText('Guardar (2 / 2)');
  await page.getByTestId('form-save').click();
  await expect(page.getByTestId('product-form')).toHaveCount(0);
});

test('Tiendas muestra el grid de ubicaciones', async ({ page }) => {
  await navTo(page, 'stores');
  await expect(page.getByTestId('stores-grid')).toBeVisible();
  await expect(page.getByTestId('store-card')).toHaveCount(6);
});

test('Tiendas: orden por ventas y acceso directo a stock (UX)', async ({ page }) => {
  await navTo(page, 'stores');
  await expect(page.getByTestId('store-sales').first()).toBeVisible();
  // El panel ya no tiene filtros (solo crea y observa).
  await expect(page.getByTestId('store-status-filter')).toHaveCount(0);
  // Acceso directo "Stock" → lleva a la página de Stock.
  await page.getByTestId('store-card').first().getByTestId('store-open-stock').click();
  await expect(page.getByTestId('stock-page')).toBeVisible();
});

test('Tiendas: detalle, estado operativo y registro de fichajes (#100, #102)', async ({ page }) => {
  await navTo(page, 'stores');
  await expect(page.getByTestId('store-open').first()).toBeVisible();
  // Detalle de "Sur" → operativo + registro de fichajes.
  await page.getByTestId('store-card').filter({ hasText: 'Sur' }).click();
  await expect(page.getByTestId('store-detail')).toBeVisible();
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
  await page.getByTestId('store-card').filter({ hasText: 'Sur' }).click();
  await expect(page.getByTestId('store-ops')).toBeVisible();
  // Estado inicial → marcar verificada + incidencia y guardar.
  const wasVerified = await page.getByTestId('store-ops-verified').isChecked();
  await page.getByTestId('store-ops-verified').setChecked(!wasVerified, { force: true });
  await page.getByTestId('store-ops-incident').fill('e2e: incidencia de prueba');
  await page.getByTestId('store-ops-save').click();
  await expect(page.getByTestId('store-ops-save')).toContainText('Guardado', { timeout: 5000 });
  // Recargar: el estado viene del backend, no de un useState (anti-test E-02).
  await page.reload();
  await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 15000 });
  await navTo(page, 'stores');
  await page.getByTestId('store-card').filter({ hasText: 'Sur' }).click();
  await expect(page.getByTestId('store-ops-verified')).toBeChecked({ checked: !wasVerified });
  await expect(page.getByTestId('store-ops-incident')).toHaveValue('e2e: incidencia de prueba');
  // Restaurar para no contaminar el seed entre runs.
  await page.getByTestId('store-ops-verified').setChecked(wasVerified, { force: true });
  await page.getByTestId('store-ops-incident').fill('');
  await page.getByTestId('store-ops-save').click();
  await expect(page.getByTestId('store-ops-save')).toContainText('Guardado', { timeout: 5000 });
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
  const card = page.getByTestId('store-card').filter({ hasText: `Tienda E2E ${code}` });
  await expect(card).toBeVisible();
  // Editar desde el detalle: renombrar.
  await card.click();
  await page.getByTestId('store-edit').click();
  await page.getByTestId('store-name').fill(`Tienda E2E ${code} Editada`);
  await page.getByTestId('store-save').click();
  await expect(page.getByTestId('store-form')).toHaveCount(0);
  // Persiste tras recargar.
  await page.reload();
  await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 15000 });
  await navTo(page, 'stores');
  const renamed = page.getByTestId('store-card').filter({ hasText: `Tienda E2E ${code} Editada` });
  await expect(renamed).toBeVisible();
  // Borrar (tienda vacía) con confirmación; desaparece del grid.
  await renamed.click();
  await page.getByTestId('store-delete').click();
  await page.getByRole('button', { name: 'Borrar' }).last().click();
  await expect(
    page.getByTestId('store-card').filter({ hasText: `Tienda E2E ${code}` }),
  ).toHaveCount(0);
});

test('Usuarios muestra 4 usuarios con badge de rol', async ({ page }) => {
  await navTo(page, 'users');
  await expect(page.getByTestId('users-count')).toContainText('4');
  await expect(page.getByTestId('user-role-badge').first()).toBeVisible();
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
  // Filtrar por rotación baja: puede dejar 0 filas (estado vacío), nunca más que el total.
  await selectByValue(page, 'stock-rotation', 'baja');
  expect(await page.getByTestId('stock-row').count()).toBeLessThanOrEqual(total);
});

test('Stock: ajustar existencias PERSISTE tras recargar (E-01)', async ({ page }) => {
  await navTo(page, 'stock');
  await expect(page.getByTestId('stock-row').first()).toBeVisible();
  // Abrir el desglose del primer producto y su primera tienda.
  const firstRow = page.getByTestId('stock-row').first();
  const productName = (await firstRow.locator('td').first().innerText()).trim();
  await firstRow.getByTestId('stock-heatmap').click();
  await page.getByTestId('stock-store-cell').first().click();
  await expect(page.getByTestId('stock-adjust-form')).toBeVisible();
  const original = await page.getByTestId('stock-adjust-qty').inputValue();
  const target = String(Number(original) + 7);
  await page.getByTestId('stock-adjust-qty').fill(target);
  await page.getByTestId('stock-adjust-reason').fill('e2e: anti-regresión E-01');
  await page.getByTestId('stock-adjust-save').click();
  await expect(page.getByTestId('stock-adjust-form')).toHaveCount(0);
  // Recargar: la cantidad debe venir del backend, no de un overlay local.
  await page.reload();
  await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 15000 });
  await navTo(page, 'stock');
  const row = page.getByTestId('stock-row').filter({ hasText: productName }).first();
  await expect(row).toBeVisible();
  await row.getByTestId('stock-heatmap').click();
  await expect(page.getByTestId('stock-store-cell').first()).toContainText(target);
  // Restaurar el valor original para no contaminar el seed entre runs.
  await page.getByTestId('stock-store-cell').first().click();
  await page.getByTestId('stock-adjust-qty').fill(original);
  await page.getByTestId('stock-adjust-reason').fill('e2e: restaurar');
  await page.getByTestId('stock-adjust-save').click();
  await expect(page.getByTestId('stock-adjust-form')).toHaveCount(0);
});

test('Ventas: DataTable con filtros, paginación y agregados (#95 / IT-06)', async ({ page }) => {
  await navTo(page, 'sales');
  await expect(page.getByTestId('sales-table')).toBeVisible();
  // Primera página del DataTable: 20 filas (hay histórico abundante).
  await expect(page.getByTestId('ui-dt-row')).toHaveCount(20);
  await expect(page.getByTestId('sales-totals')).toContainText('Margen medio');
  // Paginación: página siguiente, otras 20 filas.
  await page.getByLabel('Página siguiente').click();
  await expect(page.getByTestId('ui-dt-row')).toHaveCount(20);
  // Filtrar por la vendedora que tiene el histórico (Dependiente Demo).
  await selectByLabel(page, 'sales-seller', 'Dependiente');
  const rows = page.getByTestId('ui-dt-row');
  expect(await rows.count()).toBeGreaterThan(0);
  await expect(rows.first()).toContainText('Dependiente');
  // Guardar la vista actual y verla como chip reutilizable.
  await page.getByTestId('sales-save-view').click();
  await expect(page.getByTestId('sales-views')).toContainText('Dependiente');
  // Limpiar vuelve a la primera página completa.
  await page.getByTestId('sales-clear').click();
  await expect(page.getByTestId('ui-dt-row')).toHaveCount(20);
  // Filtro por estado anulada: en la vista solo aparecen anuladas (ninguna completada).
  await selectByValue(page, 'sales-status', 'VOIDED');
  await expect(page.getByTestId('ui-dt-row').filter({ hasText: 'Completada' })).toHaveCount(0);
});

test('Ventas: columnas configurables ocultan una columna y persiste (IT-16)', async ({ page }) => {
  await navTo(page, 'sales');
  await expect(page.getByRole('columnheader', { name: 'Vendedor' })).toBeVisible();
  await page.getByTestId('sales-columns-toggle').click();
  await expect(page.getByTestId('sales-columns-editor')).toBeVisible();
  await page.getByTestId('col-toggle-sellerName').click();
  await expect(page.getByRole('columnheader', { name: 'Vendedor' })).toBeHidden();
  // Persiste tras recargar (preferencia en /me/preferences).
  await page.reload();
  await navTo(page, 'sales');
  await expect(page.getByTestId('sales-table')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Vendedor' })).toBeHidden();
  // Restaura la columna para no dejar la preferencia sucia.
  await page.getByTestId('sales-columns-toggle').click();
  await page.getByTestId('col-toggle-sellerName').click();
  await expect(page.getByRole('columnheader', { name: 'Vendedor' })).toBeVisible();
});

test('Compras y VeriFactu están retiradas del menú (#106)', async ({ page }) => {
  await expect(page.getByTestId('nav-purchases')).toHaveCount(0);
  await expect(page.getByTestId('nav-verifactu')).toHaveCount(0);
});

test('Familias muestra las raíz con subfamilias anidadas (#97)', async ({ page }) => {
  await navTo(page, 'families');
  // Árbol canónico del seed: 4 raíces + 2 subfamilias + 6 arquetipos = 12 nodos.
  // >= por si otros tests crean subniveles.
  expect(await page.getByTestId('fam-row').count()).toBeGreaterThanOrEqual(12);
  await expect(page.getByText('Aceites CBD')).toBeVisible();
  await expect(page.getByTestId('fam-count').first()).toContainText('productos');
});

test('Familias: crear un subnivel anidado (profundidad arbitraria, UX)', async ({ page }) => {
  await navTo(page, 'families');
  const aceitesCbd = page.getByTestId('fam-row').filter({ hasText: 'Aceites CBD' }).first();
  await aceitesCbd.click();
  await aceitesCbd.getByTestId('fam-add-child').click();
  const subName = `Subnivel E2E ${Date.now()}`;
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

test('Familias: marcar un subnivel como arquetipo lo distingue y oculta "+ Subnivel"', async ({
  page,
}) => {
  await navTo(page, 'families');
  // Crear un subnivel bajo "Flores CBD" (no una raíz, para no alterar el orden de
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
  // Al seleccionarlo NO ofrece crear subniveles (un arquetipo solo contiene productos).
  await row.click();
  await expect(row.getByTestId('fam-add-child')).toHaveCount(0);
});

test('Control horario muestra la tabla de fichajes con totales', async ({ page }) => {
  await navTo(page, 'timeclock');
  await expect(page.getByTestId('timeclock-table')).toBeVisible();
  await expect(page.getByTestId('timeclock-row').first()).toBeVisible();
  expect(await page.getByTestId('timeclock-row').count()).toBeGreaterThan(0);
  await expect(page.getByTestId('timeclock-totals')).toContainText('jornada');
});

test('Control horario: filtro por empleado reduce las jornadas', async ({ page }) => {
  await navTo(page, 'timeclock');
  await expect(page.getByTestId('timeclock-table')).toBeVisible();
  // Filtrar por la encargada (tiene jornadas en el seed): solo aparecen las suyas.
  await selectByLabel(page, 'timeclock-employee', 'Encargada');
  const rows = page.getByTestId('timeclock-row');
  expect(await rows.count()).toBeGreaterThan(0);
  await expect(rows.first()).toContainText('Encargada');
  // Limpiar el filtro vuelve a mostrar jornadas.
  await page.getByTestId('timeclock-clear').click();
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

test('Ayuda: canales de contacto y FAQ (IT-20)', async ({ page }) => {
  await navTo(page, 'help');
  await expect(page.getByTestId('help-page')).toBeVisible();
  await expect(page.getByTestId('help-whatsapp')).toHaveAttribute('href', /^https:\/\/wa\.me\//);
  await expect(page.getByTestId('help-email')).toHaveAttribute('href', /^mailto:/);
  await expect(page.getByTestId('help-phone')).toHaveAttribute('href', /^tel:/);
  const first = page.getByTestId('faq-item').first();
  await first.locator('summary').click();
  await expect(first).toHaveJSProperty('open', true);
});

test('Confirmación: borrar cliente usa el diálogo del design system (IT-19)', async ({ page }) => {
  await navTo(page, 'b2b');
  const victim = `Cliente a borrar ${Date.now()}`;
  await page.getByTestId('b2b-new-customer').click();
  await page.getByTestId('b2b-customer-name').fill(victim);
  await page.getByTestId('b2b-customer-save').click();
  await expect(page.getByTestId('b2b-customer-form')).toHaveCount(0);
  await expect(page.getByTestId('b2b-customers-table')).toContainText(victim);
  await page
    .getByTestId('b2b-customer-row')
    .filter({ hasText: victim })
    .getByRole('button', { name: 'Borrar' })
    .click();
  await expect(page.getByTestId('confirm-dialog')).toBeVisible();
  await page.getByTestId('confirm-accept').click();
  await expect(page.getByTestId('b2b-customers-table')).not.toContainText(victim);
  await expect(page.getByTestId('toast-stack')).toContainText('Cliente eliminado');
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

test('API Keys (en Ayuda → Integraciones): lista, alta y banner de un solo uso (IT-18)', async ({
  page,
}) => {
  await navTo(page, 'help');
  await expect(page.getByTestId('help-integrations')).toBeVisible();
  await expect(page.getByTestId('apikeys-page')).toBeVisible();
  // Sin keys la tabla puede no existir (estado vacío): al crear una debe aparecer.
  const keyName = `Key E2E ${Date.now()}`;
  await page.getByTestId('apikey-new').click();
  await page.getByTestId('apikey-name').fill(keyName);
  await page.getByRole('button', { name: 'Crear' }).click();
  await expect(page.getByTestId('apikey-banner')).toContainText('no se mostrará');
  await expect(page.getByTestId('apikeys-table')).toContainText(keyName);
});
