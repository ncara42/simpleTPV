import { expect, test } from '@playwright/test';

test('carga Backoffice y muestra status de API', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'simpleTPV Backoffice' })).toBeVisible();

  const status = page.getByTestId('api-status');
  await expect(status).toBeVisible();
  await expect(status).toContainText(/(ok|Sin conexión)/, { timeout: 10000 });
});
