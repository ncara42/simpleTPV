import { expect, test as setup } from '@playwright/test';

import { CLERK } from './helpers.js';

// Login UNA sola vez y guarda la sesión (storageState) para que el resto de specs
// parta autenticado, evitando repetir login (rate limit /auth/login 5/min/IP).
const authFile = 'e2e/.auth/clerk.json';

setup('autenticar clerk', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('login-email').fill(CLERK.email);
  await page.getByTestId('login-password').fill(CLERK.password);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('sale-grid')).toBeVisible({ timeout: 15000 });
  await page.context().storageState({ path: authFile });
});
