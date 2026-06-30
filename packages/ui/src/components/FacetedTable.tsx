import * as React from 'react';

import { cn } from '../lib/cn.js';

// Vista facetada reutilizable (DESIGN_SYSTEM.md §10.11): carril de facetas a la
// izquierda + tabla agrupada a la derecha dentro de UNA card. Es el lenguaje del
// Catálogo del backoffice generalizado para cualquier listado navegable (tickets,
// pedidos…). Componente presentacional puro: el padre filtra/agrupa y pasa los
// recuentos, la selección y los manejadores. CSS en styles/faceted-table.css.

export type FacetColumnVariant = 'name' | 'mid' | 'num' | 'state';
export type FacetColumnWidth = 'mid' | 'num';

export interface FacetedColumn<Row> {
  key: string;
  header: React.ReactNode;
  render: (row: Row) => React.ReactNode;
  /** Estilo de celda: 'name' (indentada/bold), 'mid' (atenuada), 'num' (derecha,
   *  tabular), 'state' (badge a la derecha). Por defecto 'mid'. */
  variant?: FacetColumnVariant;
  /** Ancho fijo de la columna vía <colgroup> (9rem 'mid' / 7rem 'num'). */
  width?: FacetColumnWidth;
}

/** Sección de "vistas" (selección única, fila azul activa). */
export interface FacetViewsSection {
  kind: 'views';
  title?: string;
  options: ReadonlyArray<{ key: string; label: string; count?: number }>;
  active: string;
  onSelect: (key: string) => void;
  testIdPrefix?: string;
}

/** Sección de facetas multi-selección (checkbox + etiqueta + contador). */
export interface FacetChecksSection {
  kind: 'checks';
  title: string;
  options: ReadonlyArray<{ key: string; label: string; count?: number; color?: string }>;
  selected: ReadonlySet<string>;
  onToggle: (key: string) => void;
  testIdPrefix?: string;
}

export type FacetSection = FacetViewsSection | FacetChecksSection;

/** Grupo de filas con cabecera plegable (fecha · meta · metaRight). */
export interface FacetedGroup<Row> {
  key: string;
  label: React.ReactNode;
  /** Texto auxiliar tras el título (p. ej. "3 tickets"). */
  meta?: React.ReactNode;
  /** Valor alineado a la derecha de la cabecera (p. ej. total del día). */
  metaRight?: React.ReactNode;
  rows: Row[];
}

export interface FacetedTableProps<Row> {
  columns: FacetedColumn<Row>[];
  groups: FacetedGroup<Row>[];
  rowKey: (row: Row) => string;
  onRowClick?: (row: Row) => void;
  rowTestId?: string;
  /** Buscador del carril. Si falta, no se pinta. */
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    testId?: string;
  };
  sections: FacetSection[];
  /** Grupos plegados (key) + manejador. Si falta el manejador, no son plegables. */
  collapsedKeys?: ReadonlySet<string>;
  onToggleGroup?: (key: string) => void;
  emptyState?: React.ReactNode;
  railLabel?: string;
  railTestId?: string;
  mainTestId?: string;
  /** Clase extra del wrapper de página (p. ej. para acotar el alto). */
  className?: string;
}

const TH_CLASS: Record<FacetColumnVariant, string> = {
  name: 'cat-th cat-th-name',
  mid: 'cat-th',
  num: 'cat-th cat-th-num',
  state: 'cat-th cat-th-num',
};
const TD_CLASS: Record<FacetColumnVariant, string> = {
  name: 'cat-cell-name',
  mid: 'cat-cell-mid',
  num: 'cat-cell-num',
  state: 'cat-cell-state',
};
const COL_CLASS: Record<FacetColumnWidth, string> = {
  mid: 'cat-col-mid',
  num: 'cat-col-num',
};

