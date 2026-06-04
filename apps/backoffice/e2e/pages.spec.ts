import { expect, test } from '@playwright/test';

// Los <select> nativos se sustituyeron por el componente <Select> propio: abrir el
// disparador (lleva el data-testid) y pulsar la opción por su data-value.
async function selectOption(
  page: import('@playwright/test').Page,
  testid: string,
  value: string,
): Promise<void> {
  await page.getByTestId(testid).click();
  await page.locator(`[role="option"][data-value="${value}"]`).click();
}

async function login(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('login-email').fill('admin@org1.test');
  await page.getByTestId('login-password').fill('demo');
  await page.getByTestId('login-submit').click();
  await page.getByTestId('dashboard').waitFor({ timeout: 10000 });
}

test('Catálogo muestra los 12 productos demo', async ({ page }) => {
  await login(page);
  await page.getByTestId('nav-catalog').click();
  await expect(page.getByTestId('catalog-count')).toContainText('12');
  await expect(page.getByTestId('catalog-table')).toBeVisible();
});

test('Catálogo: ruta de familia y selector dependiente de subfamilia (#97)', async ({ page }) => {
  await login(page);
  await page.getByTestId('nav-catalog').click();
  // La tabla muestra la ruta jerárquica Familia › Subfamilia.
  await expect(page.getByTestId('catalog-family').first()).toContainText('›');
  // El modal tiene selector dependiente familia → subfamilia.
  await page.getByTestId('new-product').click();
  await selectOption(page, 'form-family', 'fam-flores');
  await expect(page.getByTestId('form-subfamily')).toBeEnabled();
  await selectOption(page, 'form-subfamily', 'fam-flores-indica');
});

