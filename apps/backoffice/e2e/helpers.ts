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

// Mapa page→grupo del menú dropdown. ESPEJO de NAV_GROUPS en App.tsx (shell flotante): todas las
// pages salvo dashboard y help viven dentro de un grupo desplegable, así que navTo debe abrir el
// grupo antes de clicar el item. (Si esto se desincroniza de NAV_GROUPS, los tests de las pages
// afectadas cuelgan 30s esperando un item oculto.)
// S-02 fase A: catalog/families/stock dejaron de ser entradas de menú — las absorbe la
// entrada única 'inventory' (shell con vistas segmentadas). navTo las resuelve abriendo
// Inventario y clicando el segmento correspondiente (ver INVENTORY_VIEW abajo).
const NAV_GROUP_OF: Record<string, string> = {
  // Catálogo e inventario
  notifications: 'inventory',
  inventory: 'inventory',
  transfers: 'inventory',
  suppliers: 'inventory',
  // Ventas y clientes
  sales: 'commercial',
  b2b: 'commercial',
  promotions: 'commercial',
  // Organización
  stores: 'org',
  users: 'org',
  timeclock: 'org',
  settings: 'org',
  verifactu: 'org',
};

// S-02 fase A: las antiguas pages catalog/families/stock son ahora VISTAS del shell de
// Inventario. navTo(page, 'catalog'|'families'|'stock') abre Inventario y clica el
// segmento; el contenido de cada página se monta igual, así que el resto de los specs
// (que asertan catalog-table, stock-page, families-empty, etc.) sigue funcionando.
const INVENTORY_VIEW: Record<string, 'catalogo' | 'familias' | 'existencias'> = {
  catalog: 'catalogo',
  families: 'familias',
  stock: 'existencias',
};

// Navega por el menú de grupos: ancla el dropdown del grupo (clic) y elige la
// page. Las directas (dashboard, help) se clican sin desplegar. Para las vistas de
// Inventario (catalog/families/stock) abre Inventario y elige el segmento.
export async function navTo(page: Page, id: string): Promise<void> {
  const view = INVENTORY_VIEW[id];
  if (view) {
    await navTo(page, 'inventory');
    await page.getByTestId(`inventory-view-${view}`).click();
    return;
  }
  const group = NAV_GROUP_OF[id];
  if (group) {
    const item = page.getByTestId(`nav-${id}`);
    if (!(await item.isVisible().catch(() => false))) {
      await page.getByTestId(`nav-group-${group}`).click();
    }
    await item.click();
  } else {
    await page.getByTestId(`nav-${id}`).click();
  }
}
