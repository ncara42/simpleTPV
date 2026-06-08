import { expect, test } from '@playwright/test';

import { ADMIN, login } from './helpers.js';

// Estos tests prueban el login en sí: parten SIN sesión (ignoran el storageState
// compartido del proyecto).
test.use({ storageState: { cookies: [], origins: [] } });

// Login real contra la API: el backoffice solo admite ADMIN; una credencial
// válida entra y ve el sidebar; una inválida es rechazada.
test('login ADMIN real entra y ve el sidebar', async ({ page }) => {
  await login(page);
  await expect(page.getByTestId('nav-families')).toBeVisible();
  await expect(page.getByTestId('nav-users')).toBeVisible();
  await expect(page.getByTestId('access-denied')).toHaveCount(0);
  await expect(page.getByTestId('dashboard')).toBeVisible();
});

test('credencial inválida es rechazada (sin bypass demo)', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('login-email').fill(ADMIN.email);
  await page.getByTestId('login-password').fill('contraseña-incorrecta');
  await page.getByTestId('login-submit').click();

  // No entra: el dashboard no aparece y seguimos en el formulario de login.
  await expect(page.getByTestId('login-submit')).toBeVisible();
  await expect(page.getByTestId('dashboard')).toHaveCount(0);
});
