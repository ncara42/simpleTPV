import type { ImportResult } from '@simpletpv/auth';
import { Download, X } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { exportRows, type SpreadsheetFormat } from '../lib/spreadsheet.js';
import { CsvDropzone } from './CsvDropzone.js';
import { Modal } from './Modal.js';

export interface ImportExportImportConfig {
  /** Columnas esperadas en la cabecera (validación + plantilla). */
  columns: string[];
  /** Fila de ejemplo (mismo orden que `columns`) para la plantilla. */
  example: string[];
  /** Base del nombre de plantilla (sin extensión). */
  templateBase: string;
  /** Instrucciones de formato (qué columnas, cuáles obligatorias). */
  instructions: ReactNode;
  /** Importa el CSV ya normalizado (XLSX se convierte antes) y devuelve el resultado. */
  onImport: (csv: string) => Promise<ImportResult>;
  /** Se invoca si se insertó ≥1 fila (para refrescar la lista de origen). */
  onImported?: () => void;
}

export interface ImportExportExportConfig {
  headers: string[];
  /** Construye las filas a exportar EN EL MOMENTO (respeta los filtros actuales).
   *  Puede ser síncrona (datos en memoria) o asíncrona (p. ej. Ventas, que pide al
   *  servidor TODO el conjunto filtrado, no solo la página visible). */
  getRows: () => string[][] | Promise<string[][]>;
  /** Base del nombre de archivo (sin extensión). */
  filenameBase: string;
}

interface Props {
  /** Nombre de la entidad ("Catálogo", "Proveedores", …). */
  title: string;
  onClose: () => void;
  /** Pestaña inicial (la que abrió el modal). Por defecto, la primera disponible. */
  initialMode?: 'import' | 'export';
  importConfig?: ImportExportImportConfig;
  exportConfig?: ImportExportExportConfig;
  testId?: string;
}

// B-04: modal único de Importar/Exportar. Deja elegir dirección (importar/exportar)
// y formato (Excel/CSV), con instrucciones de formato. Reutiliza CsvDropzone (que ya
// acepta CSV y XLSX) para el import, y la capa segura `exportRows` para el export.
export function ImportExportModal({
  title,
  onClose,
  initialMode,
  importConfig,
  exportConfig,
  testId,
}: Props) {
  const canImport = Boolean(importConfig);
  const canExport = Boolean(exportConfig);
  const [mode, setMode] = useState<'import' | 'export'>(
    initialMode ?? (canImport ? 'import' : 'export'),
  );
  const [exporting, setExporting] = useState<SpreadsheetFormat | null>(null);

  async function handleExport(format: SpreadsheetFormat): Promise<void> {
    if (!exportConfig) return;
    setExporting(format);
    try {
      // `getRows` puede ser síncrona o asíncrona (Ventas pide los datos al servidor).
      const rows = await exportConfig.getRows();
      await exportRows(format, exportConfig.filenameBase, exportConfig.headers, rows);
    } finally {
      setExporting(null);
    }
  }

  return (
    <Modal
      onClose={onClose}
      className="modal--form import-export-modal"
      ariaLabel={`Importar o exportar ${title}`}
      {...(testId ? { testId } : {})}
    >
      <header className="iemodal-head">
        <h3>
          {canImport && canExport
            ? `${title}: importar o exportar`
            : canImport
              ? `Importar ${title}`
              : `Exportar ${title}`}
        </h3>
        <button
          type="button"
          className="iemodal-close"
          aria-label="Cerrar"
          onClick={onClose}
          data-testid="iemodal-close"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      {canImport && canExport && (
        <nav className="bo-tabs" data-testid="iemodal-tabs">
          <button
            type="button"
            className={`bo-tab ${mode === 'import' ? 'active' : ''}`}
            onClick={() => setMode('import')}
            data-testid="iemodal-tab-import"
          >
            Importar
          </button>
          <button
            type="button"
            className={`bo-tab ${mode === 'export' ? 'active' : ''}`}
            onClick={() => setMode('export')}
            data-testid="iemodal-tab-export"
          >
            Exportar
          </button>
        </nav>
      )}

      {mode === 'import' && importConfig && (
        <div className="iemodal-panel" data-testid="iemodal-import">
          <div className="iemodal-instructions">{importConfig.instructions}</div>
          <CsvDropzone
            columns={importConfig.columns}
            example={importConfig.example}
            templateName={`${importConfig.templateBase}.csv`}
            onImport={importConfig.onImport}
            testId="iemodal-dropzone"
            {...(importConfig.onImported ? { onImported: importConfig.onImported } : {})}
          />
        </div>
      )}

      {mode === 'export' && exportConfig && (
        <div className="iemodal-panel" data-testid="iemodal-export">
          <p className="muted">
            Descarga los datos actuales (con los filtros aplicados) en el formato que prefieras.
          </p>
          <div className="iemodal-export-actions">
            <button
              type="button"
              className="link-btn"
              onClick={() => void handleExport('xlsx')}
              disabled={exporting !== null}
              data-testid="iemodal-export-xlsx"
            >
              <Download size={15} aria-hidden="true" />
              {exporting === 'xlsx' ? 'Generando…' : 'Descargar Excel'}
            </button>
            <button
              type="button"
              className="link-btn"
              onClick={() => void handleExport('csv')}
              disabled={exporting !== null}
              data-testid="iemodal-export-csv"
            >
              <Download size={15} aria-hidden="true" />
              {exporting === 'csv' ? 'Generando…' : 'Descargar CSV'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
