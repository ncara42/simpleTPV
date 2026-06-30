import type { Transfer } from '@simpletpv/auth';
import { cn, type FacetedColumn, FacetedTable } from '@simpletpv/ui';
import { ChevronRight, MessageCircle } from 'lucide-react';
import { type ReactNode, useState } from 'react';

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

/** Datos para abrir el chat de un traspaso desde una fila. */
export interface TransferChatTarget {
  id: string;
  title: string;
  subtitle: string;
  /** Hay incidencia abierta → el chat ofrece marcarla como solucionada. */
  incidentOpen: boolean;
}

// Tabla de Traspasos: variante del componente único (FacetedTable) con DETALLE
// EXPANDIBLE por fila (acordeón). Agrupada por estado (Borradores · En tránsito ·
// Recibidos · Cerrados); filas con referencia + nota, ruta, líneas, fecha y píldora de
// unidades teñida solo cuando importa. Al pulsar una fila se despliega su detalle en
// línea (renderDetail), no un cajón. El carril y el scroll los aporta la página.

const EMPTY: ReadonlySet<string> = new Set();

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

  // Vista pre-construida por fila (evita reconstruirla en cada columna).
  const views = new Map(groups.flatMap((g) => g.rows).map((t) => [t.id, buildRow(t, nameOf)]));
  const chatOf = (t: Transfer): TransferChatTarget => {
    const v = views.get(t.id)!;
    return { id: t.id, title: v.ref, subtitle: v.route, incidentOpen: isIncidentOpen(t) };
  };

  const columns: FacetedColumn<Transfer>[] = [
    {
      key: 'name',
      header: 'Traspaso',
      variant: 'name',
      render: (t) => {
        const v = views.get(t.id)!;
        const expanded = expandedId === t.id;
        return (
          <div className="tr-cell-name-row">
            <ChevronRight
              size={13}
              className={cn('tr-row-caret', expanded && 'is-expanded')}
              aria-hidden="true"
            />
            <div className="tr-name-wrap">
              <span className="tr-ref" data-testid="transfer-ref">
                {v.ref}
              </span>
              {v.hasNote && (
                <span className="tr-note" data-testid="transfer-note">
                  {v.note}
                </span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: 'route',
      header: 'Ruta',
      variant: 'mid',
      render: (t) => {
        const v = views.get(t.id)!;
        return (
          <span className="tr-route" data-testid="transfer-route" title={v.route}>
            {v.route}
          </span>
        );
      },
    },
    {
      key: 'lines',
      header: 'Líneas',
      variant: 'num',
      colClassName: 'tr-col-lines',
      render: (t) => views.get(t.id)!.linesLabel,
    },
    {
      key: 'created',
      header: 'Creado',
      variant: 'mid',
      colClassName: 'tr-col-created',
      render: (t) => views.get(t.id)!.createdLabel,
    },
    {
      key: 'units',
      header: 'Unidades',
      variant: 'num',
      colClassName: 'tr-col-units',
      render: (t) => {
        const v = views.get(t.id)!;
        return (
          <span className={`tr-badge tr-badge--${v.badgeTone}`} data-testid="transfer-units">
            {v.unitsLabel}
          </span>
        );
      },
    },
    {
      key: 'chat',
      header: '',
      variant: 'num',
      colClassName: 'tr-col-chat',
      render: (t) => {
        const v = views.get(t.id)!;
        return (
          <button
            type="button"
            className={cn('tr-chat-btn', v.incident && 'is-incid')}
            onClick={(e) => {
              e.stopPropagation();
              onOpenChat(chatOf(t));
            }}
            title="Comentarios"
            aria-label="Abrir comentarios"
            data-testid="transfer-chat-open"
          >
            <MessageCircle size={16} aria-hidden="true" />
          </button>
        );
      },
    },
  ];

  const fgroups = groups.map((g) => ({
    key: g.key,
    label: g.label,
    meta: `${g.count} ${g.count === 1 ? 'traspaso' : 'traspasos'}`,
    metaRight: g.unitsLabel,
    rows: g.rows,
  }));

  return (
    <ScrollShadowCell className="tr-main" data-testid="transfers-table">
      <FacetedTable<Transfer>
        layout="table"
        groups={fgroups}
        columns={columns}
        rowKey={(t) => t.id}
        rowTestId="transfer-row"
        rowTone={(t) => (views.get(t.id)!.incident ? 'is-incid' : undefined)}
        collapsedKeys={collapsed}
        onToggleGroup={toggleGroup}
        expandedKeys={expandedId ? new Set([expandedId]) : EMPTY}
        onToggleRow={(key) => setExpandedId((cur) => (cur === key ? null : key))}
        renderDetail={(t) => (
          <TransferRowDetail
            detail={buildTransferDetail(t, nameOf, resolveProduct)}
            onAction={(kind) => onAction(kind, t)}
            pending={pendingId === t.id}
            onOpenChat={() => onOpenChat(chatOf(t))}
          />
        )}
        emptyState={<span data-testid="transfers-empty">{empty}</span>}
      />
    </ScrollShadowCell>
  );
}
