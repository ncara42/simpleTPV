import { expect, request, test } from '@playwright/test';

import { gotoApp } from './helpers.js';

// Crea un dispositivo vía API (como hace el backoffice en Tiendas) y devuelve su
// token + id. El emparejamiento desde el TPV usa este token real (I-08, E-03).
async function createDeviceViaApi(): Promise<{
  token: string;
  id: string;
  dispose: () => Promise<void>;
}> {
  const api = await request.newContext({ baseURL: 'http://localhost:3001' });
  const login = await api.post('/auth/login', {
    data: { email: 'admin@demo.simpletpv', password: 'demo1234' },
  });
  const { accessToken } = (await login.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };
  const stores = (await (await api.get('/stores', { headers: auth })).json()) as Array<{
    id: string;
  }>;
  const created = (await (
    await api.post('/devices', {
      headers: auth,
      data: { storeId: stores[0]!.id, name: 'TPV e2e pairing' },
    })
  ).json()) as { id: string; pairingToken: string };
  return {
    token: created.pairingToken,
    id: created.id,
    dispose: async () => {
      await api.delete(`/devices/${created.id}`, { headers: auth });
      await api.dispose();
    },
  };
}

// Control horario del TPV contra backend real (seed-demo). El fichaje (clock-in/out)
// exige un dispositivo oficial autorizado: la API responde 403 sin él y el panel
// muestra el estado BLOQUEADO con el flujo de emparejamiento. El seed no crea un
// dispositivo, así que el e2e verifica ese estado real; el fichaje completo se cubre
// en los tests de integración del API (time-clock.integration.spec.ts).
test.beforeEach(async ({ page }) => {
  await gotoApp(page);
});

test('el panel de fichaje muestra el estado bloqueado sin dispositivo oficial', async ({
  page,
}) => {
  await page.getByTestId('nav-clock').click();
  await expect(page.getByTestId('time-clock-locked')).toBeVisible();
  await expect(page.getByTestId('device-pair')).toBeVisible();
});

test('emparejar con un token REAL desbloquea el fichaje; revocar lo bloquea (I-08)', async ({
  page,
}) => {
  const device = await createDeviceViaApi();
  try {
    await page.getByTestId('nav-clock').click();
    await expect(page.getByTestId('time-clock-locked')).toBeVisible();
    // Teclear el token que generó el backoffice → autorizado.
    await page.getByTestId('device-token').fill(device.token);
    await page.getByTestId('device-pair').click();
    await expect(page.getByTestId('time-clock-view')).toBeVisible();
    await expect(page.getByTestId('time-clock-locked')).toHaveCount(0);
  } finally {
    // Revocar el dispositivo: al recargar, el TPV vuelve al estado bloqueado.
    await device.dispose();
  }
  await page.reload();
  await expect(page.getByTestId('login-email').or(page.getByTestId('nav-clock'))).toBeVisible({
    timeout: 15000,
  });
  await page.getByTestId('nav-clock').click();
  await expect(page.getByTestId('time-clock-locked')).toBeVisible();
});
