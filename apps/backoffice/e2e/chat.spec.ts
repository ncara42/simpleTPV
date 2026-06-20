import { expect, test } from '@playwright/test';

import { gotoApp, navTo } from './helpers.js';

// F3.3 (#188): integración del ChatPanel en el shell del backoffice. Tests estructurales —
// el panel aparece solo en Dashboard, colapsa/expande y su estado persiste entre recargas.
// El envío real de mensajes con streaming (requiere provider LLM) se cubre en F6 con un
// provider fake; aquí solo verificamos la integración y el layout.

// El colapso del panel se persiste en localStorage (dashboard.chatCollapsed) y el storageState
// se comparte entre tests: parte siempre de expandido para un estado conocido.
test.beforeEach(async ({ page }) => {
  await gotoApp(page);
  await page.evaluate(() => localStorage.removeItem('dashboard.chatCollapsed'));
  await page.reload();
  await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 15000 });
});

test('el ChatPanel aparece solo en la pestaña Dashboard', async ({ page }) => {
  // En Dashboard el panel está montado y expandido por defecto.
  await expect(page.getByTestId('chat-panel')).toBeVisible();

  // Al navegar a otra pestaña, el panel se desmonta por completo (ni panel ni rail).
  await navTo(page, 'stock');
  await expect(page.getByTestId('chat-panel')).toHaveCount(0);
  await expect(page.getByTestId('chat-rail')).toHaveCount(0);

  // Al volver al Dashboard, reaparece.
  await navTo(page, 'dashboard');
  await expect(page.getByTestId('chat-panel')).toBeVisible();
});

test('colapsar y expandir el panel persiste entre recargas', async ({ page }) => {
  await expect(page.getByTestId('chat-panel')).toBeVisible();

  // Colapsar: el panel deja paso al rail de iconos.
  await page.getByRole('button', { name: 'Colapsar panel' }).click();
  await expect(page.getByTestId('chat-rail')).toBeVisible();
  await expect(page.getByTestId('chat-panel')).toHaveCount(0);

  // El colapso persiste tras recargar.
  await page.reload();
  await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('chat-rail')).toBeVisible();
  await expect(page.getByTestId('chat-panel')).toHaveCount(0);

  // Expandir desde el rail y verificar que también persiste.
  await page.getByRole('button', { name: 'Abrir asistente' }).click();
  await expect(page.getByTestId('chat-panel')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('chat-panel')).toBeVisible();
});

test('el panel expone el selector de modelo y el campo de mensaje', async ({ page }) => {
  await expect(page.getByTestId('chat-panel')).toBeVisible();
  // Controles clave del panel presentes (sin enviar: el streaming real es de F6).
  await expect(page.getByTestId('chat-model-select')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enviar' })).toBeVisible();
});
