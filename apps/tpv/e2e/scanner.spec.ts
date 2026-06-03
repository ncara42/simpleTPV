import { expect, test } from '@playwright/test';

// Cubre la navegación del sidebar entre las vistas calcadas y el escaneo de
// código de barras en el buscador (algunos productos demo llevan barcode).
async function login(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('login-email').fill('marta@centro.demo');
  await page.getByTestId('login-password').fill('demo');
  await page.getByTestId('login-submit').click();
  await page.getByTestId('sale-search').waitFor({ timeout: 10000 });
}

test('la navegación del sidebar muestra cada vista calcada', async ({ page }) => {
  await login(page);

  await page.getByTestId('nav-return').click();
  await expect(page.getByTestId('return-empty')).toBeVisible();
  await expect(page.getByText('Busca el ticket original')).toBeVisible();

  await page.getByTestId('nav-transfers').click();
  await expect(page.getByTestId('transfer-list')).toBeVisible();
  await expect(page.getByTestId('transfer-item')).toHaveCount(2);

  await page.getByTestId('nav-cash').click();
  await expect(page.getByTestId('cash-view')).toBeVisible();
  await expect(page.getByTestId('cash-state')).toContainText('Abierta');

  await page.getByTestId('nav-sale').click();
  await expect(page.getByTestId('sale-grid')).toBeVisible();
});

test('escanear un código en el buscador añade el producto y limpia el campo', async ({ page }) => {
  await login(page);
  await page.getByTestId('sale-grid').waitFor({ timeout: 10000 });
  // Carrito demo: 3 líneas (no incluye "Vapeador Pro").
  await expect(page.getByTestId('cart-line')).toHaveCount(3);

  // La pistola teclea el código en el buscador (con foco por defecto) y Enter.
  const search = page.getByTestId('sale-search');
  await search.fill('8400000000031'); // barcode de Vapeador Pro
  await search.press('Enter');

  // Banner de confirmación con el producto, línea añadida y campo limpio para el
  // siguiente escaneo (sin que el código se quede tecleado en el buscador).
  await expect(page.getByTestId('scan-banner')).toContainText('Vapeador Pro');
  await expect(page.getByTestId('cart-line')).toHaveCount(4);
  await expect(search).toHaveValue('');
});

test('un código inexistente avisa sin añadir nada al carrito', async ({ page }) => {
  await login(page);
  await page.getByTestId('sale-grid').waitFor({ timeout: 10000 });
  await expect(page.getByTestId('cart-line')).toHaveCount(3);

  const search = page.getByTestId('sale-search');
  await search.fill('0000000000000'); // dígitos, pero sin producto asociado
  await search.press('Enter');

  await expect(page.getByTestId('scan-banner')).toContainText('sin producto');
  await expect(page.getByTestId('cart-line')).toHaveCount(3); // no añade nada
});
