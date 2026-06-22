import { expect, type Page, test } from '@playwright/test';

// Regresión visual de los paneles v2 (#211): cada RECETA y cada BLOQUE (descubiertos del DOM del
// harness, no de una lista fija), a 4 breakpoints, con datos mock (stub de red). Además los estados
// loading/error/empty de un panel representativo. Corre con `playwright.visual.config.ts` (sin
// backend). Baselines por plataforma → generados/validados en el contenedor oficial de Playwright
// (job `visual` de CI) para que casen pixel a pixel.

// Datos mock por endpoint (allowlist real). Cubren todos los campos que tocan recetas y bloques.
const MOCK: Record<string, unknown> = {
  '/dashboard/sales-kpis': {
    revenue: 84560.09,
    avgTicket: 23.5,
    upt: 2.4,
    discountRate: 0.12,
    returnRate: 0.03,
  },
  '/dashboard/margin-kpis': {
    grossMargin: 12000,
    realMargin: 9000,
    marginPct: 0.42,
    revenue: 84560.09,
  },
  '/dashboard/stockout-kpis': {
    events: 14,
    resolved: 9,
    open: 5,
    rate: 0.08,
    estimatedLostSales: 1234.5,
  },
  '/dashboard/sales-by-employee': [
    { userName: 'Ana', total: 1200, salesCount: 34 },
    { userName: 'Luis', total: 980, salesCount: 28 },
    { userName: 'Marta', total: 760, salesCount: 21 },
    { userName: 'Jon', total: 540, salesCount: 15 },
  ],
  '/dashboard/sales-by-hour': [
    { hour: '09', revenue: 120, count: 8 },
    { hour: '11', revenue: 340, count: 19 },
    { hour: '13', revenue: 520, count: 27 },
    { hour: '17', revenue: 410, count: 22 },
    { hour: '20', revenue: 260, count: 14 },
  ],
  '/dashboard/sales-by-family': [
    { familyName: 'Aceites', total: 3200, color: '#6366f1' },
    { familyName: 'Cremas', total: 2100, color: '#22c55e' },
    { familyName: 'Flores', total: 1400, color: '#f59e0b' },
  ],
  // Con rankBy (sales|margin|rotation) el endpoint proyecta un único array `items` con `value`
  // (#225). Los bloques product-ranking/top-margin/dead-stock lo consumen vía valueField:'value'.
  '/dashboard/product-rankings': {
    items: [
      { name: 'Aceite CBD 10%', value: 1200 },
      { name: 'Crema relax', value: 980 },
      { name: 'Flores premium', value: 760 },
      { name: 'Bálsamo labial', value: 540 },
    ],
  },
  '/dashboard/sales-by-store': [
    {
      storeName: 'Centro',
      revenue: 32000,
      avgTicket: 24.1,
      margin: 9800,
      marginPct: 0.31,
      salesCount: 1320,
    },
    {
      storeName: 'Sur',
      revenue: 21000,
      avgTicket: 21.7,
      margin: 6100,
      marginPct: 0.29,
      salesCount: 980,
    },
    {
      storeName: 'Norte',
      revenue: 15400,
      avgTicket: 19.9,
      margin: 4200,
      marginPct: 0.27,
      salesCount: 760,
    },
  ],
  '/dashboard/discount-by-employee': [
    { userName: 'Ana', avgDiscountPct: 0.14, salesCount: 34 },
    { userName: 'Luis', avgDiscountPct: 0.09, salesCount: 28 },
  ],
  '/stock/alerts': [
    {
      productName: 'Aceite CBD 10%',
      storeName: 'Centro',
      alertType: 'OUT_OF_STOCK',
      severity: 'critical',
    },
    { productName: 'Crema relax', storeName: 'Sur', alertType: 'LOW_STOCK', severity: 'soft' },
  ],
  '/stock/expiring': [
    {
      productName: 'Flores premium',
      lotCode: 'L-22',
      daysToExpiry: 3,
      quantity: '12',
      status: 'expiring',
    },
    {
      productName: 'Crema relax',
      lotCode: 'L-08',
      daysToExpiry: 0,
      quantity: '4',
      status: 'expired',
    },
  ],
  '/products': [
    { name: 'Aceite CBD 10%', price: 24.9 },
    { name: 'Crema relax', price: 15.5 },
    { name: 'Flores premium', price: 39 },
  ],
};

type Mode = 'loaded' | 'empty' | 'error' | 'loading';

// Intercepta /api/** y responde según el modo. 'loading' deja la petición colgada para capturar el
// estado de carga horneado del panel.
async function stubApi(page: Page, mode: Mode): Promise<void> {
  await page.route('**/api/**', async (route) => {
    if (mode === 'loading') return; // request pendiente → estado loading
    if (mode === 'error') return route.fulfill({ status: 500, body: '{"message":"boom"}' });
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    const data = mode === 'empty' ? [] : (MOCK[path] ?? []);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data),
    });
  });
}

const BREAKPOINTS = [320, 768, 1024, 1440] as const;

// Los paneles se DESCUBREN del DOM del harness (cada frame lleva `data-vis`), no de una lista
// hardcodeada: así el spec captura toda RECETA y todo BLOQUE que VisualHarness renderiza (itera
// BLOCK_IDS) sin poder quedarse atrás cuando se añade un bloque nuevo (#211).
async function discoverPanelIds(page: Page): Promise<string[]> {
  const ids = await page
    .locator('[data-vis]')
    .evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-vis')).filter((id): id is string => !!id),
    );
  expect(ids.length, 'el harness debe renderizar al menos una receta y un bloque').toBeGreaterThan(
    0,
  );
  return ids;
}

for (const width of BREAKPOINTS) {
  test.describe(`paneles v2 @${width}px`, () => {
    test(`recetas y bloques (cargados) @${width}`, async ({ page }) => {
      await stubApi(page, 'loaded');
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/visual.html');
      for (const id of await discoverPanelIds(page)) {
        const panel = page.locator(`[data-vis="${id}"]`);
        await expect(panel).toBeVisible();
        await expect(panel).toHaveScreenshot(`${id}-${width}.png`);
      }
    });
  });
}

// Estados del panel sobre un representativo (kpiRow+twoCharts: lleva KPIs y gráficas) a 1024px.
test.describe('estados del panel @1024px', () => {
  for (const mode of ['empty', 'error', 'loading'] as const) {
    test(`estado ${mode}`, async ({ page }) => {
      await stubApi(page, mode);
      await page.setViewportSize({ width: 1024, height: 900 });
      await page.goto('/visual.html');
      const panel = page.locator('[data-vis="recipe-kpiRow-twoCharts"]');
      await expect(panel).toBeVisible();
      await expect(panel).toHaveScreenshot(`state-${mode}.png`);
    });
  }
});
