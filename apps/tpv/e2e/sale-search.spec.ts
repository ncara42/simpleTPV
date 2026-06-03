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

test('el producto agotado muestra el badge "Agotado"', async ({ page }) => {
  await login(page);
  await page.getByTestId('sale-grid').waitFor({ timeout: 10000 });
  await expect(page.getByText('Agotado')).toBeVisible();
});

test('navegación Familia → Subfamilia → Producto', async ({ page }) => {
  await login(page);
  await page.getByTestId('sale-grid').waitFor({ timeout: 10000 });
  const families = page.getByTestId('sale-families');

  // Entrar en "Aceites" (tiene subfamilias): muestra sus 3 productos (subárbol)
  // y revela las subfamilias + "Volver".
  await families.getByText('Aceites', { exact: false }).click();
  await expect(page.getByTestId('fam-back')).toBeVisible();
  await expect(page.getByTestId('fam-chip-parent')).toContainText('Aceites');
  await expect(page.getByTestId('prod-card')).toHaveCount(3);

  // Elegir la subfamilia "CBD 10%": filtra a su único producto.
  await families.getByText('CBD 10%', { exact: false }).click();
  await expect(page.getByTestId('prod-card')).toHaveCount(1);
  await expect(page.getByTestId('prod-card')).toContainText('Aceite CBD 10%');

  // "Volver" regresa al nivel de familias raíz (todos los productos).
  await page.getByTestId('fam-back').click();
  await expect(page.getByTestId('fam-chip-all')).toBeVisible();
  await expect(page.getByTestId('prod-card')).toHaveCount(12);
});
