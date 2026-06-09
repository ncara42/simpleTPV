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

test('los productos agotados se atenúan, muestran su stock y van al final', async ({ page }) => {
  // Ya no se muestra el texto "Sin stock".
  await expect(page.getByText('Sin stock')).toHaveCount(0);
  // Hay al menos un producto agotado en el seed (Flor CBD Gorilla 15%, stock 0):
  // queda atenuado (.is-out) pero NO deshabilitado (la venta nunca se bloquea por
  // falta de stock).
  const out = page.locator('[data-testid="prod-card"].is-out').first();
  await expect(out).toBeVisible();
  // Stock 0 (o negativo si otros tests vendieron sin bloquear por falta de stock).
  const stock = Number((await out.getByTestId('prod-stock').textContent())?.trim());
  expect(stock).toBeLessThanOrEqual(0);
  await expect(out).not.toBeDisabled();
  // Los agotados se ordenan al final: la última tarjeta está atenuada.
  await expect(page.getByTestId('prod-card').last()).toHaveClass(/is-out/);
});

test('filtrar por una familia reduce los productos y "Todas" los restaura', async ({ page }) => {
  // Espera a que la cuadrícula cargue antes de medir el total (React renderiza la
  // lista completa de una vez al resolver la query, no incrementalmente).
  await expect(page.getByTestId('prod-card').first()).toBeVisible();
  const total = await page.getByTestId('prod-card').count();
  // "Accesorios" no tiene subfamilias → es un chip directo (las familias con
  // subfamilias se prueban como desplegable en los unit de FamilyChips).
  await page.getByTestId('fam-chip').filter({ hasText: 'Accesorios' }).click();
  // Espera a que el filtro se ASIENTE (no vacío y menor que el total); evita el
  // transitorio en que la cuadrícula se vacía un instante durante el re-render.
  await expect
    .poll(async () => {
      const c = await page.getByTestId('prod-card').count();
      return c > 0 && c < total;
    })
    .toBe(true);
  // "Todas" vuelve a todos los productos.
  await page.getByTestId('fam-chip-all').click();
  await expect(page.getByTestId('prod-card')).toHaveCount(total);
});
