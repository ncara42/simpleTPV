import { expect, test } from '@playwright/test';

// Dashboard del backoffice (#71). Requiere API en :3001 con seed
// (admin@org1.test / password123) y datos de venta del seed.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('login-email').fill('admin@org1.test');
  await page.getByTestId('login-password').fill('password123');
  await page.getByTestId('login-submit').click();
  // El dashboard es la pestaña por defecto tras login.
  await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 10000 });
});

test('muestra las KPI cards y el selector de periodo', async ({ page }) => {
  await expect(page.getByTestId('dash-cards')).toBeVisible();
  // Las 6 cards de KPI están presentes.
  for (const id of [
    'kpi-today',
    'kpi-avg-ticket',
    'kpi-upt',
    'kpi-margin',
    'kpi-discount',
    'kpi-return',
  ]) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  // Selector de periodo con sus 4 botones.
  await expect(page.getByTestId('dash-period')).toBeVisible();
  await expect(page.getByTestId('dash-period-today')).toBeVisible();
  await expect(page.getByTestId('dash-period-month')).toBeVisible();
});

test('cambiar de periodo recarga los KPIs sin error', async ({ page }) => {
  // El valor de la card de ticket medio antes y después de cambiar a "mes".
  const card = page.getByTestId('kpi-avg-ticket');
  await expect(card).toBeVisible();
  await page.getByTestId('dash-period-month').click();
  // Tras el cambio, la card sigue presente y con contenido (no se rompe el render).
  await expect(card).toBeVisible();
  await expect(card).not.toHaveText('');
});

test('los paneles de gráficas y rankings se renderizan', async ({ page }) => {
  await expect(page.getByTestId('dash-bars')).toBeVisible();
  await expect(page.getByTestId('dash-family')).toBeVisible();
  await expect(page.getByTestId('dash-stockout')).toBeVisible();
  await expect(page.getByTestId('dash-rankings')).toBeVisible();

  // Las tabs de rankings cambian la tabla mostrada.
  await page.getByTestId('rank-margin').click();
  await expect(page.getByTestId('rank-margin')).toHaveClass(/active/);
  await page.getByTestId('rank-rotation').click();
  await expect(page.getByTestId('rank-rotation')).toHaveClass(/active/);
});

test('filtrar por una tienda concreta mantiene el dashboard operativo', async ({ page }) => {
  const select = page.getByTestId('dash-store');
  await expect(select).toBeVisible();
  // Selecciona la primera tienda real (índice 1; el 0 es "Todas las tiendas").
  const options = select.locator('option');
  const count = await options.count();
  if (count > 1) {
    await select.selectOption({ index: 1 });
    // El dashboard sigue mostrando las cards tras filtrar.
    await expect(page.getByTestId('dash-cards')).toBeVisible();
    await expect(page.getByTestId('kpi-today')).toBeVisible();
  }
});
