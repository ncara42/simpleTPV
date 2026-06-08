import { expect, type Page } from '@playwright/test';

// Credenciales del seed demo (packages/db/prisma/seed-demo.ts). El backoffice solo
// admite ADMIN.
export const ADMIN = { email: 'admin@demo.simpletpv', password: 'demo1234' };

// Login real contra la API (proxy /api → :3001). Deja la sesión iniciada en el
// dashboard. Limpia localStorage primero para partir de un estado sin sesión.
export async function login(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('login-email').fill(ADMIN.email);
  await page.getByTestId('login-password').fill(ADMIN.password);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 15000 });
}

// Para specs que ya parten autenticados vía storageState: navega a la app y espera
// el dashboard, sin volver a hacer login (evita el rate limit de /auth/login 5/min).
export async function gotoApp(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 15000 });
}

// El UI usa un <Select> propio: el trigger lleva el data-testid y las opciones son
// elementos [role="option"] con data-value. Estos helpers abren el select y eligen
// una opción por su value (enums estables) o por su etiqueta visible (datos del
// seed, cuyos IDs son UUIDs que no se pueden hardcodear).
export async function selectByValue(
  page: Page,
  triggerTestId: string,
  value: string,
): Promise<void> {
  await page.getByTestId(triggerTestId).click();
  await page.locator(`[role="option"][data-value="${value}"]`).first().click();
}

export async function selectByLabel(
  page: Page,
  triggerTestId: string,
  label: string,
): Promise<void> {
  await page.getByTestId(triggerTestId).click();
  await page.locator('[role="option"]', { hasText: label }).first().click();
}

// Elige la primera opción "real" del select (saltando `skip` opciones iniciales,
// normalmente un placeholder tipo "Todos"). Devuelve su texto para aserciones.
export async function selectNthOption(
  page: Page,
  triggerTestId: string,
  index: number,
): Promise<string> {
  await page.getByTestId(triggerTestId).click();
  const opt = page.locator('[role="option"]').nth(index);
  const text = (await opt.textContent())?.trim() ?? '';
  await opt.click();
  return text;
}
