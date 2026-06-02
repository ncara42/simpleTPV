import { expect, test } from '@playwright/test';

// El escáner demo no tiene barcodes asociados; este spec cubre la navegación
// del sidebar entre las cuatro vistas calcadas (Venta/Devolución/Traspasos/Caja).
async function login(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('login-email').fill('marta@centro.demo');
  await page.getByTestId('login-password').fill('demo');
  await page.getByTestId('login-submit').click();
  await page.getByTestId('sale-search').waitFor({ timeout: 10000 });
}

test('la navegación del sidebar muestra cada vista calcada', async ({ page }) => {
  await login(page);

  await page.getByTestId('nav-return').click();
  await expect(page.getByTestId('return-empty')).toBeVisible();
  await expect(page.getByText('Busca el ticket original')).toBeVisible();

  await page.getByTestId('nav-transfers').click();
  await expect(page.getByTestId('transfer-list')).toBeVisible();
  await expect(page.getByTestId('transfer-item')).toHaveCount(2);

  await page.getByTestId('nav-cash').click();
  await expect(page.getByTestId('cash-view')).toBeVisible();
  await expect(page.getByTestId('cash-state')).toContainText('Abierta');

  await page.getByTestId('nav-sale').click();
  await expect(page.getByTestId('sale-grid')).toBeVisible();
});
