import { expect, test } from '@playwright/test';

// Flujo de login real contra la API local (proxy /api → :3001) con el seed.
// Requiere: API local en :3001, BD con seed (admin@org1.test / password123).

test.beforeEach(async ({ page }) => {
  // Sesión limpia: el store persiste en localStorage.
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('muestra el login cuando no hay sesión', async ({ page }) => {
  await expect(page.getByTestId('login-card')).toBeVisible();
  await expect(page.getByTestId('login-email')).toBeVisible();
});

test('login con credenciales válidas entra al TPV', async ({ page }) => {
  await page.getByTestId('login-email').fill('admin@org1.test');
  await page.getByTestId('login-password').fill('password123');
  await page.getByTestId('login-submit').click();

  // Tras login, se ve la home (botón de cerrar sesión) y desaparece el login.
  await expect(page.getByTestId('logout')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('login-card')).toHaveCount(0);
});

test('login con credenciales inválidas muestra error y no entra', async ({ page }) => {
  await page.getByTestId('login-email').fill('admin@org1.test');
  await page.getByTestId('login-password').fill('wrong-password');
  await page.getByTestId('login-submit').click();

  await expect(page.getByTestId('login-error')).toContainText('Credenciales inválidas', {
    timeout: 10000,
  });
  await expect(page.getByTestId('login-card')).toBeVisible();
});
