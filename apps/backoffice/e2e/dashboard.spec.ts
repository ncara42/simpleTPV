import { expect, test } from '@playwright/test';

import { gotoApp } from './helpers.js';

// Dashboard contra backend real (seed-demo). Los KPIs se calculan en vivo, así que
// las aserciones son estructurales (cards visibles, valores no vacíos) en vez de
// cifras exactas de fixture. Parte autenticada vía storageState (auth.setup.ts).
// Desde I-15 el dashboard se organiza en 4 presets (D-08); cada test fija primero
// el preset que necesita (la preferencia persiste entre tests y ejecuciones).
test.beforeEach(async ({ page }) => {
  await gotoApp(page);
});

test('preset Ventas (default): sus 3 KPI cards y sus paneles (I-15, D-08d)', async ({ page }) => {
  await page.getByTestId('dash-preset-ventas').click();
  await expect(page.getByTestId('dash-cards')).toBeVisible();
  for (const id of ['kpi-today', 'kpi-avg-ticket', 'kpi-upt']) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  // El preset cambia el dashboard COMPLETO: las cards de Beneficio no están.
  await expect(page.getByTestId('kpi-margin')).toHaveCount(0);
  // Valores en vivo: no vacíos (contienen algún dígito), sin asumir cifras exactas.
  await expect(page.getByTestId('kpi-today')).toContainText(/\d/);
  await expect(page.getByTestId('dash-period')).toBeVisible();
  // Paneles del preset: ventas hoy vs ayer · por hora · por familia · top ventas.
  for (const id of ['dash-bars', 'dash-hour', 'dash-family', 'dash-rankings']) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  await expect(page.getByTestId('rank-tabs')).toContainText('Top ventas');
  await expect(page.getByTestId('dash-stockout')).toHaveCount(0);
});

test('cambiar de preset cambia KPIs y paneles en 1 clic y se recuerda (I-15)', async ({ page }) => {
  // Beneficio: 4 cards de margen y el ranking arranca en Top margen.
  await page.getByTestId('dash-preset-beneficio').click();
  for (const id of ['kpi-margin', 'kpi-profit', 'kpi-discount', 'kpi-return']) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  await expect(page.getByTestId('kpi-today')).toHaveCount(0);
  await expect(page.getByTestId('rank-tabs')).toContainText('Top margen');
  await expect(page.getByTestId('dash-discount-emp')).toBeVisible();
  // I-16: comparativa de proveedores con el mejor precio marcado (seed con tarifas).
  await expect(page.getByTestId('dash-suppliers')).toBeVisible();
  await expect(
    page.locator('[data-testid="dash-suppliers"] .sp-price-chip.is-best').first(),
  ).toBeVisible();
  // Persiste tras recargar (preferencia dashboard.layout en /me/preferences).
  await page.reload();
  await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('dash-preset-beneficio')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('kpi-margin')).toBeVisible();
  // Restaurar el default para no condicionar otros tests.
  await page.getByTestId('dash-preset-ventas').click();
  await expect(page.getByTestId('kpi-today')).toBeVisible();
});

test('preset Inventario: roturas, rotación y peor rotación; Equipo: vendedores y fichajes (I-15)', async ({
  page,
}) => {
  await page.getByTestId('dash-preset-inventario').click();
  await expect(page.getByTestId('kpi-lost-sales')).toBeVisible();
  await expect(page.getByTestId('dash-stockout')).toBeVisible();
  await expect(page.getByTestId('dash-rotation')).toBeVisible();
  await expect(page.getByTestId('rank-tabs')).toContainText('Peor rotación');
  // I-16: lotes por caducar y pedidos de compra pendientes, con datos del seed.
  await expect(page.getByTestId('dash-expiring-row').first()).toBeVisible();
  await expect(page.getByTestId('dash-po-row').first()).toBeVisible();
  // Rotación por arquetipo por defecto (IT-13) con conmutador a producto.
  await expect(page.getByTestId('rotation-by-archetype')).toHaveAttribute('aria-selected', 'true');
  await page.getByTestId('rotation-by-product').click();
  await expect(page.getByTestId('rotation-by-product')).toHaveAttribute('aria-selected', 'true');

  await page.getByTestId('dash-preset-equipo').click();
  // Equipo no define tarjetas KPI (D-08): solo paneles.
  await expect(page.getByTestId('dash-cards')).toHaveCount(0);
  await expect(page.getByTestId('dash-sales-emp')).toBeVisible();
  await expect(page.getByTestId('dash-discount-emp')).toBeVisible();
  await expect(page.getByTestId('dash-timeclock')).toBeVisible();
  // El seed tiene ventas: el panel de vendedores trae al menos una fila con cifra.
  await expect(page.getByTestId('dash-sales-emp')).toContainText(/\d/);

  // I-16: los paneles enlazan a su page de gestión.
  await page.getByTestId('dash-preset-inventario').click();
  await page.getByTestId('dash-po-link').click();
  await expect(page.getByTestId('suppliers-page')).toBeVisible();
  // Volver y restaurar el preset por defecto.
  await page.getByTestId('nav-dashboard').click();
  await page.getByTestId('dash-preset-ventas').click();
  await expect(page.getByTestId('kpi-today')).toBeVisible();
});

