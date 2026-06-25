import { ChevronDown } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { fmtEur } from '../lib/format.js';
import type { Product } from '../lib/products.js';
import { type CatalogGroup, LOW_MARGIN_THRESHOLD } from './facets.js';

// Tabla del Catálogo agrupada por familia raíz. Cabecera fija, una cabecera por grupo
// (familia · nº productos · total de unidades) plegable, y filas de producto con
// PVP, margen y un tag de stock cuyo color SOLO aparece cuando importa (bajo/agotado).

interface CatalogGroupedTableProps {
  groups: CatalogGroup[];
  selected: ReadonlySet<string>;
  onToggleSelect: (id: string) => void;
  onRowClick: (product: Product) => void;
  empty: ReactNode;
}

export function CatalogGroupedTable({
  groups,
  selected,
  onToggleSelect,
  onRowClick,
  empty,
}: CatalogGroupedTableProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggleGroup = (key: string): void =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const isEmpty = groups.length === 0;

  return (
    <div className="cat-main" data-testid="catalog-table">
      <table className="cat-table">
        <colgroup>
          <col className="cat-col-check" />
          <col className="cat-col-name" />
          <col className="cat-col-sku" />
          <col className="cat-col-pvp" />
          <col className="cat-col-margin" />
          <col className="cat-col-stock" />
        </colgroup>
        <thead className="cat-thead">
          <tr>
            <th aria-hidden="true" />
            <th className="cat-th cat-th-name">Producto</th>
            <th className="cat-th">SKU</th>
            <th className="cat-th cat-th-num">PVP</th>
            <th className="cat-th cat-th-num">Margen</th>
            <th className="cat-th cat-th-num">Stock</th>
          </tr>
        </thead>
        {groups.map((group) => {
          const key = group.family?.id ?? '__none__';
          const isCollapsed = collapsed.has(key);
          return (
            <tbody key={key} className="cat-group">
              <tr className="cat-group-head" onClick={() => toggleGroup(key)}>
                <td className="cat-group-cell" colSpan={6}>
                  <div className="cat-group-inner">
                    <ChevronDown
                      size={15}
                      className={`cat-group-caret${isCollapsed ? ' is-collapsed' : ''}`}
                      aria-hidden="true"
                    />
                    <span
                      className="cat-group-dot"
                      style={{ background: group.family?.color ?? 'var(--ui-text-soft)' }}
                    />
                    <span className="cat-group-name">{group.family?.name ?? 'Sin familia'}</span>
                    <span className="cat-group-count">
                      {group.rows.length} {group.rows.length === 1 ? 'producto' : 'productos'}
                    </span>
                    <span className="cat-group-units">{group.totalUnits} uds.</span>
                  </div>
                </td>
              </tr>
              {!isCollapsed &&
                group.rows.map((row) => {
                  const { product } = row;
                  const isSelected = selected.has(product.id);
                  return (
                    <tr
                      key={product.id}
                      className={`cat-row${isSelected ? ' is-selected' : ''}`}
                      onClick={() => onRowClick(product)}
                      aria-selected={isSelected}
                    >
                      <td className="cat-cell-check">
                        <input
                          type="checkbox"
                          className="cat-row-check"
                          aria-label={`Seleccionar ${product.name}`}
                          data-testid="product-select"
                          checked={isSelected}
                          onChange={() => onToggleSelect(product.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td className="cat-cell-name">{product.name}</td>
                      <td className="cat-cell-sku">{product.sku ?? '—'}</td>
                      <td className="cat-cell-pvp">{fmtEur(Number(product.salePrice))}</td>
                      <td className="cat-cell-margin">
                        <MarginTag value={row.margin} />
                      </td>
                      <td className="cat-cell-stock">
                        <span
                          className={`cat-stock-badge cat-stock-${row.state}`}
                          data-testid="catalog-stock"
                        >
                          {row.stock}
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          );
        })}
      </table>
      {isEmpty && <div className="cat-empty">{empty}</div>}
    </div>
  );
}

function MarginTag({ value }: { value: number | null }) {
  if (value == null)
    return (
      <span className="cat-margin cat-margin-none" data-testid="catalog-margin">
        —
      </span>
    );
  const tone = value < LOW_MARGIN_THRESHOLD ? 'low' : 'ok';
  return (
    <span className={`cat-margin cat-margin-${tone}`} data-testid="catalog-margin">
      {value}%
    </span>
  );
}
