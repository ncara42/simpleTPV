import * as React from 'react';

import { cn } from '../lib/cn.js';

// Componente de tabla ÚNICO (DESIGN_SYSTEM.md §10.11): carril de facetas + tabla
// agrupada. Es la pieza canónica para TODAS las tablas navegables del proyecto; sus
// variantes se activan por props (no hay tablas hardcodeadas). Cubre:
//   · agrupación plegable por grupo            (groups + collapsedKeys/onToggleGroup)
//   · selección múltiple con checkbox          (selectable + selectedKeys/onToggleSelect)
//   · tonos de fila                            (rowTone)            → p. ej. Existencias
//   · acciones/badges en celda                 (column.render)     → cualquier variante
//   · detalle expandible por fila (acordeón)   (renderDetail + expandedKeys/onToggleRow)
//   · chrome de card opcional                   (header/toolbar/footer + loading)
//   · layout 'card' (carril propio si hay search/sections) | 'table' (solo la tabla)
// Componente presentacional puro: el padre filtra/agrupa y pasa selección/manejadores.
// CSS en styles/faceted-table.css.

export type FacetColumnVariant = 'name' | 'mid' | 'num' | 'state';
export type FacetColumnWidth = 'mid' | 'num';

export interface FacetedColumn<Row> {
  key: string;
  header: React.ReactNode;
  render: (row: Row) => React.ReactNode;
  /** Estilo de celda: 'name' (indentada/bold; aloja el checkbox si selectable),
   *  'mid' (atenuada), 'num' (derecha, tabular), 'state' (badge a la derecha). */
  variant?: FacetColumnVariant;
  /** Ancho fijo de la columna vía <colgroup> (9rem 'mid' / 7rem 'num'). */
  width?: FacetColumnWidth;
  /** Clase extra del <th> (preserva el look exacto de una variante: cat-th-…). */
  thClassName?: string;
  /** Clase extra del <td> (preserva el look exacto: cat-cell-sku/pvp/…). */
  tdClassName?: string;
  /** Clase del <col> en <colgroup> (anchos a medida: cat-col-sku/pvp/…). */
  colClassName?: string;
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

/** Grupo de filas con cabecera plegable (label · meta · metaRight). */
export interface FacetedGroup<Row> {
  key: string;
  label: React.ReactNode;
  /** Texto auxiliar tras el título (p. ej. "3 tickets"). */
  meta?: React.ReactNode;
  /** Valor alineado a la derecha de la cabecera (p. ej. total del día). */
  metaRight?: React.ReactNode;
  rows: Row[];
}

export type FacetedTableLayout = 'card' | 'table';

export interface FacetedTableProps<Row> {
  columns: FacetedColumn<Row>[];
  groups: FacetedGroup<Row>[];
  rowKey: (row: Row) => string;
  onRowClick?: (row: Row) => void;
  rowTestId?: string;
  /** Clase extra por fila (tonos de estado: 'is-low' | 'is-out' …). */
  rowTone?: (row: Row) => string | undefined;
  /** Atributos DOM extra por fila (p. ej. { 'data-product': id }). */
  rowProps?: (row: Row) => Record<string, string | number | undefined>;
  /** Buscador del carril (solo layout 'card'). Si falta, no se pinta. */
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    testId?: string;
  };
  /** Secciones del carril (solo layout 'card'). Si no hay search ni secciones,
   *  el carril se omite y la tabla agrupada ocupa toda la card. */
  sections?: FacetSection[];
  /** Slot de cabecera de la card, sobre el toolbar (p. ej. sub-pestañas). Solo 'card'. */
  header?: React.ReactNode;
  /** Slot de toolbar (filtros/acciones), bajo la cabecera. Solo layout 'card'. */
  toolbar?: React.ReactNode;
  /** Slot de pie (totales/agregados) al fondo de la card. Solo layout 'card'. */
  footer?: React.ReactNode;
  /** Muestra filas skeleton (sin desmontar la tabla) mientras se cargan datos. */
  loading?: boolean;
  /** Nº de filas skeleton al cargar (def. 8). */
  skeletonRows?: number;
  /** Grupos plegados (key) + manejador. Si falta el manejador, no son plegables. */
  collapsedKeys?: ReadonlySet<string>;
  onToggleGroup?: (key: string) => void;
  /** Selección múltiple: pinta un checkbox-overlay en la columna 'name'. */
  selectable?: boolean;
  selectedKeys?: ReadonlySet<string>;
  onToggleSelect?: (key: string) => void;
  /** data-testid del checkbox de fila (p. ej. 'product-select'). */
  selectTestId?: string;
  /** aria-label del checkbox de fila por fila (p. ej. `Seleccionar ${nombre}`). */
  selectAriaLabel?: (row: Row) => string;
  /** Detalle expandible (acordeón) por fila. Requiere expandedKeys + onToggleRow. */
  renderDetail?: (row: Row) => React.ReactNode;
  expandedKeys?: ReadonlySet<string>;
  onToggleRow?: (key: string) => void;
  emptyState?: React.ReactNode;
  /** 'card' (def.): card + carril + tabla. 'table': solo la <table> (la página aporta
   *  su propio contenedor/carril/scroll, p. ej. ScrollShadowCell.cat-main). */
  layout?: FacetedTableLayout;
  railLabel?: string;
  railTestId?: string;
  mainTestId?: string;
  /** Clase raíz extra (layout 'card': wrapper de página; 'table': la <table>). */
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
  rowTone,
  rowProps,
  search,
  sections = [],
  header,
  toolbar,
  footer,
  loading = false,
  skeletonRows = 8,
  collapsedKeys,
  onToggleGroup,
  selectable = false,
  selectedKeys,
  onToggleSelect,
  selectTestId,
  selectAriaLabel,
  renderDetail,
  expandedKeys,
  onToggleRow,
  emptyState,
  layout = 'card',
  railLabel,
  railTestId,
  mainTestId,
  className,
}: FacetedTableProps<Row>) {
  const colCount = columns.length;
  const collapsible = onToggleGroup != null;
  const expandable = renderDetail != null && onToggleRow != null;
  const hasRail = search != null || sections.length > 0;

  const rowClickHandler = (row: Row, key: string): (() => void) | undefined => {
    if (expandable) return () => onToggleRow(key);
    if (onRowClick) return () => onRowClick(row);
    if (selectable && onToggleSelect) return () => onToggleSelect(key);
    return undefined;
  };

  // Cuerpo skeleton (no desmonta la tabla): filas atenuadas con barra shimmer.
  const skeletonBody = (
    <tbody>
      {Array.from({ length: skeletonRows }, (_, r) => (
        <tr key={`skel-${r}`} className="cat-row cat-row--skel">
          {columns.map((col) => (
            <td key={col.key} className={cn(TD_CLASS[col.variant ?? 'mid'], col.tdClassName)}>
              <span className="cat-skel-bar" />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );

  const table = (
    <table className={cn('cat-table', layout === 'table' && className)}>
      <colgroup>
        {columns.map((col) => (
          <col key={col.key} className={cn(col.width && COL_CLASS[col.width], col.colClassName)} />
        ))}
      </colgroup>
      <thead className="cat-thead">
        <tr>
          {columns.map((col) => (
            <th key={col.key} className={cn(TH_CLASS[col.variant ?? 'mid'], col.thClassName)}>
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      {loading
        ? skeletonBody
        : groups.map((group) => {
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
                  group.rows.map((row) => {
                    const key = rowKey(row);
                    const selected = selectable && (selectedKeys?.has(key) ?? false);
                    const expanded = expandable && (expandedKeys?.has(key) ?? false);
                    const detail = expandable ? renderDetail(row) : null;
                    const onClick = rowClickHandler(row, key);
                    return (
                      <React.Fragment key={key}>
                        <tr
                          className={cn(
                            'cat-row',
                            rowTone?.(row),
                            selected && 'is-selected',
                            expandable && 'cat-row--expandable',
                            expanded && 'is-expanded',
                          )}
                          data-testid={rowTestId}
                          aria-selected={selectable ? selected : undefined}
                          aria-expanded={expandable ? expanded : undefined}
                          onClick={onClick}
                          {...(rowProps?.(row) ?? {})}
                        >
                          {columns.map((col) => {
                            const variant = col.variant ?? 'mid';
                            return (
                              <td key={col.key} className={cn(TD_CLASS[variant], col.tdClassName)}>
                                {variant === 'name' && selectable && (
                                  <input
                                    type="checkbox"
                                    className="cat-row-check"
                                    checked={selected}
                                    onChange={() => onToggleSelect?.(key)}
                                    onClick={(e) => e.stopPropagation()}
                                    data-testid={selectTestId}
                                    aria-label={selectAriaLabel?.(row) ?? 'Seleccionar fila'}
                                  />
                                )}
                                {col.render(row)}
                              </td>
                            );
                          })}
                        </tr>
                        {detail != null && detail !== false && expanded && (
                          <tr className="cat-detail-row">
                            <td colSpan={colCount}>{detail}</td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
              </tbody>
            );
          })}
    </table>
  );

  const empty =
    !loading && groups.length === 0 ? <div className="cat-empty">{emptyState}</div> : null;

  // Layout 'table': solo la tabla + vacío; la página aporta carril/contenedor/scroll.
  if (layout === 'table') {
    return (
      <>
        {table}
        {empty}
      </>
    );
  }

  // Layout 'card': card con chrome opcional (header/toolbar/footer), carril propio
  // (búsqueda + secciones) SOLO si se aportan, y la tabla agrupada.
  return (
    <div className={cn('faceted-table', className)}>
      <div className="faceted-table-card">
        {header != null && <div className="cat-card-header">{header}</div>}
        {toolbar != null && <div className="cat-card-toolbar">{toolbar}</div>}
        <div className={cn('cat-layout', !hasRail && 'cat-layout--norail')}>
          {hasRail && (
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
          )}

          <div className="cat-main" data-testid={mainTestId}>
            {table}
            {empty}
          </div>
        </div>
        {footer != null && <div className="cat-card-footer">{footer}</div>}
      </div>
    </div>
  );
}
