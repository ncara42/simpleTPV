import { expect, test } from '@playwright/test';

// Flujo de búsqueda en el TPV contra la API real (proxy /api → :3001) con el seed.
// Requiere: API local en :3001, BD con seed (org1: admin@org1.test / password123,
// 5 productos incluyendo "Flor CBD 20%", "Aceite CBD 5%", "Té CBD").

async function login(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('login-email').fill('admin@org1.test');
  await page.getByTestId('login-password').fill('password123');
  await page.getByTestId('login-submit').click();
  await page.getByTestId('sale-search').waitFor({ timeout: 10000 });
}

test('tras login se ve la pantalla de venta con productos del tenant', async ({ page }) => {
  await login(page);
  await expect(page.getByTestId('sale-grid')).toBeVisible({ timeout: 10000 });
  const cards = page.getByTestId('prod-card');
  expect(await cards.count()).toBeGreaterThan(0);
});

test('la búsqueda en vivo filtra los productos (debounce)', async ({ page }) => {
  await login(page);
  await page.getByTestId('sale-grid').waitFor({ timeout: 10000 });
  const total = await page.getByTestId('prod-card').count();

  // Buscar un término que solo matchee algunos productos del seed.
  await page.getByTestId('sale-search').fill('CBD');
  await page.waitForTimeout(500); // > debounce 200ms + red
  const filtered = await page.getByTestId('prod-card').count();

  expect(filtered).toBeGreaterThan(0);
  expect(filtered).toBeLessThanOrEqual(total);
  // Todos los visibles contienen "CBD"
  const names = await page.getByTestId('prod-card').locator('.prod-name').allTextContents();
  expect(names.every((n) => /cbd/i.test(n))).toBe(true);
});

test('la barra de familias incluye el chip "Todas"', async ({ page }) => {
  await login(page);
  await expect(page.getByTestId('fam-chip-all')).toBeVisible();
});
