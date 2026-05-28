import { expect, test } from '@playwright/test';

// Verifica el flujo del escáner USB: simula una ráfaga rápida de teclas
// (dígitos + Enter) y comprueba que el banner muestra el producto del barcode.
// Requiere API local + seed. Crea un producto con barcode vía la API (token del login).

const BARCODE = `840000${Math.floor(Math.random() * 100000)}`;

async function login(page: import('@playwright/test').Page): Promise<string> {
  const res = await page.request.post('http://localhost:3001/auth/login', {
    data: { email: 'admin@org1.test', password: 'password123' },
  });
  return ((await res.json()) as { accessToken: string }).accessToken;
}

test('escanear un código muestra el producto en el banner', async ({ page }) => {
  const token = await login(page);
  // Crear producto con barcode conocido
  const created = await page.request.post('http://localhost:3001/products', {
    headers: { Authorization: `Bearer ${token}` },
    data: { name: 'Producto Escaneable', salePrice: 9.99, barcode: BARCODE },
  });
  expect(created.ok()).toBeTruthy();
  const product = (await created.json()) as { id: string };

  try {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByTestId('login-email').fill('admin@org1.test');
    await page.getByTestId('login-password').fill('password123');
    await page.getByTestId('login-submit').click();
    await page.getByTestId('sale-grid').waitFor({ timeout: 10000 });

    // Quitar foco del buscador para que el escáner se procese a nivel documento.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    // Simular ráfaga de escáner: teclas rápidas + Enter.
    for (const ch of BARCODE) {
      await page.keyboard.press(ch, { delay: 5 });
    }
    await page.keyboard.press('Enter');

    const banner = page.getByTestId('scan-banner');
    await expect(banner).toBeVisible({ timeout: 5000 });
    await expect(banner).toContainText('Producto Escaneable');
  } finally {
    await page.request.delete(`http://localhost:3001/products/${product.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
});
