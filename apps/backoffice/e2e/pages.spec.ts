import { expect, test } from '@playwright/test';

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
  await page.getByTestId('form-family').selectOption('fam-flores');
  await expect(page.getByTestId('form-subfamily')).toBeEnabled();
  await page.getByTestId('form-subfamily').selectOption('fam-flores-indica');
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
  await page.getByTestId('store-filter-dormida').click();
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

test('Usuarios: editar precarga datos y muestra permisos por rol (#104)', async ({ page }) => {
  await login(page);
  await page.getByTestId('nav-users').click();
  await page.getByTestId('user-edit').first().click();
  await expect(page.getByTestId('user-name')).toHaveValue('Ana Caravaca');
  await expect(page.getByTestId('role-permissions')).toBeVisible();
  await page.getByTestId('user-name').fill('Ana C. Editado');
  await page.getByTestId('user-save').click();
  await expect(page.getByTestId('users-table')).toContainText('Ana C. Editado');
});

test('Stock global muestra la tabla con badges por tienda', async ({ page }) => {
  await login(page);
  await page.getByTestId('nav-stock').click();
  await expect(page.getByTestId('stock-table')).toBeVisible();
  await expect(page.getByTestId('stock-row')).toHaveCount(5);
});

test('Stock: KPIs de resumen y filtro por rotación (#96)', async ({ page }) => {
  await login(page);
  await page.getByTestId('nav-stock').click();
  await expect(page.getByTestId('stock-kpis')).toBeVisible();
  await expect(page.getByTestId('stock-row')).toHaveCount(5);
  // Rotación baja → solo el Vapeador Pro.
  await page.getByTestId('stock-rotation').selectOption('baja');
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
  await page.getByTestId('sales-seller').selectOption('u-marta');
  const rows = page.getByTestId('sales-row');
  await expect(rows).toHaveCount(15);
  await expect(rows.first()).toContainText('Marta');
  // Guardar la vista actual y verla como chip reutilizable.
  await page.getByTestId('sales-save-view').click();
  await expect(page.getByTestId('sales-views')).toContainText('Marta');
  // Limpiar vuelve a mostrar todo, con alguna venta anulada.
  await page.getByTestId('sales-clear').click();
  await expect(page.getByTestId('sales-row')).toHaveCount(20);
  await expect(page.getByText('Anulada').first()).toBeVisible();
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
  // Subirla la coloca por encima de "Flores CBD".
  await rows.nth(3).getByTestId('fam-up').click();
  await expect(rows.first()).toContainText('Aceites');
});

test('Promociones: lista por estado y constructor de reglas (#99)', async ({ page }) => {
  await login(page);
  await page.getByTestId('nav-promotions').click();
  // 4 promociones demo (activa, programada, expirada, pausada).
  await expect(page.getByTestId('promo-card')).toHaveCount(4);
  // Filtro "Activas" → solo la promo vigente.
  await page.getByTestId('promo-filter-activa').click();
  await expect(page.getByTestId('promo-card')).toHaveCount(1);
  // Constructor con previsualización del impacto.
  await page.getByTestId('new-promo').click();
  await expect(page.getByTestId('promo-preview')).toBeVisible();
  await page.getByTestId('promo-name').fill('Test 3x2');
  await page.getByTestId('promo-save').click();
  await expect(page.getByTestId('promo-list')).toContainText('Test 3x2');
});
