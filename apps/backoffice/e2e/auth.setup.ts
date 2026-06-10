import { expect, test as setup } from '@playwright/test';

import { ADMIN } from './helpers.js';

// Login UNA sola vez y guarda la sesión (storageState) para que el resto de specs
// parta autenticado. Evita repetir login en cada test (el endpoint /auth/login
// tiene rate limit de 5/min/IP, que 20+ logins seguidos superarían).
const authFile = 'e2e/.auth/admin.json';

setup('autenticar admin', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('login-email').fill(ADMIN.email);
  await page.getByTestId('login-password').fill(ADMIN.password);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 15000 });
  await page.context().storageState({ path: authFile });
});
