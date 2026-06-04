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

test('muestra las 6 KPI cards y el selector de periodo', async ({ page }) => {
  await expect(page.getByTestId('dash-cards')).toBeVisible();
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
  await expect(page.getByTestId('kpi-today')).toContainText('1284');
  await expect(page.getByTestId('dash-period')).toBeVisible();
});

test('los paneles de gráficas y roturas se renderizan', async ({ page }) => {
  await expect(page.getByTestId('dash-bars')).toBeVisible();
  await expect(page.getByTestId('dash-family')).toBeVisible();
  await expect(page.getByTestId('dash-stockout')).toBeVisible();
  await expect(page.getByTestId('dash-rankings')).toBeVisible();
});
