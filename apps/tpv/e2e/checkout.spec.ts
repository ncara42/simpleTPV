import { expect, test } from '@playwright/test';

// Flujo completo de cobro contra la API real (proxy /api → :3001) con el seed.
// Requiere: API local en :3001, BD con seed (org1: admin@org1.test / password123,
// productos con precio). Cubre: login → añadir producto → cobrar en efectivo →
// confirmación con nº de ticket → "Nueva venta" deja el carrito vacío.

async function login(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('login-email').fill('admin@org1.test');
  await page.getByTestId('login-password').fill('password123');
  await page.getByTestId('login-submit').click();
  await page.getByTestId('sale-search').waitFor({ timeout: 10000 });
}

test('cobro en efectivo: del carrito a la confirmación con cambio', async ({ page }) => {
  await login(page);
  await page.getByTestId('sale-grid').waitFor({ timeout: 10000 });

  // Añadir un producto al carrito.
  await page.getByTestId('prod-card').first().click();
  await expect(page.getByTestId('cart-line')).toHaveCount(1);

  const totalText = (await page.getByTestId('cart-total').textContent()) ?? '';
  const total = Number(totalText.replace('€', '').replace(',', '.').trim());
  expect(total).toBeGreaterThan(0);

  // Abrir el modal de cobro.
  await page.getByTestId('cart-checkout').click();
  await expect(page.getByTestId('payment-modal')).toBeVisible();

  // Elegir efectivo y meter un importe >= total.
  await page.getByTestId('pay-cash').click();
  const given = Math.ceil(total) + 10;
  await page.getByTestId('cash-given').fill(String(given));

  // El cambio se muestra en vivo.
  await expect(page.getByTestId('cash-change')).toContainText((given - total).toFixed(2));

  // Confirmar el cobro.
  await page.getByTestId('pay-confirm').click();

  // Pantalla de confirmación con el nº de ticket.
  await expect(page.getByTestId('sale-confirmation')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('conf-ticket')).toContainText(/^T\d{2}-\d{6}$/);
  await expect(page.getByTestId('conf-method')).toContainText('Efectivo');
  await expect(page.getByTestId('conf-change')).toBeVisible();

  // "Nueva venta" limpia el carrito y vuelve al estado inicial.
  await page.getByTestId('new-sale').click();
  await expect(page.getByTestId('cart-empty')).toBeVisible();
});
