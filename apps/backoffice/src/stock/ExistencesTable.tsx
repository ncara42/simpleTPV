import { ArrowLeftRight, ChevronDown, Pencil } from 'lucide-react';
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

// Tabla de Existencias agrupada por familia raíz. Cabecera fija; una cabecera por grupo
// (nombre · nº productos · total de unidades del ámbito) plegable; y
// filas de producto con rotación, mínimo, disponible (badge en color y accionable),
// estado y acciones en línea (traspasar cuando falta stock · ajustar). El nivel se
// calcula en el ámbito activo (una tienda o todas).

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

  const isEmpty = groups.length === 0;

  return (
    <ScrollShadowCell className="cat-main ex-main" data-testid="stock-table">
      <table className="ex-table">
        <colgroup>
          <col className="ex-col-name" />
          <col className="ex-col-rot" />
          <col className="ex-col-min" />
          <col className="ex-col-disp" />
          <col className="ex-col-state" />
          <col className="ex-col-act" />
        </colgroup>
        <thead className="ex-thead">
          <tr>
            <th className="ex-th ex-th-name">Producto</th>
            <th className="ex-th">Rotación</th>
            <th className="ex-th ex-th-num">Mínimo</th>
            <th className="ex-th ex-th-num">Disponible</th>
            <th className="ex-th">Estado</th>
            <th className="ex-th ex-th-num">Acciones</th>
          </tr>
        </thead>
        {groups.map((group) => {
          const key = group.family?.id ?? '__none__';
          const isCollapsed = collapsed.has(key);
          return (
            <tbody key={key} className="ex-group">
              <tr className="ex-group-head" onClick={() => toggleGroup(key)}>
                <td className="ex-group-cell" colSpan={6}>
                  <div className="ex-group-inner">
                    <ChevronDown
                      size={13}
                      className={`ex-group-caret${isCollapsed ? ' is-collapsed' : ''}`}
                      aria-hidden="true"
                    />
                    <span className="ex-group-name">{group.family?.name ?? 'Sin familia'}</span>
                    <span className="ex-group-count">
                      {group.rows.length} {group.rows.length === 1 ? 'producto' : 'productos'}
                    </span>
                    <span className="ex-group-units">{group.totalUnits} uds.</span>
                  </div>
                </td>
              </tr>
              {!isCollapsed &&
                group.rows.map((row) => (
                  <ExistencesRow
                    key={row.productId}
                    row={row}
                    scope={scope}
                    onAdjust={onAdjust}
                    onTransfer={onTransfer}
                  />
                ))}
            </tbody>
          );
        })}
      </table>
      {isEmpty && <div className="cat-empty ex-empty">{empty}</div>}
    </ScrollShadowCell>
  );
}

interface ExistencesRowProps {
  row: ExRow;
  scope: Scope;
  onAdjust: (row: ExRow) => void;
  onTransfer: (row: ExRow) => void;
}

function ExistencesRow({ row, scope, onAdjust, onTransfer }: ExistencesRowProps) {
  const { disp, min, level } = scopeOf(row, scope);
  const showTransfer = level !== 'ok';
  // Fila teñida según el estado del ámbito: ámbar (bajo mínimo) o rojo (sin stock).
  const levelClass = level === 'low' ? ' is-low' : level === 'out' ? ' is-out' : '';

  return (
    <tr className={`ex-row${levelClass}`} data-testid="stock-row" data-product={row.productId}>
      <td className="ex-cell-name">{row.name}</td>
      <td className="ex-cell-rot">{ROTATION_LABELS[row.rotation]}</td>
      <td className="ex-cell-min">{min}</td>
      <td className="ex-cell-disp">
        <button
          type="button"
          className={`cat-stock-badge cat-stock-${level} ex-disp`}
          title="Ajustar existencias"
          onClick={() => onAdjust(row)}
          data-testid="stock-disp"
        >
          {disp}
        </button>
      </td>
      <td className="ex-cell-state">
        <span className={`ex-state ex-state-${level}`}>
          <span className="ex-state-dot" aria-hidden="true" />
          {LEVEL_LABELS[level]}
        </span>
      </td>
      <td className="ex-cell-act">
        <span className="ex-act" style={showTransfer ? { opacity: 1 } : undefined}>
          {showTransfer && (
            <button
              type="button"
              className="ex-act-btn"
              title="Traspasar a esta tienda"
              onClick={() => onTransfer(row)}
              data-testid="existences-transfer"
            >
              {/* El glifo de doble flecha llena menos su viewBox que el lápiz; 16px lo
                  equilibra ópticamente con el lápiz de 14px (mismo botón 28px). */}
              <ArrowLeftRight size={16} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className="ex-act-btn is-primary"
            title="Ajustar existencias"
            onClick={() => onAdjust(row)}
            data-testid="existences-adjust"
          >
            <Pencil size={14} aria-hidden="true" />
          </button>
        </span>
      </td>
    </tr>
  );
}
