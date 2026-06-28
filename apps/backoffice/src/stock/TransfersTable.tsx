import type { Transfer } from '@simpletpv/auth';
import { ChevronDown } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { ScrollShadowCell } from '../components/ScrollShadowCell.js';
import {
  buildRow,
  type StoreNameResolver,
  type TransferActionKind,
  type TransferGroup,
} from './transfer-view.js';

// Tabla de Traspasos agrupada por estado (Borradores · En tránsito · Recibidos ·
// Cerrados). Cabecera fija; una cabecera por grupo (punto de estado · nombre · nº ·
// total de uds) plegable; filas con nombre+ruta, líneas, fecha, píldora de unidades
// teñida por estado y la acción real en línea. Al pulsar una fila se abre la ficha.

interface TransfersTableProps {
  groups: TransferGroup[];
  nameOf: StoreNameResolver;
  count: number;
  sortDesc: boolean;
  onToggleSort: () => void;
  onOpen: (transfer: Transfer) => void;
  onAction: (kind: TransferActionKind, transfer: Transfer) => void;
  /** id del traspaso con una mutación en vuelo (deshabilita su acción). */
  pendingId: string | null;
  empty: ReactNode;
}

export function TransfersTable({
  groups,
  nameOf,
  count,
  sortDesc,
  onToggleSort,
  onOpen,
  onAction,
  pendingId,
  empty,
}: TransfersTableProps) {
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
    <div className="tr-main">
      <div className="tr-tablebar">
        <span className="tr-count" data-testid="transfers-count">
          {count} {count === 1 ? 'traspaso' : 'traspasos'}
        </span>
        <button
          type="button"
          className="tr-sort"
          onClick={onToggleSort}
          data-testid="transfers-sort"
        >
          {sortDesc ? 'Recientes ↓' : 'Antiguos ↑'}
        </button>
      </div>

      <ScrollShadowCell className="tr-scroll" data-testid="transfers-table">
        {isEmpty ? (
          <div className="tr-empty" data-testid="transfers-empty">
            {empty}
          </div>
        ) : (
          <table className="tr-table">
            <colgroup>
              <col />
              <col className="tr-col-lines" />
              <col className="tr-col-created" />
              <col className="tr-col-units" />
              <col className="tr-col-act" />
            </colgroup>
            <thead className="tr-thead">
              <tr>
                <th className="tr-th-name">Traspaso</th>
                <th className="tr-th-num">Líneas</th>
                <th>Creado</th>
                <th className="tr-th-num">Unidades</th>
                <th className="tr-th-num" aria-label="Acciones" />
              </tr>
            </thead>
            {groups.map((group) => {
              const isCollapsed = collapsed.has(group.key);
              return (
                <tbody key={group.key}>
                  <tr className="tr-group-head" onClick={() => toggleGroup(group.key)}>
                    <td className="tr-group-cell" colSpan={5}>
                      <div className="tr-group-inner">
                        <ChevronDown
                          size={14}
                          className={`tr-group-caret${isCollapsed ? ' is-collapsed' : ''}`}
                          aria-hidden="true"
                        />
                        <span className={`tr-group-dot tr-dot--${group.tone}`} aria-hidden="true" />
                        <span className="tr-group-name">{group.label}</span>
                        <span className="tr-group-count">
                          · {group.count} {group.count === 1 ? 'traspaso' : 'traspasos'}
                        </span>
                        <span className="tr-group-units">{group.unitsLabel}</span>
                      </div>
                    </td>
                  </tr>
                  {!isCollapsed &&
                    group.rows.map((transfer) => (
                      <TransferRow
                        key={transfer.id}
                        transfer={transfer}
                        nameOf={nameOf}
                        onOpen={onOpen}
                        onAction={onAction}
                        pending={pendingId === transfer.id}
                      />
                    ))}
                </tbody>
              );
            })}
          </table>
        )}
      </ScrollShadowCell>
    </div>
  );
}

interface TransferRowProps {
  transfer: Transfer;
  nameOf: StoreNameResolver;
  onOpen: (transfer: Transfer) => void;
  onAction: (kind: TransferActionKind, transfer: Transfer) => void;
  pending: boolean;
}

function TransferRow({ transfer, nameOf, onOpen, onAction, pending }: TransferRowProps) {
  const row = buildRow(transfer, nameOf);
  return (
    <tr className="tr-row" data-testid="transfer-row" onClick={() => onOpen(transfer)}>
      <td className="tr-cell-name">
        <div className="tr-name-wrap">
          <span className="tr-name" data-testid="transfer-name-cell">
            {row.name}
          </span>
          <span className="tr-route">{row.route}</span>
        </div>
      </td>
      <td className="tr-cell-lines">{row.linesLabel}</td>
      <td className="tr-cell-created">{row.createdLabel}</td>
      <td className="tr-cell-units">
        <span className={`tr-badge tr-badge--${row.tone}`} data-testid="transfer-units">
          {row.unitsLabel}
        </span>
      </td>
      <td className="tr-cell-act">
        {row.action && (
          <button
            type="button"
            className="tr-action"
            disabled={pending}
            onClick={(e) => {
              e.stopPropagation();
              if (row.action) onAction(row.action.kind, transfer);
            }}
            data-testid="transfer-action"
          >
            {row.action.label}
          </button>
        )}
      </td>
    </tr>
  );
}
