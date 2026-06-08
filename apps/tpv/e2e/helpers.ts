import { expect, type Page } from '@playwright/test';

// Credenciales del seed demo (packages/db/prisma/seed-demo.ts). El TPV opera como
// dependiente (CLERK), asignado a todas las tiendas → activeStore = la primera.
export const CLERK = { email: 'clerk@demo.simpletpv', password: 'demo1234' };

// Para specs que parten autenticados vía storageState (auth.setup.ts): navega a la
// app y espera la pantalla de venta, sin repetir login (rate limit /auth/login 5/min).
export async function gotoApp(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('sale-grid')).toBeVisible({ timeout: 15000 });
}

// Construye un carrito añadiendo `n` productos distintos (clic en tarjetas). El
// carrito real arranca vacío (sin precarga demo).
export async function addProducts(page: Page, n = 1): Promise<void> {
  await expect(page.getByTestId('prod-card').first()).toBeVisible();
  for (let i = 0; i < n; i++) {
    await page.getByTestId('prod-card').nth(i).click();
  }
  await expect(page.getByTestId('cart-line')).toHaveCount(n);
}

// Un código de barras real del seed (Flor CBD Lemon Haze 20%).
export const REAL_BARCODE = '8400000000011';
