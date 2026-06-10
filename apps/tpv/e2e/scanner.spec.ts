import { expect, test } from '@playwright/test';

import { gotoApp, REAL_BARCODE } from './helpers.js';

// Navegación del sidebar entre vistas y escaneo de código de barras en el buscador,
// contra backend real (seed-demo).
test.beforeEach(async ({ page }) => {
  await gotoApp(page);
});

test('la navegación del sidebar muestra cada vista', async ({ page }) => {
  await page.getByTestId('nav-tickets').click();
  await expect(page.getByTestId('tickets-view')).toBeVisible();

  await page.getByTestId('nav-orders').click();
  await expect(page.getByTestId('store-order-receive')).toBeVisible();

  await page.getByTestId('nav-inventory').click();
  await expect(page.getByTestId('inventory-view')).toBeVisible();

  await page.getByTestId('nav-cash').click();
  await expect(page.getByTestId('cash-panel')).toBeVisible();
  await expect(page.getByTestId('cash-status')).toContainText('Caja abierta');

  await page.getByTestId('nav-clock').click();
  await expect(page.locator('.time-clock-view')).toBeVisible();

  await page.getByTestId('nav-sale').click();
  await expect(page.getByTestId('sale-grid')).toBeVisible();
});

test('escanear un código real añade el producto y limpia el campo', async ({ page }) => {
  // Carrito vacío de partida.
  await expect(page.getByTestId('cart-empty')).toBeVisible();

  // La pistola teclea el código en el buscador (con foco por defecto) y Enter.
  const search = page.getByTestId('sale-search');
  await search.fill(REAL_BARCODE);
  await search.press('Enter');

  // Banner de confirmación, línea añadida y campo limpio para el siguiente escaneo.
  await expect(page.getByTestId('scan-banner')).toBeVisible();
  await expect(page.getByTestId('cart-line')).toHaveCount(1);
  await expect(search).toHaveValue('');
});

test('un código inexistente avisa sin añadir nada al carrito', async ({ page }) => {
  await expect(page.getByTestId('cart-empty')).toBeVisible();

  const search = page.getByTestId('sale-search');
  await search.fill('0000000000000'); // dígitos, pero sin producto asociado
  await search.press('Enter');

  await expect(page.getByTestId('scan-banner')).toContainText('sin producto');
  await expect(page.getByTestId('cart-empty')).toBeVisible(); // no añade nada
});
