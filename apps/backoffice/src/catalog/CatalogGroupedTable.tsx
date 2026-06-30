import { type FacetedColumn, FacetedTable } from '@simpletpv/ui';
import { type ReactNode, useState } from 'react';

import { ScrollShadowCell } from '../components/ScrollShadowCell.js';
import { fmtEur } from '../lib/format.js';
import type { Product } from '../lib/products.js';
import { type CatalogGroup, LOW_MARGIN_THRESHOLD } from './facets.js';

// Tabla del Catálogo: variante del componente único (FacetedTable) con selección por
// checkbox, agrupada por familia raíz. Cabecera fija, una cabecera por grupo (familia ·
// nº productos · total de unidades) plegable, y filas con PVP, margen y tag de stock
// cuyo color SOLO aparece cuando importa (bajo/agotado). El carril de facetas y el
// contenedor con scroll (ScrollShadowCell.cat-main) los aporta la página.

type CatalogRow = CatalogGroup['rows'][number];

const COLUMNS: FacetedColumn<CatalogRow>[] = [
  {
    key: 'name',
    header: 'Producto',
    variant: 'name',
    colClassName: 'cat-col-name',
    render: (r) => r.product.name,
  },
  {
    key: 'sku',
    header: 'SKU',
    variant: 'mid',
    colClassName: 'cat-col-sku',
    tdClassName: 'cat-cell-sku',
    render: (r) => r.product.sku ?? '—',
  },
  {
    key: 'pvp',
    header: 'PVP',
    variant: 'num',
    colClassName: 'cat-col-pvp',
    tdClassName: 'cat-cell-pvp',
    render: (r) => fmtEur(Number(r.product.salePrice)),
  },
  {
    key: 'margin',
    header: 'Margen',
    variant: 'num',
    colClassName: 'cat-col-margin',
    tdClassName: 'cat-cell-margin',
    render: (r) => <MarginTag value={r.margin} />,
  },
  {
    key: 'stock',
    header: 'Stock',
    variant: 'num',
    colClassName: 'cat-col-stock',
    tdClassName: 'cat-cell-stock',
    render: (r) => (
      <span className={`cat-stock-badge cat-stock-${r.state}`} data-testid="catalog-stock">
        {r.stock}
      </span>
    ),
  },
];

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

  const fgroups = groups.map((g) => ({
    key: g.family?.id ?? '__none__',
    label: g.family?.name ?? 'Sin familia',
    meta: `${g.rows.length} ${g.rows.length === 1 ? 'producto' : 'productos'}`,
    metaRight: `${g.totalUnits} uds.`,
    rows: g.rows,
  }));

  return (
    <ScrollShadowCell className="cat-main" data-testid="catalog-table">
      <FacetedTable<CatalogRow>
        layout="table"
        groups={fgroups}
        columns={COLUMNS}
        rowKey={(r) => r.product.id}
        collapsedKeys={collapsed}
        onToggleGroup={toggleGroup}
        selectable
        selectedKeys={selected}
        onToggleSelect={onToggleSelect}
        selectTestId="product-select"
        selectAriaLabel={(r) => `Seleccionar ${r.product.name}`}
        onRowClick={(r) => onRowClick(r.product)}
        emptyState={empty}
      />
    </ScrollShadowCell>
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
