import type { PurchaseOrder, PurchaseOrderStatus } from '@simpletpv/auth';
import {
  Button,
  DataTable,
  type FacetedColumn,
  FacetedTable,
  type FacetSection,
  Input,
} from '@simpletpv/ui';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

import { FacetRail } from '../components/FacetRail.js';
import { Modal } from '../components/Modal.js';
import { ScrollShadowCell } from '../components/ScrollShadowCell.js';
import {
  confirmPurchaseOrder,
  getPurchaseOrder,
  listPurchaseOrders,
  receivePurchaseOrder,
} from '../lib/purchases.js';
import { STATUS_LABEL } from './labels.js';

// Orden de los grupos por estado: lo accionable primero (Borrador → Confirmado →
// Parcial → Recibido). La columna Estado desaparece (sube a la cabecera de grupo).
const STATUS_ORDER: PurchaseOrderStatus[] = [
  'DRAFT',
  'CONFIRMED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
];

export function OrdersSection({
  supplierId,
}: {
  // Vista detalle de proveedor (I-18/D-07): solo sus pedidos.
  supplierId?: string;
} = {}) {
  const qc = useQueryClient();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  // Faceta «Estado» del carril (solo en la pestaña; '' = todos los estados).
  const [view, setView] = useState<string>('');
  const toggleGroup = (key: string): void =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['purchase-orders', supplierId ?? null],
    queryFn: () => listPurchaseOrders(undefined, supplierId),
    placeholderData: keepPreviousData,
  });
  const confirmMut = useMutation({
    mutationFn: confirmPurchaseOrder,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['purchase-orders'] }),
  });

  // En la pestaña, la faceta «Estado» filtra; en la ficha no hay carril (view = '').
  const shown = view ? orders.filter((o) => o.status === view) : orders;
  // Grupos por estado (solo los presentes), pedidos recientes primero dentro de cada uno.
  const groups = STATUS_ORDER.map((status) => ({
    status,
    rows: shown
      .filter((o) => o.status === status)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
  }))
    .filter((g) => g.rows.length > 0)
    .map((g) => ({
      key: g.status,
      label: STATUS_LABEL[g.status],
      meta: `${g.rows.length} ${g.rows.length === 1 ? 'pedido' : 'pedidos'}`,
      rows: g.rows,
    }));

  const columns: FacetedColumn<PurchaseOrder>[] = [
    {
      key: 'date',
      header: 'Fecha',
      variant: 'name',
      render: (o) => new Date(o.createdAt).toLocaleDateString('es-ES'),
    },
    { key: 'lines', header: 'Líneas', variant: 'num', render: (o) => o.lines.length },
    {
      key: 'actions',
      header: '',
      variant: 'num',
      render: (o) => (
        <>
          {o.status === 'DRAFT' && (
            <button
              type="button"
              className="link-btn"
              disabled={confirmMut.isPending}
              onClick={() => confirmMut.mutate(o.id)}
              data-testid="order-confirm"
            >
              Confirmar
            </button>
          )}
          <button
            type="button"
            className="link-btn"
            onClick={() => setDetailId(o.id)}
            data-testid="order-detail"
          >
            Ver
          </button>
        </>
      ),
    },
  ];

  const emptyState: ReactNode = supplierId ? (
    <span className="catalog-empty" data-testid="orders-empty">
      Este proveedor no tiene pedidos de compra.
    </span>
  ) : (
    <div className="purchases-empty" data-testid="orders-empty">
      <span className="purchases-empty-icon" aria-hidden="true">
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <path d="M3.27 6.96 12 12.01l8.73-5.05" />
        </svg>
      </span>
      <p className="purchases-empty-title">Sin pedidos abiertos</p>
      <p className="purchases-empty-text">
        Genera una propuesta automática a partir de ventas, rotación y mínimos.
      </p>
    </div>
  );

  const table = (
    <FacetedTable<PurchaseOrder>
      layout="table"
      columns={columns}
      groups={groups}
      rowKey={(o) => o.id}
      rowTestId="order-row"
      loading={isLoading}
      collapsedKeys={collapsed}
      onToggleGroup={toggleGroup}
      emptyState={emptyState}
    />
  );

  // Contexto embebido (ficha de proveedor): tabla agrupada simple, sin carril.
  if (supplierId) {
    return (
      <>
        <div className="table-panel">{table}</div>
        {detailId && <OrderDetailModal id={detailId} onClose={() => setDetailId(null)} />}
      </>
    );
  }

  // Contexto de pestaña: carril de facetas (Estado) + tabla agrupada, full-height,
  // mismo aspecto que Existencias/Proveedores.
  const sections: FacetSection[] = [
    {
      kind: 'views',
      title: 'Estado',
      options: [
        { key: '', label: 'Todos los pedidos', count: orders.length },
        ...STATUS_ORDER.filter((s) => orders.some((o) => o.status === s)).map((s) => ({
          key: s,
          label: STATUS_LABEL[s],
          count: orders.filter((o) => o.status === s).length,
        })),
      ],
      active: view,
      onSelect: setView,
      testIdPrefix: 'orders-view',
    },
  ];

  return (
    <>
      <div className="faceted-page">
        <div className="inv-card">
          <div className="cat-layout">
            <FacetRail ariaLabel="Filtros de pedidos" testId="orders-facets" sections={sections} />
            <ScrollShadowCell className="cat-main" data-testid="orders-table">
              {table}
            </ScrollShadowCell>
          </div>
        </div>
      </div>
      {detailId && <OrderDetailModal id={detailId} onClose={() => setDetailId(null)} />}
    </>
  );
}

function OrderDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: order, isLoading } = useQuery({
    queryKey: ['purchase-order', id],
    queryFn: () => getPurchaseOrder(id),
  });
  const [received, setReceived] = useState<Record<string, string>>({});

  const receiveMut = useMutation({
    mutationFn: (o: PurchaseOrder) =>
      receivePurchaseOrder(o.id, {
        lines: o.lines
          .filter((l) => Number(received[l.id] ?? 0) > 0)
          .map((l) => ({ lineId: l.id, quantityReceived: Number(received[l.id]) })),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['purchase-order', id] });
      void qc.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });

  return (
    <Modal onClose={onClose} testId="order-modal" ariaLabel="Detalle del pedido">
      <h3>Pedido</h3>
      {isLoading || !order ? (
        <p className="catalog-empty">Cargando…</p>
      ) : (
        <>
          <p className="muted" data-testid="order-kpis">
            Estado: {STATUS_LABEL[order.status]} · Fill rate:{' '}
            {order.kpis?.fillRate != null ? `${Math.round(order.kpis.fillRate * 100)}%` : '—'} ·
            Lead time: {order.kpis?.leadTimeDays != null ? `${order.kpis.leadTimeDays} d` : '—'}
          </p>
          <DataTable
            data-testid="order-lines"
            rowTestId="order-line"
            rows={order.lines}
            rowKey={(l) => l.id}
            columns={[
              {
                key: 'ordered',
                header: 'Pedido',
                render: (l: PurchaseOrder['lines'][number]) => l.quantityOrdered,
              },
              {
                key: 'received',
                header: 'Recibido',
                render: (l: PurchaseOrder['lines'][number]) => l.quantityReceived,
              },
              ...(order.status === 'CONFIRMED' || order.status === 'PARTIALLY_RECEIVED'
                ? [
                    {
                      key: 'receive',
                      header: 'Recibir ahora',
                      render: (l: PurchaseOrder['lines'][number]) => (
                        <Input
                          type="number"
                          min={0}
                          value={received[l.id] ?? ''}
                          onChange={(e) => setReceived({ ...received, [l.id]: e.target.value })}
                          data-testid="receive-input"
                          style={{ width: '5rem' }}
                        />
                      ),
                    },
                  ]
                : []),
            ]}
          />
          {(order.status === 'CONFIRMED' || order.status === 'PARTIALLY_RECEIVED') && (
            <div className="modal-foot">
              <Button
                type="button"
                disabled={receiveMut.isPending}
                onClick={() => receiveMut.mutate(order)}
                data-testid="receive-confirm"
              >
                Confirmar recepción
              </Button>
            </div>
          )}
        </>
      )}
      <div className="modal-foot">
        <button type="button" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </Modal>
  );
}
