import { expect, test } from '@playwright/test';

import { CLERK } from './helpers.js';

// Estos tests prueban el login en sí: parten SIN sesión (ignoran el storageState).
test.use({ storageState: { cookies: [], origins: [] } });

test('muestra el login cuando no hay sesión', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId('login-card')).toBeVisible();
  await expect(page.getByTestId('login-email')).toBeVisible();
});

test('login CLERK real entra al TPV', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('login-email').fill(CLERK.email);
  await page.getByTestId('login-password').fill(CLERK.password);
  await page.getByTestId('login-submit').click();

  // Tras entrar desaparece el login y se ve la pantalla de venta + cuenta.
  await expect(page.getByTestId('sale-grid')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('login-card')).toHaveCount(0);
  await expect(page.getByTestId('account-menu')).toBeVisible();
  // El cierre de sesión vive en el menú de cuenta.
  await page.getByTestId('account-menu').click();
  await expect(page.getByTestId('logout')).toBeVisible();
});

test('credencial inválida es rechazada (sin bypass demo)', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('login-email').fill(CLERK.email);
  await page.getByTestId('login-password').fill('contraseña-incorrecta');
  await page.getByTestId('login-submit').click();
  // No entra: sigue el formulario de login y no aparece la venta.
  await expect(page.getByTestId('login-card')).toBeVisible();
  await expect(page.getByTestId('sale-grid')).toHaveCount(0);
});
