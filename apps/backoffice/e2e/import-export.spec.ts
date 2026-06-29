import { expect, test } from '@playwright/test';
import * as XLSX from 'xlsx';

// B-04 end-to-end: el modal único Importar/Exportar en Catálogo, contra el backend
// real. Verifica el flujo completo CSV + XLSX (la pieza nueva) y la exportación.
// La autenticación viene del proyecto `setup` (storageState compartido), como el
// resto de specs, para no repetir login (rate limit de /auth/login).

test('B-04: Catálogo importa CSV y XLSX y exporta, vía el modal único', async ({ page }) => {
  await page.goto('/inventario?vista=catalogo');

  // ── Abrir el modal en modo importar ──────────────────────────────────────
  await page.getByTestId('catalog-import').click();
  const modal = page.getByTestId('catalog-import-modal');
  await expect(modal).toBeVisible();
  // Las dos pestañas + la zona de subida + instrucciones de formato.
  await expect(page.getByTestId('iemodal-tab-import')).toBeVisible();
  await expect(page.getByTestId('iemodal-tab-export')).toBeVisible();
  await expect(page.getByTestId('iemodal-dropzone')).toBeVisible();
  await expect(modal).toContainText('name,salePrice,sku,barcode');

  const fileInput = page.locator('[data-testid="iemodal-dropzone"] input[type="file"]');

  // ── Importar CSV ─────────────────────────────────────────────────────────
  const csv = 'name,salePrice,sku,barcode\nProducto E2E CSV,9.99,E2E-CSV-1,8400000000001\n';
  await fileInput.setInputFiles({ name: 'p.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByTestId('csv-dropzone-result')).toContainText('fila', { timeout: 20000 });

  // Reset para la segunda importación.
  await page.getByRole('button', { name: 'Importar otro fichero' }).click();

  // ── Importar XLSX (la verificación CLAVE de B-04) ────────────────────────
  const ws = XLSX.utils.aoa_to_sheet([
    ['name', 'salePrice', 'sku', 'barcode'],
    ['Producto E2E XLSX', 7.5, 'E2E-XLSX-1', '8400000000002'],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Datos');
  const xlsxBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  await fileInput.setInputFiles({
    name: 'p.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: xlsxBuf,
  });
  await expect(page.getByTestId('csv-dropzone-result')).toContainText('fila', { timeout: 20000 });

  // ── Exportar en Excel: se dispara la descarga del fichero ────────────────
  await page.getByTestId('iemodal-tab-export').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('iemodal-export-xlsx').click(),
  ]);
  expect(download.suggestedFilename()).toBe('catalogo.xlsx');

  // ── Los dos productos importados aparecen en el catálogo ─────────────────
  // El Catálogo facetado renderiza TODAS las filas (sin paginación), así que en una BD
  // no reseteada pueden coexistir varios «Producto E2E CSV» de ejecuciones previas (el
  // import usa nombre fijo y no limpia). `.first()` confirma que el importado aparece sin
  // chocar con el modo estricto por duplicados de entorno (en CI, con seed limpio, hay uno).
  await page.getByRole('button', { name: 'Cerrar' }).click();
  await page.goto('/inventario?vista=catalogo');
  await expect(page.getByText('Producto E2E CSV').first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Producto E2E XLSX').first()).toBeVisible();
});
