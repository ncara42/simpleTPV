import { expect, test } from '@playwright/test';

import { addProducts, gotoApp } from './helpers.js';

// Cobro contra backend real (seed-demo). El carrito arranca VACÍO (sin precarga
// demo): cada test lo construye añadiendo productos. Parte autenticado vía
// storageState; la caja del seed está abierta → cobrar habilitado.
test.beforeEach(async ({ page }) => {
  await gotoApp(page);
});

test('construir carrito y cobrar en efectivo', async ({ page }) => {
  await addProducts(page, 2);
  await expect(page.getByTestId('cart-total')).toContainText(/\d/);

  // Caja abierta → cobrar habilitado.
  await expect(page.getByTestId('cart-checkout')).toBeEnabled();
  await page.getByTestId('cart-checkout').click();
  await expect(page.getByTestId('payment-modal')).toBeVisible();

  await page.getByTestId('pay-cash').click();
  await page.getByTestId('cash-given').fill('200'); // cubre el total con holgura
  await page.getByTestId('pay-confirm').click();

  await expect(page.getByTestId('sale-success-banner')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('sale-success-banner')).toContainText('Venta registrada');
  await expect(page.getByTestId('cart-empty')).toBeVisible();
});

test('"Vaciar" deja el ticket vacío', async ({ page }) => {
  await addProducts(page, 1);
  await page.getByTestId('cart-clear').click();
  await expect(page.getByTestId('cart-empty')).toBeVisible();
});

test('descuento manual por importe fijo en una línea: se muestra y se puede quitar', async ({
  page,
}) => {
  await addProducts(page, 1);
  const totalBefore = await page.getByTestId('cart-total').textContent();

  // Abre el modal de descuento (modo línea por defecto, primera línea seleccionada).
  await page.getByTestId('cart-discount').click();
  await expect(page.getByTestId('discount-modal')).toBeVisible();

  // Aplica 5 € de descuento fijo a la línea.
  await page.getByTestId('disc-line-amt').click();
  await page.getByTestId('disc-line-value').fill('5');
  await page.getByTestId('disc-apply').click();

  // El modal se cierra y el descuento se refleja en carrito.
  await expect(page.getByTestId('discount-modal')).toHaveCount(0);
  await expect(page.getByTestId('cart-discount-total')).toContainText('5,00');
  await expect(page.getByTestId('cart-line-discount')).toContainText('5,00');

  // "Quitar" deshace el descuento y restaura el total.
  await page.getByTestId('cart-discount-clear').click();
  await expect(page.getByTestId('cart-discount-total')).toHaveCount(0);
  await expect(page.getByTestId('cart-total')).toHaveText(totalBefore ?? '');
});
