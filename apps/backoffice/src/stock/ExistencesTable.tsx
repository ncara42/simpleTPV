import { type FacetedColumn, FacetedTable } from '@simpletpv/ui';
import { ArrowLeftRight, Pencil } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { ScrollShadowCell } from '../components/ScrollShadowCell.js';
import {
  type ExGroup,
  type ExRow,
  LEVEL_LABELS,
  ROTATION_LABELS,
  type Scope,
  scopeOf,
} from './existences.js';

// Tabla de Existencias: variante del componente único (FacetedTable) agrupada por
// familia raíz, con tonos de fila por nivel de stock (ámbar bajo mínimo · rojo sin
// stock), badge de disponible accionable y acciones en línea (traspasar cuando falta
// stock · ajustar). El nivel se calcula en el ámbito activo (una tienda o todas). El
// carril de facetas y el contenedor con scroll (ScrollShadowCell.cat-main) los aporta
// la página.

interface ExistencesTableProps {
  groups: ExGroup[];
  scope: Scope;
  onAdjust: (row: ExRow) => void;
  onTransfer: (row: ExRow) => void;
  empty: ReactNode;
}

export function ExistencesTable({
  groups,
  scope,
  onAdjust,
  onTransfer,
  empty,
}: ExistencesTableProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggleGroup = (key: string): void =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const columns: FacetedColumn<ExRow>[] = [
    {
      key: 'name',
      header: 'Producto',
      variant: 'name',
      colClassName: 'ex-col-name',
      render: (r) => r.name,
    },
    {
      key: 'rot',
      header: 'Rotación',
      variant: 'mid',
      colClassName: 'ex-col-rot',
      tdClassName: 'ex-cell-rot',
      render: (r) => ROTATION_LABELS[r.rotation],
    },
    {
      key: 'min',
      header: 'Mínimo',
      variant: 'num',
      colClassName: 'ex-col-min',
      render: (r) => scopeOf(r, scope).min,
    },
    {
      key: 'disp',
      header: 'Disponible',
      variant: 'num',
      colClassName: 'ex-col-disp',
      render: (r) => {
        const { disp, level } = scopeOf(r, scope);
        return (
          <button
            type="button"
            className={`cat-stock-badge cat-stock-${level} ex-disp`}
            title="Ajustar existencias"
            onClick={() => onAdjust(r)}
            data-testid="stock-disp"
          >
            {disp}
          </button>
        );
      },
    },
    {
      key: 'state',
      header: 'Estado',
      variant: 'mid',
      colClassName: 'ex-col-state',
      render: (r) => {
        const { level } = scopeOf(r, scope);
        return (
          <span className={`ex-state ex-state-${level}`}>
            <span className="ex-state-dot" aria-hidden="true" />
            {LEVEL_LABELS[level]}
          </span>
        );
      },
    },
    {
      key: 'act',
      header: 'Acciones',
      variant: 'num',
      colClassName: 'ex-col-act',
      render: (r) => {
        const { level } = scopeOf(r, scope);
        const showTransfer = level !== 'ok';
        return (
          <span className="ex-act" style={showTransfer ? { opacity: 1 } : undefined}>
            {showTransfer && (
              <button
                type="button"
                className="ex-act-btn"
                title="Traspasar a esta tienda"
                onClick={() => onTransfer(r)}
                data-testid="existences-transfer"
              >
                {/* El glifo de doble flecha llena menos su viewBox que el lápiz; 16px lo
                    equilibra ópticamente con el lápiz de 14px (mismo botón). */}
                <ArrowLeftRight size={16} aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              className="ex-act-btn is-primary"
              title="Ajustar existencias"
              onClick={() => onAdjust(r)}
              data-testid="existences-adjust"
            >
              <Pencil size={14} aria-hidden="true" />
            </button>
          </span>
        );
      },
    },
  ];

  const fgroups = groups.map((g) => ({
    key: g.family?.id ?? '__none__',
    label: g.family?.name ?? 'Sin familia',
    meta: `${g.rows.length} ${g.rows.length === 1 ? 'producto' : 'productos'}`,
    metaRight: `${g.totalUnits} uds.`,
    rows: g.rows,
  }));

  const rowTone = (r: ExRow): string | undefined => {
    const { level } = scopeOf(r, scope);
    return level === 'low' ? 'is-low' : level === 'out' ? 'is-out' : undefined;
  };

  return (
    <ScrollShadowCell className="cat-main ex-main" data-testid="stock-table">
      <FacetedTable<ExRow>
        layout="table"
        groups={fgroups}
        columns={columns}
        rowKey={(r) => r.productId}
        rowTestId="stock-row"
        rowTone={rowTone}
        rowProps={(r) => ({ 'data-product': r.productId })}
        collapsedKeys={collapsed}
        onToggleGroup={toggleGroup}
        emptyState={empty}
      />
    </ScrollShadowCell>
  );
}