test('D-18 (U-03): no hay personalización manual — el preset dicta la composición', async ({
  page,
}) => {
  await expect(page.getByTestId('dashboard')).toBeVisible();
  // El botón Personalizar y su editor ya no existen.
  await expect(page.getByTestId('dash-customize')).toHaveCount(0);
  await expect(page.getByTestId('dash-cards-editor')).toHaveCount(0);
  // Cada preset pinta SIEMPRE sus paneles completos.
  await page.getByTestId('dash-preset-equipo').click();
  await expect(page.getByTestId('dash-discount-emp')).toBeVisible();
  await expect(page.getByTestId('dash-sales-emp')).toBeVisible();
  await page.getByTestId('dash-preset-ventas').click();
});

test('Ventas es page propia: el dashboard no embebe la tabla y enlaza al final (I-17, D-06)', async ({
  page,
}) => {
  // El dashboard ya no contiene el historial de ventas (E-10: scroll eterno).
  await expect(page.getByTestId('dashboard')).toBeVisible();
  await expect(page.getByTestId('sales-table')).toHaveCount(0);
  // El pie enlaza a la page de Ventas con su DataTable completo.
  await page.getByTestId('dash-to-sales').click();
  await expect(page.getByTestId('sales-table')).toBeVisible();
  await expect(page.getByTestId('sales-totals')).toBeVisible();
});

test('U-02: el toggle barras ↔ línea cambia los gráficos y persiste', async ({ page }) => {
  await page.getByTestId('dash-preset-ventas').click();
  await expect(page.getByTestId('dash-hour')).toBeVisible();
  // Por defecto, barras.
  await expect(page.getByTestId('dash-hour').locator('.ui-chart-bar').first()).toBeVisible();
  // Cambiar a línea: aparece la polyline y desaparecen las barras.
  await page.getByTestId('dash-chart-kind-line').click();
  await expect(page.getByTestId('dash-hour').locator('.ui-chart-line-path')).toBeVisible();
  await expect(page.getByTestId('dash-hour').locator('.ui-chart-bar')).toHaveCount(0);
  // Persiste tras recargar (preferencia en /me/preferences).
  await page.reload();
  await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('dash-hour').locator('.ui-chart-line-path')).toBeVisible();
  // Restaura a barras para no dejar la preferencia sucia entre tests.
  await page.getByTestId('dash-chart-kind-bars').click();
  await expect(page.getByTestId('dash-hour').locator('.ui-chart-bar').first()).toBeVisible();
});

test('el toggle de gráfico y el desplegable de comparación viven dentro de la card de Ventas', async ({
  page,
}) => {
  await page.getByTestId('dash-preset-ventas').click();
  const bars = page.getByTestId('dash-bars');
  await expect(bars).toBeVisible();
  // El toggle barras/línea ya no está en la cabecera global: vive en la card.
  await expect(bars.getByTestId('dash-chart-kind')).toBeVisible();
  // Desplegable de comparación: por defecto "Hoy vs ayer".
  const compare = bars.getByTestId('dash-compare');
  await expect(compare).toBeVisible();
  await expect(compare).toContainText('Hoy vs ayer');

  // Cambiar a comparación por mes: el desplegable refleja la nueva selección
  // (mes actual vs anterior) y deja de decir Hoy.
  const MONTHS = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ];
  const currentMonth = MONTHS[new Date().getMonth()]!;
  await compare.click();
  await page.locator('[role="option"][data-value="month"]').click();
  await expect(compare).toContainText(currentMonth);
  await expect(compare).not.toContainText('Hoy');

  // Restaura a día para no afectar a otros tests/ejecuciones.
  await compare.click();
  await page.locator('[role="option"][data-value="day"]').click();
  await expect(compare).toContainText('Hoy vs ayer');
});

test('Ventas por familia: paginado de 5 en 5 con flechas y buscador', async ({ page }) => {
  await page.getByTestId('dash-preset-ventas').click();
  const fam = page.getByTestId('dash-family');
  await expect(fam).toBeVisible();
  // Como mucho 5 familias por página (el seed-demo tiene bastantes más).
  await expect(fam.locator('.dash-family-list li')).toHaveCount(5);
  // Indicador de página y avance/retroceso con las flechas.
  await expect(fam.getByTestId('dash-family-page')).toContainText('1/');
  await fam.getByTestId('dash-family-next').click();
  await expect(fam.getByTestId('dash-family-page')).toContainText('2/');
  await fam.getByTestId('dash-family-prev').click();
  await expect(fam.getByTestId('dash-family-page')).toContainText('1/');
  // Buscador: sin coincidencias → estado vacío; al limpiar, vuelve a 5 filas.
  await fam.getByTestId('dash-family-search').fill('zzz-no-existe');
  await expect(fam.locator('.catalog-empty')).toBeVisible();
  await fam.getByTestId('dash-family-search').fill('');
  await expect(fam.locator('.dash-family-list li')).toHaveCount(5);
});

test('preferencias por defecto: el dashboard recuerda el periodo elegido (IT-16)', async ({
  page,
}) => {
  // Espera a que carguen los KPIs antes de tocar el selector: si llega data a media
  // interacción, un re-render cierra el desplegable y la selección se pierde.
  await page.getByTestId('dash-preset-ventas').click();
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
