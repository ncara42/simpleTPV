import { expect, test } from '@playwright/test';

// Modo demo: el backoffice no llama a la API. El login acepta cualquier
// credencial y entra como ADMIN (JWT demo).
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('login con cualquier credencial entra como ADMIN y ve el sidebar', async ({ page }) => {
  await page.getByTestId('login-email').fill('admin@org1.test');
  await page.getByTestId('login-password').fill('demo');
  await page.getByTestId('login-submit').click();

  await expect(page.getByTestId('nav-families')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('nav-users')).toBeVisible();
  await expect(page.getByTestId('access-denied')).toHaveCount(0);
  await expect(page.getByTestId('dashboard')).toBeVisible();
});
