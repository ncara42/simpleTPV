import { expect, test } from '@playwright/test';

import { gotoApp } from './helpers.js';

// Cierre de caja del TPV contra backend real (seed-demo): conteo por denominaciones
// (cálculo cliente-side) y persistencia del conteo en curso.
//
// IMPORTANTE: este spec se llama "z-cash" para correr EL ÚLTIMO. Su test de cierre
// confirma y CIERRA la sesión de caja del seed; el cobro (checkout/end-to-end) la
// necesita abierta, así que esos specs (alfabéticamente antes) corren primero.
// Dentro de este archivo, el test de persistencia (que cancela, sin cerrar) va
// antes que el de cierre.
test.beforeEach(async ({ page }) => {
  await gotoApp(page);
  await page.getByTestId('nav-cash').click();
  await expect(page.getByTestId('cash-panel')).toBeVisible();
});

test('el conteo en curso persiste al cancelar y reabrir el panel', async ({ page }) => {
  await page.getByTestId('cash-close').click();
  await page.getByTestId('cash-count-2000').fill('3'); // 3×20€ = 60€
  await expect(page.getByTestId('cash-count-total')).toContainText('60,00');

  // Cancelar cierra el panel SIN confirmar; el conteo debe quedar guardado.
  await page.getByTestId('cash-close-cancel').click();
  await page.getByTestId('cash-close').click();
  await expect(page.getByTestId('cash-count-2000')).toHaveValue('3');
  await expect(page.getByTestId('cash-count-total')).toContainText('60,00');
});

test('cierre de caja: contar por denominaciones y confirmar', async ({ page }) => {
  // Caja abierta → Cerrar caja muestra el contador de denominaciones.
  await page.getByTestId('cash-close').click();
  await expect(page.getByTestId('cash-count')).toBeVisible();

  // 2 billetes de 50 € → total contado 100,00 € (cálculo cliente-side).
  await page.getByTestId('cash-count-5000').fill('2');
  await expect(page.getByTestId('cash-count-total')).toContainText('100,00');

  // Confirmar → resumen de cuadre con el contado.
  await page.getByTestId('cash-close-confirm').click();
  await expect(page.getByTestId('cash-summary')).toBeVisible();
  await expect(page.getByTestId('cash-counted-result')).toContainText('100,00');
});
