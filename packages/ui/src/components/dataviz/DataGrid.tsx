import type { ReactNode } from 'react';

import { DataTable, type DataTableAlign, type DataTableColumn } from '../DataTable.js';
import { SectionHeader, WidgetStates } from './atoms.js';
import { formatValue, type StatFormat } from './format.js';

// Tabla con cabeceras legibles, alineación por tipo y formato horneados (sobre DataTable). Arregla
// el "header = nombre crudo del campo" y "número sin formatear" de GenericTable. Presentacional.
export interface DataGridColumn {
  key: string;
  header: string;
  /** Si se indica, la columna se alinea a la derecha y sus valores se formatean es-ES. */
  format?: StatFormat;
  align?: DataTableAlign;
  /** Render a medida de la celda (p. ej. una insignia de método de pago). Tiene prioridad. */
  render?: (row: Record<string, unknown>) => ReactNode;
  /** Renderiza el valor en Geist Mono (SKU, EAN, id de ticket). */
  mono?: boolean;
}
export interface DataGridProps {
  title?: string;
  columns: DataGridColumn[];
  rows: Array<Record<string, unknown>>;
  isLoading?: boolean;
  isError?: boolean;
}

type Row = Record<string, unknown>;

export function DataGrid({
  title,
  columns,
  rows,
  isLoading = false,
  isError = false,
}: DataGridProps) {
  let body;
  if (isLoading) body = <WidgetStates state="loading" />;
  else if (isError) body = <WidgetStates state="error" />;
  else if (!rows || rows.length === 0) body = <WidgetStates state="empty" />;
  else {
    const cols: DataTableColumn<Row>[] = columns.map((c) => ({
      key: c.key,
      header: c.header,
      align: c.align ?? (c.format ? 'right' : 'left'),
      render: (row: Row) => {
        if (c.render) return c.render(row);
        const raw = row[c.key];
        if (c.format) {
          const n = Number(raw);
          return Number.isFinite(n) ? formatValue(n, c.format) : '—';
        }
        const text = raw == null ? '—' : String(raw);
        return c.mono ? <span className="dv-cell-mono">{text}</span> : text;
      },
    }));
    body = <DataTable columns={cols} rows={rows} rowKey={(_row, i) => String(i)} />;
  }
  return (
    <figure className="dv-grid">
      {title ? <SectionHeader title={title} /> : null}
      {body}
    </figure>
  );
}
