import * as React from 'react';

import { cn } from '../lib/cn.js';

export type DataTableAlign = 'left' | 'right' | 'center';
export type SortDir = 'asc' | 'desc';

export interface DataTableColumn<Row> {
  /** Clave estable de la columna (también la que se emite al ordenar). */
  key: string;
  header: React.ReactNode;
  /** Render de celda. Si falta, se muestra row[key] como texto. */
  render?: (row: Row, index: number) => React.ReactNode;
  align?: DataTableAlign;
  sortable?: boolean;
  /** Ancho CSS opcional de la columna (p. ej. "8rem"). */
  width?: string;
  /** La celda no parte de línea (valores compuestos como "17,90 € · 60%"). */
  noWrap?: boolean;
  /** Se oculta en pantallas estrechas (≤640px) para no saturar. */
  hideOnNarrow?: boolean;
}

export interface DataTableSort {
  key: string;
  dir: SortDir;
}

export interface DataTablePagination {
  /** Página actual (1-based). */
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}

export interface DataTableProps<Row> {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  /** Extrae una key estable de React por fila. */
  rowKey: (row: Row, index: number) => string;
  /** Muestra filas skeleton sin desmontar la tabla. */
  loading?: boolean;
  /** Orden actual (controlado). */
  sort?: DataTableSort;
  /** Se invoca con la key de la columna al pulsar una cabecera ordenable. */
  onSortChange?: (key: string) => void;
  /** Slot de cabecera (filtros/acciones). */
  toolbar?: React.ReactNode;
  /** Slot de pie (totales/agregados), a la izquierda del paginador. */
  footer?: React.ReactNode;
  pagination?: DataTablePagination;
  /** Contenido cuando no hay filas y no está cargando. */
  emptyState?: React.ReactNode;
  skeletonRows?: number;
  /** Clic en la fila (p. ej. alternar selección múltiple). */
  onRowClick?: (row: Row) => void;
  /** Clase extra por fila (p. ej. 'is-selected'). */
  rowClassName?: (row: Row) => string | undefined;
  /** aria-selected por fila (selección múltiple accesible). */
  rowAriaSelected?: (row: Row) => boolean;
  /** data-testid de cada fila (por defecto 'ui-dt-row'; las pages migradas
   *  conservan el suyo: 'stock-row', 'user-row'…). */
  rowTestId?: string;
  /** Fila de detalle bajo la fila (p. ej. desglose por tienda del Stock):
   *  si devuelve contenido, se pinta un <tr> extra a ancho completo. */
  renderDetail?: (row: Row) => React.ReactNode;
  className?: string;
  'data-testid'?: string;
}

const ALIGN_CLASS: Record<DataTableAlign, string> = {
  left: '',
  right: 'ui-dt-col-right',
  center: 'ui-dt-col-center',
};

/** Clases de columna comunes a th y td (alineación + nowrap + ocultar en móvil). */
function colClass<Row>(col: DataTableColumn<Row>): string {
  return cn(
    ALIGN_CLASS[col.align ?? 'left'],
    col.noWrap && 'ui-dt-col-nowrap',
    col.hideOnNarrow && 'ui-dt-col-narrow-hide',
  );
}

function ariaSort(active: boolean, dir: SortDir | undefined): React.AriaAttributes['aria-sort'] {
  if (!active) return 'none';
  return dir === 'desc' ? 'descending' : 'ascending';
}

function Chevron() {
  return (
    <svg
      className="ui-dt-sort-icon"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function cellValue<Row>(row: Row, key: string): React.ReactNode {
  const v = (row as Record<string, unknown>)[key];
  if (v === null || v === undefined) return '';
  if (typeof v === 'string' || typeof v === 'number') return v;
  return String(v);
}

/**
 * Tabla de datos reutilizable y controlada (DESIGN_SYSTEM.md §10.10). El padre
 * decide el filtrado/orden/paginación (en memoria o server-side); este componente
 * solo pinta. Render inmediato con skeleton no bloqueante (PERF-01).
 */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  loading = false,
  sort,
  onSortChange,
  toolbar,
  footer,
  pagination,
  emptyState,
  skeletonRows = 6,
  onRowClick,
  rowClassName,
  rowAriaSelected,
  rowTestId = 'ui-dt-row',
  renderDetail,
  className,
  'data-testid': testid,
}: DataTableProps<Row>) {
  const colCount = columns.length;
  const hasFooter = footer != null || pagination != null;

  return (
    <div className={cn('ui-dt', className)} data-testid={testid}>
      {toolbar != null && <div className="ui-dt-toolbar">{toolbar}</div>}

      <div className="ui-dt-scroll">
        <table className="ui-dt-table">
          <thead>
            <tr>
              {columns.map((col) => {
                const active = sort?.key === col.key;
                const sortable = Boolean(col.sortable && onSortChange);
                return (
                  <th
                    key={col.key}
                    scope="col"
                    className={colClass(col)}
                    aria-sort={sortable ? ariaSort(active, sort?.dir) : undefined}
                    style={col.width ? { width: col.width } : undefined}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        className="ui-dt-sort"
                        onClick={() => onSortChange?.(col.key)}
                      >
                        <span>{col.header}</span>
                        <Chevron />
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          {loading ? (
            <tbody>
              {Array.from({ length: skeletonRows }, (_, r) => (
                <tr key={`skel-${r}`} className="ui-dt-skeleton">
                  {columns.map((col) => (
                    <td key={col.key} className={colClass(col)}>
                      <div className="ui-dt-skel-bar" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ) : rows.length === 0 ? (
            <tbody className="ui-dt-empty">
              <tr>
                <td colSpan={colCount}>{emptyState ?? 'Sin resultados'}</td>
              </tr>
            </tbody>
          ) : (
            <tbody>
              {rows.map((row, i) => {
                const detail = renderDetail?.(row);
                return (
                  <React.Fragment key={rowKey(row, i)}>
                    <tr
                      data-testid={rowTestId}
                      className={rowClassName?.(row)}
                      aria-selected={rowAriaSelected?.(row)}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                    >
                      {columns.map((col) => (
                        <td key={col.key} className={colClass(col)}>
                          {col.render ? col.render(row, i) : cellValue(row, col.key)}
                        </td>
                      ))}
                    </tr>
                    {detail != null && detail !== false && (
                      <tr className="ui-dt-detail">
                        <td colSpan={colCount}>{detail}</td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          )}
        </table>
      </div>

      {hasFooter && (
        <div className="ui-dt-footer">
          <div>{footer}</div>
          {pagination && <Pager {...pagination} />}
        </div>
      )}
    </div>
  );
}

function Pager({ page, pageSize, totalItems, onPageChange }: DataTablePagination) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const from = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);
  return (
    <div className="ui-dt-pager">
      <span>
        {from}–{to} de {totalItems}
      </span>
      <button
        type="button"
        className="ui-dt-pager-btn"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        aria-label="Página anterior"
      >
        ‹
      </button>
      <button
        type="button"
        className="ui-dt-pager-btn"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Página siguiente"
      >
        ›
      </button>
    </div>
  );
}
