import type { Transfer } from '@simpletpv/auth';
import { ChevronDown, ChevronRight, MessageCircle } from 'lucide-react';
import { type ReactNode, useState } from 'react';

/** Datos para abrir el chat de un traspaso desde una fila. */
export interface TransferChatTarget {
  id: string;
  title: string;
  subtitle: string;
  /** Hay incidencia abierta → el chat ofrece marcarla como solucionada. */
  incidentOpen: boolean;
}

import { ScrollShadowCell } from '../components/ScrollShadowCell.js';
import {
  buildRow,
  buildTransferDetail,
  isIncidentOpen,
  type ProductResolver,
  type StoreNameResolver,
  type TransferActionKind,
  type TransferGroup,
} from './transfer-view.js';
import { TransferRowDetail } from './TransferRowDetail.js';

// Tabla de Traspasos agrupada por estado (Borradores · En tránsito · Recibidos ·
// Cerrados). Cabecera fija; cabeceras de grupo plegables; filas con referencia + nota,
// ruta, líneas, fecha y píldora de unidades (recibidas/enviadas) teñida solo cuando
// importa. Al pulsar una fila se DESPLIEGA su detalle en línea (acordeón), no un cajón.

interface TransfersTableProps {
  groups: TransferGroup[];
  nameOf: StoreNameResolver;
  resolveProduct: ProductResolver;
  onAction: (kind: TransferActionKind, transfer: Transfer) => void;
  /** id del traspaso con una mutación en vuelo (deshabilita su acción). */
  pendingId: string | null;
  /** Abre el chat (pop-up) del traspaso de la fila. */
  onOpenChat: (chat: TransferChatTarget) => void;
  empty: ReactNode;
}

export function TransfersTable({
  groups,
  nameOf,
  resolveProduct,
  onAction,
  pendingId,
  onOpenChat,
  empty,
}: TransfersTableProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toggleGroup = (key: string): void =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toggleExpand = (id: string): void =>
    setExpandedId((current) => (current === id ? null : id));

  const isEmpty = groups.length === 0;

  return (
    <ScrollShadowCell className="tr-main" data-testid="transfers-table">
      {isEmpty ? (
        <div className="tr-empty" data-testid="transfers-empty">
          {empty}
        </div>
      ) : (
        <table className="tr-table">
          <colgroup>
            <col />
            <col />
            <col className="tr-col-lines" />
            <col className="tr-col-created" />
            <col className="tr-col-units" />
            <col className="tr-col-chat" />
          </colgroup>
          <thead className="tr-thead">
            <tr>
              <th className="tr-th-name">Traspaso</th>
              <th>Ruta</th>
              <th className="tr-th-num">Líneas</th>
              <th>Creado</th>
              <th className="tr-th-num">Unidades</th>
              <th className="tr-th-chat" aria-label="Comentarios" />
            </tr>
          </thead>
          {groups.map((group) => {
            const isCollapsed = collapsed.has(group.key);
            return (
              <tbody key={group.key}>
                <tr className="tr-group-head" onClick={() => toggleGroup(group.key)}>
                  <td className="tr-group-cell" colSpan={6}>
                    <div className="tr-group-inner">
                      <ChevronDown
                        size={15}
                        className={`tr-group-caret${isCollapsed ? ' is-collapsed' : ''}`}
                        aria-hidden="true"
                      />
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
                      resolveProduct={resolveProduct}
                      expanded={expandedId === transfer.id}
                      onToggle={() => toggleExpand(transfer.id)}
                      onAction={onAction}
                      pending={pendingId === transfer.id}
                      onOpenChat={onOpenChat}
                    />
                  ))}
              </tbody>
            );
          })}
        </table>
      )}
    </ScrollShadowCell>
  );
}

interface TransferRowProps {
  transfer: Transfer;
  nameOf: StoreNameResolver;
  resolveProduct: ProductResolver;
  expanded: boolean;
  onToggle: () => void;
  onAction: (kind: TransferActionKind, transfer: Transfer) => void;
  pending: boolean;
  onOpenChat: (chat: TransferChatTarget) => void;
}

function TransferRow({
  transfer,
  nameOf,
  resolveProduct,
  expanded,
  onToggle,
  onAction,
  pending,
  onOpenChat,
}: TransferRowProps) {
  const row = buildRow(transfer, nameOf);
  return (
    <>
      <tr
        className={`tr-row${row.incident ? ' is-incid' : ''}${expanded ? ' is-expanded' : ''}`}
        data-testid="transfer-row"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <td className="tr-cell-name">
          <div className="tr-cell-name-row">
            <ChevronRight
              size={13}
              className={`tr-row-caret${expanded ? ' is-expanded' : ''}`}
              aria-hidden="true"
            />
            <div className="tr-name-wrap">
              <span className="tr-ref" data-testid="transfer-ref">
                {row.ref}
              </span>
              {row.hasNote && (
                <span className="tr-note" data-testid="transfer-note">
                  {row.note}
                </span>
              )}
            </div>
          </div>
        </td>
        <td className="tr-cell-route" data-testid="transfer-route" title={row.route}>
          {row.route}
        </td>
        <td className="tr-cell-lines">{row.linesLabel}</td>
        <td className="tr-cell-created">{row.createdLabel}</td>
        <td className="tr-cell-units">
          <span className={`tr-badge tr-badge--${row.badgeTone}`} data-testid="transfer-units">
            {row.unitsLabel}
          </span>
        </td>
        <td className="tr-cell-chat">
          <button
            type="button"
            className={`tr-chat-btn${row.incident ? ' is-incid' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onOpenChat({
                id: transfer.id,
                title: row.ref,
                subtitle: row.route,
                incidentOpen: isIncidentOpen(transfer),
              });
            }}
            title="Comentarios"
            aria-label="Abrir comentarios"
            data-testid="transfer-chat-open"
          >
            <MessageCircle size={16} aria-hidden="true" />
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="tr-detail-row">
          <td className="tr-detail-cell" colSpan={6}>
            <TransferRowDetail
              detail={buildTransferDetail(transfer, nameOf, resolveProduct)}
              onAction={(kind) => onAction(kind, transfer)}
              pending={pending}
              onOpenChat={() =>
                onOpenChat({
                  id: transfer.id,
                  title: row.ref,
                  subtitle: row.route,
                  incidentOpen: isIncidentOpen(transfer),
                })
              }
            />
          </td>
        </tr>
      )}
    </>
  );
}
