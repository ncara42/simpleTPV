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

test('tras login se ven los productos demo', async ({ page }) => {
  await login(page);
  await expect(page.getByTestId('sale-grid')).toBeVisible({ timeout: 10000 });
  // 12 productos demo.
  expect(await page.getByTestId('prod-card').count()).toBe(12);
});

test('la búsqueda en vivo filtra los productos (debounce)', async ({ page }) => {
  await login(page);
  await page.getByTestId('sale-grid').waitFor({ timeout: 10000 });
  const total = await page.getByTestId('prod-card').count();

  await page.getByTestId('sale-search').fill('CBD');
  await page.waitForTimeout(400); // > debounce 200ms
  const filtered = await page.getByTestId('prod-card').count();

  expect(filtered).toBeGreaterThan(0);
  expect(filtered).toBeLessThan(total);
  const names = await page.getByTestId('prod-card').locator('.prod-name').allTextContents();
  expect(names.every((n) => /cbd/i.test(n))).toBe(true);
});

test('el chip "Todas" muestra el total demo (88)', async ({ page }) => {
  await login(page);
  await expect(page.getByTestId('fam-chip-all')).toContainText('88');
});

test('los productos agotados muestran "0", se atenúan y van al final', async ({ page }) => {
  await login(page);
  await page.getByTestId('sale-grid').waitFor({ timeout: 10000 });
  // Ya no se muestra el texto "Sin stock".
  await expect(page.getByText('Sin stock')).toHaveCount(0);
  // "Vapeador Pro" (stock 0) muestra "0", queda atenuado (.is-out) pero NO
  // deshabilitado: la venta nunca se bloquea por falta de stock.
  const agotado = page.getByTestId('prod-card').filter({ hasText: 'Vapeador Pro' });
  await expect(agotado.getByTestId('prod-stock')).toHaveText('0');
  await expect(agotado).toHaveClass(/is-out/);
  await expect(agotado).not.toBeDisabled();
  // Los agotados se ordenan al final: la última tarjeta de la cuadrícula está atenuada.
  await expect(page.getByTestId('prod-card').last()).toHaveClass(/is-out/);
});

test('familia con subfamilias → desplegable → producto', async ({ page }) => {
  await login(page);
  await page.getByTestId('sale-grid').waitFor({ timeout: 10000 });
  const families = page.getByTestId('sale-families');

  // "Aceites" tiene subfamilias → es un desplegable. Abrirlo y elegir
  // "Todo · Aceites" filtra a sus 3 productos (todo el subárbol).
  await families.getByRole('button', { name: 'Familia Aceites' }).click();
  await page.getByRole('option', { name: 'Todo · Aceites' }).click();
  await expect(page.getByTestId('prod-card')).toHaveCount(3);

  // Reabrir y elegir la subfamilia "CBD 10%": filtra a su único producto.
  await families.getByRole('button', { name: 'Familia Aceites' }).click();
  await page.getByRole('option', { name: 'CBD 10%' }).click();
  await expect(page.getByTestId('prod-card')).toHaveCount(1);
  await expect(page.getByTestId('prod-card')).toContainText('Aceite CBD 10%');

  // "Todas" vuelve a todos los productos.
  await families.getByTestId('fam-chip-all').click();
  await expect(page.getByTestId('prod-card')).toHaveCount(12);
});