function Caret({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      className={cn('cat-group-caret', collapsed && 'is-collapsed')}
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function ViewsSection({ section }: { section: FacetViewsSection }) {
  const prefix = section.testIdPrefix;
  return (
    <section className="cat-facet">
      {section.title && <h3 className="cat-facet-title">{section.title}</h3>}
      {section.options.map((opt) => {
        const active = section.active === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            className={cn('cat-view', active && 'is-active')}
            aria-pressed={active}
            onClick={() => section.onSelect(opt.key)}
            data-testid={prefix ? `${prefix}-${opt.key}` : undefined}
          >
            <span className="cat-view-label">{opt.label}</span>
            {opt.count !== undefined && <span className="cat-view-count">{opt.count}</span>}
          </button>
        );
      })}
    </section>
  );
}

function ChecksSection({ section }: { section: FacetChecksSection }) {
  const prefix = section.testIdPrefix;
  return (
    <section className="cat-facet">
      <h3 className="cat-facet-title">{section.title}</h3>
      {section.options.map((opt) => {
        const checked = section.selected.has(opt.key);
        return (
          <label key={opt.key} className={cn('cat-facet-opt', checked && 'is-checked')}>
            <input
              type="checkbox"
              className="cat-facet-input"
              checked={checked}
              onChange={() => section.onToggle(opt.key)}
              data-testid={prefix ? `${prefix}-${opt.key}` : undefined}
            />
            <span className="cat-check" aria-hidden="true" />
            <span className="cat-facet-label" style={opt.color ? { color: opt.color } : undefined}>
              {opt.label}
            </span>
            {opt.count !== undefined && <span className="cat-facet-count">{opt.count}</span>}
          </label>
        );
      })}
    </section>
  );
}

export function FacetedTable<Row>({
  columns,
  groups,
  rowKey,
  onRowClick,
  rowTestId = 'faceted-row',
  search,
  sections,
  collapsedKeys,
  onToggleGroup,
  emptyState,
  railLabel,
  railTestId,
  mainTestId,
  className,
}: FacetedTableProps<Row>) {
  const colCount = columns.length;
  const collapsible = onToggleGroup != null;

  return (
    <div className={cn('faceted-table', className)}>
      <div className="faceted-table-card">
        <div className="cat-layout">
          <aside className="cat-rail" aria-label={railLabel} data-testid={railTestId}>
            {search && (
              <span className="search-field cat-rail-search">
                <input
                  className="catalog-search"
                  value={search.value}
                  onChange={(e) => search.onChange(e.target.value)}
                  placeholder={search.placeholder}
                  data-testid={search.testId}
                />
              </span>
            )}
            {sections.map((section, i) =>
              section.kind === 'views' ? (
                <ViewsSection key={section.title ?? i} section={section} />
              ) : (
                <ChecksSection key={section.title} section={section} />
              ),
            )}
          </aside>

          <div className="cat-main" data-testid={mainTestId}>
            <table className="cat-table">
              <colgroup>
                {columns.map((col) => (
                  <col key={col.key} className={col.width ? COL_CLASS[col.width] : undefined} />
                ))}
              </colgroup>
              <thead className="cat-thead">
                <tr>
                  {columns.map((col) => (
                    <th key={col.key} className={TH_CLASS[col.variant ?? 'mid']}>
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              {groups.map((group) => {
                const isCollapsed = collapsedKeys?.has(group.key) ?? false;
                return (
                  <tbody key={group.key} className="cat-group">
                    <tr
                      className="cat-group-head"
                      onClick={collapsible ? () => onToggleGroup(group.key) : undefined}
                    >
                      <td className="cat-group-cell" colSpan={colCount}>
                        <div className="cat-group-inner">
                          {collapsible && <Caret collapsed={isCollapsed} />}
                          <span className="cat-group-name">{group.label}</span>
                          {group.meta !== undefined && (
                            <span className="cat-group-count">{group.meta}</span>
                          )}
                          {group.metaRight !== undefined && (
                            <span className="cat-group-units">{group.metaRight}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                    {!isCollapsed &&
                      group.rows.map((row) => (
                        <tr
                          key={rowKey(row)}
                          className="cat-row"
                          data-testid={rowTestId}
                          onClick={onRowClick ? () => onRowClick(row) : undefined}
                        >
                          {columns.map((col) => (
                            <td key={col.key} className={TD_CLASS[col.variant ?? 'mid']}>
                              {col.render(row)}
                            </td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                );
              })}
            </table>
            {groups.length === 0 && <div className="cat-empty">{emptyState}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
