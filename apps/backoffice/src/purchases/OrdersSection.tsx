import type { PurchaseOrder } from '@simpletpv/auth';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  confirmPurchaseOrder,
  getPurchaseOrder,
  listPurchaseOrders,
  receivePurchaseOrder,
} from '../lib/purchases.js';
import { STATUS_LABEL } from './labels.js';

export function OrdersSection() {
  const qc = useQueryClient();
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['purchase-orders'],
    queryFn: () => listPurchaseOrders(),
    placeholderData: keepPreviousData,
  });
  const confirmMut = useMutation({
    mutationFn: confirmPurchaseOrder,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['purchase-orders'] }),
  });

  if (isLoading) {
    return <p className="catalog-empty">Cargando…</p>;
  }
  return (
    <>
      {orders.length === 0 ? (
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
      ) : (
        <table className="catalog-table" data-testid="orders-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Líneas</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} data-testid="order-row">
                <td className="muted">{new Date(o.createdAt).toLocaleDateString('es-ES')}</td>
                <td>{o.lines.length}</td>
                <td>
                  <span className="stock-tag" data-testid="order-status">
                    {STATUS_LABEL[o.status]}
                  </span>
                </td>
                <td>
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
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
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} data-testid="order-modal">
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
            <table className="catalog-table" data-testid="order-lines">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Recibido</th>
                  {(order.status === 'CONFIRMED' || order.status === 'PARTIALLY_RECEIVED') && (
                    <th>Recibir ahora</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {order.lines.map((l) => (
                  <tr key={l.id} data-testid="order-line">
                    <td>{l.quantityOrdered}</td>
                    <td>{l.quantityReceived}</td>
                    {(order.status === 'CONFIRMED' || order.status === 'PARTIALLY_RECEIVED') && (
                      <td>
                        <input
                          type="number"
                          min={0}
                          value={received[l.id] ?? ''}
                          onChange={(e) => setReceived({ ...received, [l.id]: e.target.value })}
                          data-testid="receive-input"
                          style={{ width: '5rem' }}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {(order.status === 'CONFIRMED' || order.status === 'PARTIALLY_RECEIVED') && (
              <div className="modal-foot">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={receiveMut.isPending}
                  onClick={() => receiveMut.mutate(order)}
                  data-testid="receive-confirm"
                >
                  Confirmar recepción
                </button>
              </div>
            )}
          </>
        )}
        <div className="modal-foot">
          <button type="button" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
