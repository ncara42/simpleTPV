import { expect, test } from '@playwright/test';

// Control horario del TPV (TimeClockPanel, vista "Fichaje" del sidebar): flujo
// completo entrada → pausa → fin pausa → salida con contador en vivo, y tabla de
// jornadas por fecha con filtro. En demo el dispositivo ya está autorizado, el
// estado se mantiene en memoria y la tabla se siembra con jornadas pasadas.

// Día local hoy−offset (YYYY-MM-DD), igual que el seed demo y el panel, para elegir
// fechas presentes/ausentes de forma determinista (no hardcodeadas).
function dayKey(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function login(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('login-email').fill('marta@centro.demo');
  await page.getByTestId('login-password').fill('demo');
  await page.getByTestId('login-submit').click();
  await page.getByTestId('sale-search').waitFor({ timeout: 10000 });
}

test('fichaje: entrada, pausa y salida con contador e historial', async ({ page }) => {
  await login(page);
  await page.getByTestId('sale-grid').waitFor({ timeout: 10000 });

  await page.getByTestId('nav-clock').click();
  await expect(page.getByTestId('time-clock-view')).toBeVisible();
  await expect(page.getByTestId('time-clock-state')).toHaveText('Sin fichaje activo');

  // Fichar entrada pide confirmación: Cancelar no ficha.
  await page.getByTestId('time-clock-clock-in').click();
  await expect(page.getByTestId('time-clock-modal')).toBeVisible();
  await page.getByTestId('time-clock-cancel').click();
  await expect(page.getByTestId('time-clock-modal')).toBeHidden();
  await expect(page.getByTestId('time-clock-state')).toHaveText('Sin fichaje activo');

  // Sin jornada activa el item del sidebar no muestra temporizador.
  await expect(page.getByTestId('nav-clock-counter')).toBeHidden();

  // Confirmar la entrada → estado "Fichado" y contador en vivo visible (panel
  // y temporizador del item "Fichaje" en el sidebar).
  await page.getByTestId('time-clock-clock-in').click();
  await page.getByTestId('time-clock-confirm').click();
  await expect(page.getByTestId('time-clock-state')).toHaveText('Fichado');
  await expect(page.getByTestId('time-clock-counter')).toBeVisible();
  await expect(page.getByTestId('nav-clock-counter')).toBeVisible();

  // Iniciar pausa → "En pausa".
  await page.getByTestId('time-clock-break-start').click();
  await expect(page.getByTestId('time-clock-state')).toHaveText('En pausa');

  // Terminar pausa → vuelve a "Fichado".
  await page.getByTestId('time-clock-break-end').click();
  await expect(page.getByTestId('time-clock-state')).toHaveText('Fichado');

  // Fichar salida pide confirmación → "Sin fichaje activo" y el temporizador del
  // sidebar desaparece.
  await page.getByTestId('time-clock-clock-out').click();
  await page.getByTestId('time-clock-confirm').click();
  await expect(page.getByTestId('time-clock-state')).toHaveText('Sin fichaje activo');
  await expect(page.getByTestId('nav-clock-counter')).toBeHidden();

  // La tabla de jornadas muestra la fila de HOY ya cerrada (entrada + salida)
  // además de las jornadas sembradas (hoy + 5 pasadas).
  await expect(page.getByTestId('time-clock-table')).toBeVisible();
  const rows = page.getByTestId('time-clock-row');
  await expect(rows).toHaveCount(6);
  // La primera fila (más reciente) es la de hoy; con entrada y salida, no "—".
  await expect(rows.first()).toContainText(dayKey(0));
});

test('fichaje: la tabla de jornadas filtra por fecha', async ({ page }) => {
  await login(page);
  await page.getByTestId('sale-grid').waitFor({ timeout: 10000 });
  await page.getByTestId('nav-clock').click();

  // Sin fichar hoy: la tabla arranca con las 5 jornadas sembradas (ayer, −2, −3, −5, −7).
  await expect(page.getByTestId('time-clock-table')).toBeVisible();
  await expect(page.getByTestId('time-clock-row')).toHaveCount(5);

  // Filtrar por una fecha con jornada (ayer) → una sola fila, la de esa fecha.
  await page.getByTestId('time-clock-date').fill(dayKey(1));
  await expect(page.getByTestId('time-clock-row')).toHaveCount(1);
  await expect(page.getByTestId('time-clock-row').first()).toContainText(dayKey(1));

  // Filtrar por una fecha sin jornada (hace 4 días, ausente del seed) → vacío.
  await page.getByTestId('time-clock-date').fill(dayKey(4));
  await expect(page.getByTestId('time-clock-empty')).toBeVisible();

  // Limpiar restaura el listado completo.
  await page.getByTestId('time-clock-date-clear').click();
  await expect(page.getByTestId('time-clock-row')).toHaveCount(5);
});
