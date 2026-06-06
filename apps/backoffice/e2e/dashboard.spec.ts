import { expect, test } from '@playwright/test';

// Modo demo: dashboard con KPIs hardcodeados, sin API.
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('login-email').fill('admin@org1.test');
  await page.getByTestId('login-password').fill('demo');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 10000 });
});

test('muestra las 7 KPI cards y el selector de periodo', async ({ page }) => {
  await expect(page.getByTestId('dash-cards')).toBeVisible();
  for (const id of [
    'kpi-today',
    'kpi-avg-ticket',
    'kpi-upt',
    'kpi-margin',
    'kpi-profit',
    'kpi-discount',
    'kpi-return',
  ]) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  await expect(page.getByTestId('kpi-today')).toContainText('1284');
  // Beneficio (STAT-03): la card muestra el realMargin en € (500).
  await expect(page.getByTestId('kpi-profit')).toContainText('500');
  await expect(page.getByTestId('dash-period')).toBeVisible();
});

test('los paneles de gráficas y roturas se renderizan', async ({ page }) => {
  await expect(page.getByTestId('dash-bars')).toBeVisible();
  await expect(page.getByTestId('dash-family')).toBeVisible();
  await expect(page.getByTestId('dash-stockout')).toBeVisible();
  await expect(page.getByTestId('dash-rankings')).toBeVisible();
  // Estadística avanzada: ventas por hora (IT-10), descuento por empleado (IT-11)
  // y rotación de producto (IT-12).
  await expect(page.getByTestId('dash-hour')).toBeVisible();
  await expect(page.getByTestId('dash-discount-emp')).toBeVisible();
  await expect(page.getByTestId('dash-rotation')).toBeVisible();
  // Rotación por arquetipo por defecto (IT-13) con conmutador a producto.
  await expect(page.getByTestId('rotation-by-archetype')).toHaveAttribute('aria-selected', 'true');
  await page.getByTestId('rotation-by-product').click();
  await expect(page.getByTestId('rotation-by-product')).toHaveAttribute('aria-selected', 'true');
});
