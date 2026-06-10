import { expect, test } from '@playwright/test';

import { gotoApp } from './helpers.js';

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
