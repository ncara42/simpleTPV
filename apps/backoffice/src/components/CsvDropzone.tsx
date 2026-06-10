import type { ImportResult } from '@simpletpv/auth';
import { type ReactNode, useId, useRef, useState } from 'react';

interface Props {
  // Columnas esperadas en la cabecera (para validar y construir la plantilla).
  columns: string[];
  // Fila de ejemplo (mismo orden que `columns`) para la plantilla descargable.
  example: string[];
  // Nombre del fichero de plantilla.
  templateName: string;
  // Ayuda: qué columnas, cuáles obligatorias.
  help?: ReactNode;
  // Importa el CSV crudo y devuelve el resultado por filas.
  onImport: (csv: string) => Promise<ImportResult>;
  // Se invoca si se insertó al menos una fila (para refrescar la lista de origen).
  onImported?: () => void;
  testId?: string;
}

// Zona de importación CSV reutilizable (T1): arrastrar-soltar o seleccionar,
// valida la cabecera, importa y muestra el recuento + errores por fila. La usan
// Usuarios, Precios por tienda y Líneas de traspaso.
export function CsvDropzone({
  columns,
  example,
  templateName,
  help,
  onImport,
  onImported,
  testId,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  // Plantilla CSV como data URI (cabecera + fila de ejemplo).
  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(
    `${columns.join(',')}\n${example.join(',')}`,
  )}`;

  // Valida que la cabecera incluya todas las columnas esperadas (admite extras).
  function missingColumns(csv: string): string[] {
    const firstLine = csv.split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';
    const header = firstLine.split(',').map((h) => h.trim().toLowerCase());
    return columns.filter((c) => !header.includes(c.toLowerCase()));
  }

  async function handleFile(file: File): Promise<void> {
    setError(null);
    setResult(null);
    // Mismo límite que el body JSON de la API (512kb): rechazar aquí da un error
    // claro en vez del 413 genérico del servidor.
    if (file.size > 512 * 1024) {
      setError('El archivo supera 512 KB. Divide el CSV en lotes más pequeños.');
      return;
    }
    const csv = await file.text();
    const missing = missingColumns(csv);
    if (missing.length > 0) {
      setError(`Faltan columnas en la cabecera: ${missing.join(', ')}`);
      return;
    }
    setLoading(true);
    try {
      const res = await onImport(csv);
      setResult(res);
      if (res.inserted > 0) onImported?.();
    } catch {
      setError('No se pudo importar el archivo. Comprueba el formato e inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="csv-dropzone" data-testid={testId}>
      {help && <p className="csv-dropzone-help">{help}</p>}
      <a className="csv-dropzone-template" href={templateHref} download={templateName}>
        ↓ Descargar plantilla CSV
      </a>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept=".csv,text/csv"
        className="csv-dropzone-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      <label
        htmlFor={inputId}
        className={`csv-dropzone-area${dragOver ? ' is-dragover' : ''}`}
        data-testid="csv-dropzone-area"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void handleFile(f);
        }}
      >
        {loading ? (
          'Importando…'
        ) : (
          <>
            <strong>Arrastra un CSV aquí</strong>
            <span className="muted">o haz clic para seleccionarlo</span>
          </>
        )}
      </label>

      {error && (
        <p className="form-error" data-testid="csv-dropzone-error">
          {error}
        </p>
      )}

      {result && (
        <div className="csv-dropzone-result" data-testid="csv-dropzone-result">
          <p className={result.inserted > 0 ? 'csv-dropzone-ok' : 'muted'}>
            ✓ {result.inserted} fila{result.inserted !== 1 ? 's' : ''} importada
            {result.inserted !== 1 ? 's' : ''} correctamente.
          </p>
          {result.errors.length > 0 && (
            <div className="csv-dropzone-errors">
              <p>
                {result.errors.length} fila{result.errors.length !== 1 ? 's' : ''} con error:
              </p>
              <ul>
                {result.errors.map((e) => (
                  <li key={e.row}>
                    Fila {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setResult(null);
              if (inputRef.current) inputRef.current.value = '';
            }}
          >
            Importar otro fichero
          </button>
        </div>
      )}
    </div>
  );
}