test('Catálogo: selección múltiple y edición en lote', async ({ page }) => {
  await login(page);
  await page.getByTestId('nav-catalog').click();
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

test('Tiendas muestra el grid de 6 ubicaciones', async ({ page }) => {
  await login(page);
  await page.getByTestId('nav-stores').click();
  await expect(page.getByTestId('stores-grid')).toBeVisible();
  await expect(page.getByTestId('store-card')).toHaveCount(6);
});

test('Tiendas: orden por ventas y filtro de estado (#101, #103)', async ({ page }) => {
  await login(page);
  await page.getByTestId('nav-stores').click();
  // Métrica de ventas visible en las cards.
  await expect(page.getByTestId('store-sales').first()).toBeVisible();
  // Orden por defecto = ventas de hoy desc → Gran Vía (360 €) primera.
  await expect(page.getByTestId('store-card').first()).toContainText('Gran Vía');
  // Filtro "Dormidas" → solo el Almacén (active: false).
  await page.getByTestId('store-status-filter').click();
  await page.getByRole('option', { name: 'Dormidas' }).click();
  await expect(page.getByTestId('store-card')).toHaveCount(1);
  await expect(page.getByTestId('store-card')).toContainText('Almacén');
});

test('Tiendas: abierta/cerrada y dispositivo autorizado (#100, #102)', async ({ page }) => {
  await login(page);
  await page.getByTestId('nav-stores').click();
  // Indicador operativo Abierta/Cerrada en las cards.
  await expect(page.getByTestId('store-open').first()).toBeVisible();
  // Detalle de "Sur" (dispositivo sin verificar) → operativo + flujo de autorización.
  await page.getByTestId('store-card').filter({ hasText: 'Sur' }).click();
  await expect(page.getByTestId('store-detail')).toBeVisible();
  await expect(page.getByTestId('store-detail-open')).toBeVisible();
  // Registro de fichajes: abre el drawer lateral con la tabla y lo cierra.
  await page.getByTestId('store-log-open').click();
  await expect(page.getByTestId('store-log-drawer')).toBeVisible();
  await expect(page.getByTestId('store-log-table')).toBeVisible();
  await page.getByTestId('store-log-close').click();
  await expect(page.getByTestId('store-log-drawer')).toBeHidden();
  // Dispositivo sin verificar → flujo de autorización.
  await expect(page.getByTestId('store-device-warn')).toBeVisible();
  await page.getByTestId('store-device-authorize').click();
  await expect(page.getByTestId('store-device-ok')).toBeVisible();
});

test('Usuarios muestra 4 usuarios con badge de rol', async ({ page }) => {
  await login(page);
  await page.getByTestId('nav-users').click();
  await expect(page.getByTestId('users-count')).toContainText('4');
  await expect(page.getByTestId('user-role-badge').first()).toBeVisible();
});

test('Usuarios: editar precarga datos y permite renombrar (#104)', async ({ page }) => {
  await login(page);
  await page.getByTestId('nav-users').click();
  // Seleccionar el primer usuario y editar desde las acciones en lote de la toolbar.
  await page.getByTestId('user-select').first().check();
  await expect(page.getByTestId('users-edit')).toBeVisible();
  await page.getByTestId('users-edit').click();
  await expect(page.getByTestId('user-name')).toHaveValue('Ana Caravaca');
  await expect(page.getByTestId('user-role')).toBeVisible();
  await page.getByTestId('user-name').fill('Ana C. Editado');
  await page.getByTestId('user-save').click();
  await expect(page.getByTestId('users-table')).toContainText('Ana C. Editado');
});

test('Usuarios: edición en lote avanza con "Siguiente (n / total)"', async ({ page }) => {
  await login(page);
  await page.getByTestId('nav-users').click();
  const checks = page.getByTestId('user-select');
  await checks.nth(0).check();
  await checks.nth(1).check();
  await expect(page.getByTestId('users-edit')).toHaveText('Editar (2)');
  await page.getByTestId('users-edit').click();
  // Primer paso: el botón primario invita a continuar con el siguiente.
  await expect(page.getByTestId('user-save')).toHaveText('Siguiente (1 / 2)');
  await page.getByTestId('user-save').click();
  // Último paso: el botón confirma el guardado del lote completo.
  await expect(page.getByTestId('user-save')).toHaveText('Guardar (2 / 2)');
  await page.getByTestId('user-save').click();
  await expect(page.getByTestId('user-form')).toHaveCount(0);
});

test('Stock global muestra la tabla con badges por tienda', async ({ page }) => {
  await login(page);
  await page.getByTestId('nav-stock').click();
  await expect(page.getByTestId('stock-table')).toBeVisible();
  await expect(page.getByTestId('stock-row')).toHaveCount(5);
});

test('Stock: tabla global y filtro por rotación (#96)', async ({ page }) => {
  await login(page);
  await page.getByTestId('nav-stock').click();
  await expect(page.getByTestId('stock-table')).toBeVisible();
  await expect(page.getByTestId('stock-row')).toHaveCount(5);
  // Rotación baja → solo el Vapeador Pro.
  await selectOption(page, 'stock-rotation', 'baja');
  await expect(page.getByTestId('stock-row')).toHaveCount(1);
  await expect(page.getByTestId('stock-table')).toContainText('Vapeador Pro');
});

test('Ventas: scroll infinito, filtros y vistas guardadas (#95)', async ({ page }) => {
  await login(page);
  await page.getByTestId('nav-sales').click();
  await expect(page.getByTestId('sales-table')).toBeVisible();
  // Primer bloque del scroll infinito (20 de 60).
  await expect(page.getByTestId('sales-row')).toHaveCount(20);
  // Filtrar por la vendedora Marta → sus 15 tickets (caben en un bloque).
  await selectOption(page, 'sales-seller', 'u-marta');
  const rows = page.getByTestId('sales-row');
  await expect(rows).toHaveCount(15);
  await expect(rows.first()).toContainText('Marta');
  // Guardar la vista actual y verla como chip reutilizable.
  await page.getByTestId('sales-save-view').click();
  await expect(page.getByTestId('sales-views')).toContainText('Marta');
  // Limpiar vuelve a mostrar todo.
  await page.getByTestId('sales-clear').click();
  await expect(page.getByTestId('sales-row')).toHaveCount(20);
  // Las ventas anuladas ya no llevan etiqueta: la fila se tiñe (clase sale-voided).
  // El filtro de estado las aísla y solo deben quedar filas anuladas.
  await selectOption(page, 'sales-status', 'VOIDED');
  await expect(page.locator('tr.sale-voided').first()).toBeVisible();
  await expect(page.locator('[data-testid="sales-row"]:not(.sale-voided)')).toHaveCount(0);
});

test('Compras y VeriFactu están retiradas del menú (#106)', async ({ page }) => {
  await login(page);
  await expect(page.getByTestId('nav-purchases')).toHaveCount(0);
  await expect(page.getByTestId('nav-verifactu')).toHaveCount(0);
});

test('Familias muestra las 5 raíz con subfamilias anidadas (#97)', async ({ page }) => {
  await login(page);
  await page.getByTestId('nav-families').click();
  // 5 familias raíz + 6 subfamilias (flores, aceites y cosmética con 2 cada una) = 11 filas.
  await expect(page.getByTestId('fam-row')).toHaveCount(11);
  await expect(page.getByText('Índica')).toBeVisible();
  await expect(page.getByTestId('fam-count').first()).toContainText('productos');
});

test('Familias: reordenar familias raíz (#98)', async ({ page }) => {
  await login(page);
  await page.getByTestId('nav-families').click();
  const rows = page.getByTestId('fam-row');
  await expect(rows.first()).toContainText('Flores CBD');
  // Fila 3 (0-based) = "Aceites" raíz (DFS: Flores, Índica, Sativa, Aceites…).
  // Soltarla en la mitad superior de "Flores CBD" inserta la línea antes (drag
  // nativo HTML5): el destino se calcula por clientY < punto medio → 'before'.
  await rows.nth(3).dragTo(rows.first(), { targetPosition: { x: 12, y: 4 } });
  await expect(rows.first()).toContainText('Aceites');
});

test('Promociones: lista por estado y constructor de reglas (#99)', async ({ page }) => {
  await login(page);
  await page.getByTestId('nav-promotions').click();
  // 4 promociones demo (activa, programada, expirada, pausada).
  await expect(page.getByTestId('promo-card')).toHaveCount(4);
  // Filtro "Activas" (desplegable de estado) → solo la promo vigente.
  await selectOption(page, 'promo-filters', 'activa');
  await expect(page.getByTestId('promo-card')).toHaveCount(1);
  // Constructor con previsualización del impacto.
  await page.getByTestId('new-promo').click();
  await expect(page.getByTestId('promo-preview')).toBeVisible();
  await page.getByTestId('promo-name').fill('Test 3x2');
  await page.getByTestId('promo-save').click();
  await expect(page.getByTestId('promo-list')).toContainText('Test 3x2');
});
