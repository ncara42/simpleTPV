import { expect, test } from '@playwright/test';

import { gotoApp } from './helpers.js';

// Dashboard contra backend real (seed-demo). Los KPIs se calculan en vivo, así que
// las aserciones son estructurales (cards visibles, valores no vacíos) en vez de
// cifras exactas de fixture. Parte autenticada vía storageState (auth.setup.ts).
test.beforeEach(async ({ page }) => {
  await gotoApp(page);
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
  // Valores en vivo: no vacíos (contienen algún dígito), sin asumir cifras exactas.
  await expect(page.getByTestId('kpi-today')).toContainText(/\d/);
  await expect(page.getByTestId('kpi-profit')).toContainText(/\d/);
  await expect(page.getByTestId('dash-period')).toBeVisible();
});

test('personalización: ocultar una KPI card la quita y persiste (IT-16)', async ({ page }) => {
  await expect(page.getByTestId('kpi-upt')).toBeVisible();
  await page.getByTestId('dash-customize').click();
  await expect(page.getByTestId('dash-cards-editor')).toBeVisible();
  await page.getByTestId('card-toggle-kpi-upt').click();
  await expect(page.getByTestId('kpi-upt')).toBeHidden();
  // Persiste tras recargar (preferencia guardada en /me/preferences).
  await page.reload();
  await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('kpi-upt')).toBeHidden();
  // Restaura para no dejar la preferencia sucia entre tests.
  await page.getByTestId('dash-customize').click();
  await page.getByTestId('card-toggle-kpi-upt').click();
  await expect(page.getByTestId('kpi-upt')).toBeVisible();
});

test('preferencias por defecto: el dashboard recuerda el periodo elegido (IT-16)', async ({
  page,
}) => {
  // Espera a que carguen los KPIs antes de tocar el selector: si llega data a media
  // interacción, un re-render cierra el desplegable y la selección se pierde.
  await expect(page.getByTestId('kpi-today')).toContainText(/\d/);
  // Cambiar a Semana y comprobar que el periodo persiste tras recargar.
  await page.getByTestId('dash-period').click();
  await page.locator('[role="option"][data-value="week"]').click();
  await expect(page.getByTestId('dash-period')).toContainText('Semana');
  await page.reload();
  await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('dash-period')).toContainText('Semana');
  // Volver a Hoy también persiste (no se asume el estado inicial: es una preferencia
  // que otros tests/ejecuciones pueden haber cambiado).
  await page.getByTestId('dash-period').click();
  await page.locator('[role="option"][data-value="today"]').click();
  await expect(page.getByTestId('dash-period')).toContainText('Hoy');
  await page.reload();
  await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('dash-period')).toContainText('Hoy');
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
