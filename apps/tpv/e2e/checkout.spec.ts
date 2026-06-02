import { expect, test } from '@playwright/test';

async function login(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('login-email').fill('marta@centro.demo');
  await page.getByTestId('login-password').fill('demo');
  await page.getByTestId('login-submit').click();
  await page.getByTestId('sale-search').waitFor({ timeout: 10000 });
}

test('el ticket precargado muestra total 73,80 € y permite cobrar', async ({ page }) => {
  await login(page);
  await page.getByTestId('sale-grid').waitFor({ timeout: 10000 });

  // Carrito precargado con 3 líneas demo.
  await expect(page.getByTestId('cart-line')).toHaveCount(3);
  await expect(page.getByTestId('cart-total')).toContainText('73,80');

  // Caja abierta → cobrar habilitado.
  await expect(page.getByTestId('cart-checkout')).toBeEnabled();
  await page.getByTestId('cart-checkout').click();
  await expect(page.getByTestId('payment-modal')).toBeVisible();

  await page.getByTestId('pay-cash').click();
  await page.getByTestId('cash-given').fill('80');
  await page.getByTestId('pay-confirm').click();

  await expect(page.getByTestId('sale-confirmation')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('ticket-view')).toBeVisible({ timeout: 10000 });

  await page.getByTestId('new-sale').click();
  await expect(page.getByTestId('cart-empty')).toBeVisible();
});

test('"Vaciar" deja el ticket vacío', async ({ page }) => {
  await login(page);
  await page.getByTestId('cart-line').first().waitFor({ timeout: 10000 });
  await page.getByTestId('cart-clear').click();
  await expect(page.getByTestId('cart-empty')).toBeVisible();
});
