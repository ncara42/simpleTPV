import { expect, test } from '@playwright/test';

import { gotoApp, REAL_BARCODE } from './helpers.js';

// Red de seguridad del flujo de cliente crítico contra backend real: escanear un
// producto → carrito → cobro en efectivo → confirmación → carrito vacío. Cualquier
// regresión que rompa la venta de extremo a extremo se detecta en el gate.
test('flujo completo: escanear producto → carrito → cobro efectivo → confirmación', async ({
  page,
}) => {
  await gotoApp(page);

  // La pistola escanea un producto real del seed: se añade al carrito y el campo
  // se limpia para el siguiente escaneo.
  const search = page.getByTestId('sale-search');
  await search.fill(REAL_BARCODE);
  await search.press('Enter');
  await expect(page.getByTestId('scan-banner')).toBeVisible();
  await expect(page.getByTestId('cart-line')).toHaveCount(1);
  await expect(search).toHaveValue('');

  // Cobro en efectivo (caja abierta → checkout habilitado).
  await expect(page.getByTestId('cart-checkout')).toBeEnabled();
  await page.getByTestId('cart-checkout').click();
  await expect(page.getByTestId('payment-modal')).toBeVisible();
  await page.getByTestId('pay-cash').click();
  await page.getByTestId('cash-given').fill('200');
  await page.getByTestId('pay-confirm').click();

  // Confirmación de venta y carrito vacío.
  await expect(page.getByTestId('sale-success-banner')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('sale-success-banner')).toContainText('Venta registrada');
  await expect(page.getByTestId('cart-empty')).toBeVisible();
});
