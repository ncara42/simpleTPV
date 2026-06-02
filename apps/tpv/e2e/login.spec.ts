import { expect, test } from '@playwright/test';

// Modo demo: el TPV no llama a la API. El login acepta cualquier credencial.
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('muestra el login cuando no hay sesión', async ({ page }) => {
  await expect(page.getByTestId('login-card')).toBeVisible();
  await expect(page.getByTestId('login-email')).toBeVisible();
});

test('login con cualquier credencial entra al TPV (modo demo)', async ({ page }) => {
  await page.getByTestId('login-email').fill('marta@centro.demo');
  await page.getByTestId('login-password').fill('lo-que-sea');
  await page.getByTestId('login-submit').click();

  // Tras entrar se ve la TopBar con "Salir" y desaparece el login.
  await expect(page.getByTestId('logout')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('login-card')).toHaveCount(0);
  await expect(page.getByTestId('sale-grid')).toBeVisible();
});
