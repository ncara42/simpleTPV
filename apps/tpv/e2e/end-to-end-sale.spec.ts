import { expect, test } from '@playwright/test';

// Red de seguridad del flujo de cliente crítico (refactor de deuda técnica):
// hasta ahora login, escaneo y cobro vivían en specs SEPARADOS. Este spec los
// encadena en UN ÚNICO recorrido continuo —login → escanear un producto →
// carrito → cobro en efectivo → confirmación → carrito vacío— para que cualquier
// regresión que rompa la venta de extremo a extremo se detecte en el gate.
// Modo demo: el TPV no llama a la API; el login acepta cualquier credencial y el
// carrito arranca con 3 líneas demo (total 73,80 €).
async function login(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('login-email').fill('marta@centro.demo');
  await page.getByTestId('login-password').fill('demo');
  await page.getByTestId('login-submit').click();
  await page.getByTestId('sale-search').waitFor({ timeout: 10000 });
}

test('flujo completo: login → escanear producto → carrito → cobro efectivo → confirmación', async ({
  page,
}) => {
  // 1. Login → pantalla de venta.
  await login(page);
  await page.getByTestId('sale-grid').waitFor({ timeout: 10000 });

  // 2. Carrito demo precargado (3 líneas, 73,80 €).
  await expect(page.getByTestId('cart-line')).toHaveCount(3);
  await expect(page.getByTestId('cart-total')).toContainText('73,80');

  // 3. La pistola escanea un producto: se añade al carrito y el campo se limpia.
  const search = page.getByTestId('sale-search');
  await search.fill('8400000000031'); // barcode de "Vapeador Pro"
  await search.press('Enter');
  await expect(page.getByTestId('scan-banner')).toContainText('Vapeador Pro');
  await expect(page.getByTestId('cart-line')).toHaveCount(4);
  await expect(search).toHaveValue('');

  // 4. Cobro en efectivo (caja abierta en demo → checkout habilitado).
  await expect(page.getByTestId('cart-checkout')).toBeEnabled();
  await page.getByTestId('cart-checkout').click();
  await expect(page.getByTestId('payment-modal')).toBeVisible();
  await page.getByTestId('pay-cash').click();
  await page.getByTestId('cash-given').fill('200'); // cubre el total con holgura
  await page.getByTestId('pay-confirm').click();

  // 5. Confirmación de venta y carrito vacío.
  await expect(page.getByTestId('sale-success-banner')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('sale-success-banner')).toContainText('Venta registrada');
  await expect(page.getByTestId('cart-empty')).toBeVisible();
});
