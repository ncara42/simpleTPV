import { expect, test } from '@playwright/test';

test('carga TPV y muestra status de API', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'simpleTPV' })).toBeVisible();

  const status = page.getByTestId('api-status');
  await expect(status).toBeVisible();
  // En CI hay API arriba → "ok". En local sin API → "Sin conexión".
  // Ambos son válidos para verificar que la SPA renderiza.
  await expect(status).toContainText(/(ok|Sin conexión)/, { timeout: 10000 });
});
