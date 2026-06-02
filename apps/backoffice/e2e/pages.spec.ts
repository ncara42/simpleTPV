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

test('Usuarios muestra 4 usuarios con badge de rol', async ({ page }) => {
  await login(page);
  await page.getByTestId('nav-users').click();
  await expect(page.getByTestId('users-count')).toContainText('4');
  await expect(page.getByTestId('user-role-badge').first()).toBeVisible();
});

test('Stock global muestra la tabla con badges por tienda', async ({ page }) => {
  await login(page);
  await page.getByTestId('nav-stock').click();
  await expect(page.getByTestId('stock-table')).toBeVisible();
  await expect(page.getByTestId('stock-row')).toHaveCount(5);
});

test('Ventas muestra el historial con una venta anulada', async ({ page }) => {
  await login(page);
  await page.getByTestId('nav-sales').click();
  await expect(page.getByTestId('sales-table')).toBeVisible();
  await expect(page.getByTestId('sales-row')).toHaveCount(5);
  await expect(page.getByText('Anulada')).toBeVisible();
});

test('Compras y VeriFactu están retiradas del menú (#106)', async ({ page }) => {
  await login(page);
  await expect(page.getByTestId('nav-purchases')).toHaveCount(0);
  await expect(page.getByTestId('nav-verifactu')).toHaveCount(0);
});

test('Familias muestra las 5 familias con contador', async ({ page }) => {
  await login(page);
  await page.getByTestId('nav-families').click();
  await expect(page.getByTestId('fam-row')).toHaveCount(5);
  await expect(page.getByTestId('fam-count').first()).toContainText('productos');
});
