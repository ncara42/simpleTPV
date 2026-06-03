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

test('descuento manual por importe fijo en una línea: se muestra y se puede quitar', async ({
  page,
}) => {
  await login(page);
  await page.getByTestId('cart-line').first().waitFor({ timeout: 10000 });
  // Carrito demo: 3 líneas, total 73,80 € (primera línea 24,90 €).
  await expect(page.getByTestId('cart-total')).toContainText('73,80');

  // Abre el modal de descuento (modo línea por defecto, primera línea seleccionada).
  await page.getByTestId('cart-discount').click();
  await expect(page.getByTestId('discount-modal')).toBeVisible();

  // Aplica 5 € de descuento fijo a la línea.
  await page.getByTestId('disc-line-amt').click();
  await page.getByTestId('disc-line-value').fill('5');
  await page.getByTestId('disc-apply').click();

  // El modal se cierra y el descuento se refleja en carrito y total.
  await expect(page.getByTestId('discount-modal')).toHaveCount(0);
  await expect(page.getByTestId('cart-discount-total')).toContainText('5,00');
  await expect(page.getByTestId('cart-line-discount')).toContainText('5,00');
  // Precio bruto tachado de la línea (24,90 €) y total recalculado (68,80 €).
  await expect(page.getByTestId('cart-line-gross').first()).toContainText('24,90');
  await expect(page.getByTestId('cart-total')).toContainText('68,80');

  // "Quitar" deshace el descuento y restaura el total.
  await page.getByTestId('cart-discount-clear').click();
  await expect(page.getByTestId('cart-discount-total')).toHaveCount(0);
  await expect(page.getByTestId('cart-total')).toContainText('73,80');
});
