import { expect, test } from '@playwright/test';

import { gotoApp } from './helpers.js';

// Búsqueda y cuadrícula de productos contra backend real (seed-demo). Conteos
// tolerantes (el catálogo del seed no es el de los fixtures demo).
test.beforeEach(async ({ page }) => {
  await gotoApp(page);
});

test('tras login se ven los productos del seed', async ({ page }) => {
  await expect(page.getByTestId('sale-grid')).toBeVisible();
  expect(await page.getByTestId('prod-card').count()).toBeGreaterThan(0);
});

test('la búsqueda en vivo filtra los productos (debounce)', async ({ page }) => {
  const total = await page.getByTestId('prod-card').count();
  await page.getByTestId('sale-search').fill('CBD');
  await page.waitForTimeout(400); // > debounce 200ms
  const filtered = await page.getByTestId('prod-card').count();
  expect(filtered).toBeGreaterThan(0);
  expect(filtered).toBeLessThanOrEqual(total);
  const names = await page.getByTestId('prod-card').locator('.prod-name').allTextContents();
  expect(names.every((n) => /cbd/i.test(n))).toBe(true);
});

test('el chip "Todas" está presente para ver todo el catálogo', async ({ page }) => {
  await expect(page.getByTestId('fam-chip-all')).toContainText('Todas');
});

test('los productos agotados muestran "0", se atenúan y van al final', async ({ page }) => {
  // Ya no se muestra el texto "Sin stock".
  await expect(page.getByText('Sin stock')).toHaveCount(0);
  // Hay al menos un producto agotado en el seed (Flor CBD Gorilla 15%, stock 0):
  // muestra "0", queda atenuado (.is-out) pero NO deshabilitado (la venta nunca se
  // bloquea por falta de stock).
  const out = page.locator('[data-testid="prod-card"].is-out').first();
  await expect(out).toBeVisible();
  await expect(out.getByTestId('prod-stock')).toHaveText('0');
  await expect(out).not.toBeDisabled();
  // Los agotados se ordenan al final: la última tarjeta está atenuada.
  await expect(page.getByTestId('prod-card').last()).toHaveClass(/is-out/);
});

test('filtrar por una familia reduce los productos y "Todas" los restaura', async ({ page }) => {
  const total = await page.getByTestId('prod-card').count();
  // "Accesorios" no tiene subfamilias → es un chip directo (las familias con
  // subfamilias se prueban como desplegable en los unit de FamilyChips).
  await page.getByTestId('fam-chip').filter({ hasText: 'Accesorios' }).click();
  // Espera a que la cuadrícula se re-renderice con la familia filtrada (evita la
  // carrera de leer .count() antes del re-render).
  await expect.poll(() => page.getByTestId('prod-card').count()).toBeLessThan(total);
  expect(await page.getByTestId('prod-card').count()).toBeGreaterThan(0);
  // "Todas" vuelve a todos los productos.
  await page.getByTestId('fam-chip-all').click();
  await expect(page.getByTestId('prod-card')).toHaveCount(total);
});
