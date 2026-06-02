import type { PurchaseOrder, PurchaseOrderStatus } from '@simpletpv/auth';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { listStores } from './lib/admin.js';
import {
  confirmPurchaseOrder,
  createPurchaseOrder,
  createSupplier,
  deleteSupplier,
  getPurchaseOrder,
  listPurchaseOrders,
  listSuppliers,
  receivePurchaseOrder,
  type SuggestionRow,
  suggestPurchase,
} from './lib/purchases.js';

const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  DRAFT: 'Borrador',
  CONFIRMED: 'Confirmado',
  PARTIALLY_RECEIVED: 'Parcial',
  RECEIVED: 'Recibido',
};

type Section = 'orders' | 'suppliers' | 'suggest';

export function PurchasesPage() {
  const [section, setSection] = useState<Section>('orders');
  return (
    <section className="catalog" data-testid="purchases-page">
      <header className="catalog-head">
        <div>
          <h2>Compras</h2>
          <p className="catalog-sub">Propuestas y pedidos a proveedor</p>
        </div>
      </header>
      <nav className="bo-tabs" data-testid="purchases-subtabs">
        <button
          className={`bo-tab ${section === 'orders' ? 'active' : ''}`}
          onClick={() => setSection('orders')}
          data-testid="purchases-tab-orders"
        >
          Pedidos
        </button>
        <button
          className={`bo-tab ${section === 'suppliers' ? 'active' : ''}`}
          onClick={() => setSection('suppliers')}
          data-testid="purchases-tab-suppliers"
        >
          Proveedores
        </button>
        <button
          className={`bo-tab ${section === 'suggest' ? 'active' : ''}`}
          onClick={() => setSection('suggest')}
          data-testid="purchases-tab-suggest"
        >
          Propuesta
        </button>
      </nav>
      {section === 'orders' && <OrdersSection />}
      {section === 'suppliers' && <SuppliersSection />}
      {section === 'suggest' && <SuggestSection />}
    </section>
  );
}

function SuppliersSection() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [leadTime, setLeadTime] = useState('7');

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: listSuppliers,
  });
  const createMut = useMutation({
    mutationFn: createSupplier,
    onSuccess: () => {
      setName('');
      void qc.invalidateQueries({ queryKey: ['suppliers'] });
    },
  });
  const delMut = useMutation({
    mutationFn: deleteSupplier,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });

  return (
    <>
      <header className="catalog-head">
        <h2>Proveedores</h2>
        <div className="catalog-actions">
          <input
            className="catalog-search"
            placeholder="Nombre del proveedor"
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="supplier-name"
          />
          <input
            className="catalog-search"
            type="number"
            min={0}
            value={leadTime}
            onChange={(e) => setLeadTime(e.target.value)}
            title="Lead time (días)"
            data-testid="supplier-leadtime"
            style={{ width: '6rem' }}
          />
          <button
            type="button"
            className="btn-primary"
            disabled={!name || createMut.isPending}
            onClick={() => createMut.mutate({ name, leadTimeDays: Number(leadTime) })}
            data-testid="supplier-create"
          >
            Añadir
          </button>
        </div>
      </header>
      {isLoading ? (
        <p className="catalog-empty">Cargando…</p>
      ) : suppliers.length === 0 ? (
        <p className="catalog-empty" data-testid="suppliers-empty">
          Sin proveedores.
        </p>
      ) : (
        <table className="catalog-table" data-testid="suppliers-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Lead time</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id} data-testid="supplier-row">
                <td>{s.name}</td>
                <td className="muted">{s.leadTimeDays} días</td>
                <td>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => delMut.mutate(s.id)}
                    data-testid="supplier-delete"
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function OrdersSection() {
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

function SuggestSection() {
  const qc = useQueryClient();
  const { data: stores = [] } = useQuery({ queryKey: ['stores'], queryFn: listStores });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: listSuppliers });
  const [storeId, setStoreId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [rows, setRows] = useState<SuggestionRow[]>([]);
  const [qty, setQty] = useState<Record<string, string>>({});

  const suggestMut = useMutation({
    mutationFn: suggestPurchase,
    onSuccess: (data) => {
      setRows(data);
      setQty(Object.fromEntries(data.map((r) => [r.productId, String(r.cantidadSugerida)])));
    },
  });
  const createMut = useMutation({
    mutationFn: createPurchaseOrder,
    onSuccess: () => {
      setRows([]);
      void qc.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });

  return (
    <>
      <header className="catalog-head">
        <h2>Generar propuesta de pedido</h2>
        <div className="catalog-actions">
          <select
            className="catalog-search"
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            data-testid="suggest-store"
          >
            <option value="">Tienda…</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            className="catalog-search"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            data-testid="suggest-supplier"
          >
            <option value="">Proveedor…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-primary"
            disabled={!storeId || suggestMut.isPending}
            onClick={() => suggestMut.mutate({ storeId })}
            data-testid="suggest-generate"
          >
            Generar
          </button>
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="catalog-empty" data-testid="suggest-empty">
          {suggestMut.isSuccess
            ? 'No hay nada que reponer.'
            : 'Genera una propuesta para una tienda.'}
        </p>
      ) : (
        <>
          <table className="catalog-table" data-testid="suggest-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Stock</th>
                <th>Mín</th>
                <th>Venta media/día</th>
                <th>Cobertura</th>
                <th>Pedir</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.productId} data-testid="suggest-row">
                  <td>{r.productName}</td>
                  <td>{r.stockActual}</td>
                  <td className="muted">{r.minStock}</td>
                  <td className="muted">{r.ventaMediaDiaria}</td>
                  <td className="muted">
                    {r.coberturaDias != null ? `${r.coberturaDias} d` : '—'}
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      value={qty[r.productId] ?? ''}
                      onChange={(e) => setQty({ ...qty, [r.productId]: e.target.value })}
                      data-testid="suggest-qty"
                      style={{ width: '5rem' }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="modal-foot">
            <button
              type="button"
              className="btn-primary"
              disabled={!supplierId || createMut.isPending}
              onClick={() =>
                createMut.mutate({
                  supplierId,
                  storeId,
                  lines: rows
                    .filter((r) => Number(qty[r.productId] ?? 0) > 0)
                    .map((r) => ({
                      productId: r.productId,
                      quantityOrdered: Number(qty[r.productId]),
                    })),
                })
              }
              data-testid="suggest-create-order"
            >
              Crear pedido (selecciona proveedor)
            </button>
          </div>
        </>
      )}
    </>
  );
}
