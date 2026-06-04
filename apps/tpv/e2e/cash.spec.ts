import { expect, test } from '@playwright/test';

// El cierre de caja del TPV (CashPanel embebido en Venta) con conteo por
// denominaciones y persistencia del conteo en curso.
async function login(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('login-email').fill('marta@centro.demo');
  await page.getByTestId('login-password').fill('demo');
  await page.getByTestId('login-submit').click();
  await page.getByTestId('sale-search').waitFor({ timeout: 10000 });
}

test('cierre de caja: contar por denominaciones y confirmar', async ({ page }) => {
  await login(page);
  await page.getByTestId('sale-grid').waitFor({ timeout: 10000 });

  // Caja demo abierta → Cerrar caja muestra el contador de denominaciones.
  await page.getByTestId('cash-close').click();
  await expect(page.getByTestId('cash-count')).toBeVisible();

  // 2 billetes de 50 € → total contado 100,00 €.
  await page.getByTestId('cash-count-5000').fill('2');
  await expect(page.getByTestId('cash-count-total')).toContainText('100,00');

  // Confirmar → resumen de cuadre con el contado.
  await page.getByTestId('cash-close-confirm').click();
  await expect(page.getByTestId('cash-summary')).toBeVisible();
  await expect(page.getByTestId('cash-counted-result')).toContainText('100,00');
});

test('el conteo en curso persiste al cerrar y reabrir el panel', async ({ page }) => {
  await login(page);
  await page.getByTestId('sale-grid').waitFor({ timeout: 10000 });

  await page.getByTestId('cash-close').click();
  await page.getByTestId('cash-count-2000').fill('3'); // 3×20€ = 60€
  await expect(page.getByTestId('cash-count-total')).toContainText('60,00');

  // Cancelar cierra el panel SIN confirmar; el conteo debe quedar guardado.
  await page.getByTestId('cash-close-cancel').click();
  await page.getByTestId('cash-close').click();

  await expect(page.getByTestId('cash-count-2000')).toHaveValue('3');
  await expect(page.getByTestId('cash-count-total')).toContainText('60,00');
});
