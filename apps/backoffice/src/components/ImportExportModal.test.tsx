import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { exportRows } from '../lib/spreadsheet.js';
import { ImportExportModal } from './ImportExportModal.js';

// CsvDropzone (embebido) y el modal usan lib/spreadsheet: se mockea entero para
// aislar el comportamiento del modal del parseo/descarga reales. `vi.mock` se eleva
// por encima de los imports, así que `exportRows` importado arriba ya es el mock.
vi.mock('../lib/spreadsheet.js', () => ({
  exportRows: vi.fn(() => Promise.resolve()),
  fileToCsv: vi.fn(() => Promise.resolve('')),
  downloadTemplate: vi.fn(() => Promise.resolve()),
}));

const exportConfig = {
  headers: ['Nombre', 'PVP'],
  getRows: () => [['Café', '2,50']],
  filenameBase: 'catalogo',
};
const importConfig = {
  columns: ['name', 'salePrice'],
  example: ['Café', '2.50'],
  templateBase: 'plantilla_catalogo',
  instructions: <span>Columnas obligatorias: name, salePrice</span>,
  onImport: vi.fn(() => Promise.resolve({ inserted: 0, errors: [] })),
};

describe('ImportExportModal (B-04)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('muestra ambas pestañas y abre en el modo inicial indicado', () => {
    render(
      <ImportExportModal
        title="Catálogo"
        onClose={() => {}}
        initialMode="export"
        importConfig={importConfig}
        exportConfig={exportConfig}
      />,
    );
    expect(screen.getByTestId('iemodal-tab-import')).toBeInTheDocument();
    expect(screen.getByTestId('iemodal-tab-export')).toBeInTheDocument();
    // initialMode=export → arranca en la pestaña de exportación.
    expect(screen.getByTestId('iemodal-export')).toBeInTheDocument();
    expect(screen.queryByTestId('iemodal-import')).not.toBeInTheDocument();
  });

  it('exporta en Excel llamando a exportRows con los datos actuales', async () => {
    render(
      <ImportExportModal
        title="Catálogo"
        onClose={() => {}}
        initialMode="export"
        exportConfig={exportConfig}
      />,
    );
    fireEvent.click(screen.getByTestId('iemodal-export-xlsx'));
    // El export resuelve getRows (posiblemente async) antes de llamar a exportRows.
    await waitFor(() =>
      expect(exportRows).toHaveBeenCalledWith(
        'xlsx',
        'catalogo',
        ['Nombre', 'PVP'],
        [['Café', '2,50']],
      ),
    );
  });

  it('exporta en CSV llamando a exportRows con los datos actuales', async () => {
    render(
      <ImportExportModal
        title="Catálogo"
        onClose={() => {}}
        initialMode="export"
        exportConfig={exportConfig}
      />,
    );
    fireEvent.click(screen.getByTestId('iemodal-export-csv'));
    await waitFor(() =>
      expect(exportRows).toHaveBeenCalledWith(
        'csv',
        'catalogo',
        ['Nombre', 'PVP'],
        [['Café', '2,50']],
      ),
    );
  });

  it('en la pestaña Importar muestra las instrucciones de formato y la zona de subida', () => {
    render(
      <ImportExportModal
        title="Catálogo"
        onClose={() => {}}
        initialMode="import"
        importConfig={importConfig}
        exportConfig={exportConfig}
      />,
    );
    expect(screen.getByText(/Columnas obligatorias/)).toBeInTheDocument();
    expect(screen.getByTestId('iemodal-dropzone')).toBeInTheDocument();
  });

  it('sin exportConfig solo ofrece importar (sin pestañas)', () => {
    render(<ImportExportModal title="Catálogo" onClose={() => {}} importConfig={importConfig} />);
    expect(screen.queryByTestId('iemodal-tabs')).not.toBeInTheDocument();
    expect(screen.getByTestId('iemodal-import')).toBeInTheDocument();
  });
});
