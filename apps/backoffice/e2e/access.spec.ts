import { expect, test } from '@playwright/test';

// Acceso al backoffice por rol. Requiere API en :3001 con seed
// (admin@org1.test / clerk@org1.test, password123).

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('un ADMIN entra y ve la navegación del sidebar', async ({ page }) => {
  await page.getByTestId('login-email').fill('admin@org1.test');
  await page.getByTestId('login-password').fill('password123');
  await page.getByTestId('login-submit').click();

  await expect(page.getByTestId('nav-families')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('nav-users')).toBeVisible();
  await expect(page.getByTestId('access-denied')).toHaveCount(0);
});

test('un CLERK no entra: ve acceso restringido', async ({ page }) => {
  await page.getByTestId('login-email').fill('clerk@org1.test');
  await page.getByTestId('login-password').fill('password123');
  await page.getByTestId('login-submit').click();

  await expect(page.getByTestId('access-denied')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('nav-families')).toHaveCount(0);
});
