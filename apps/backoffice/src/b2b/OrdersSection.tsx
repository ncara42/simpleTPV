import { Select } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import { useState } from 'react';

import { Modal } from '../components/Modal.js';
import { SectionToolbar } from '../components/SectionToolbar.js';
import { useToast } from '../components/ToastProvider.js';
import {
  createWholesaleOrder,
  getWholesaleOrder,
  listCustomers,
  listWholesaleOrders,
  updateWholesaleOrderStatus,
  type WholesaleOrderStatus,
} from '../lib/b2b.js';
import { listProducts } from '../lib/products.js';

const STATUS_LABEL: Record<WholesaleOrderStatus, string> = {
  DRAFT: 'Borrador',
  CONFIRMED: 'Confirmado',
  SHIPPED: 'Enviado',
  CANCELLED: 'Cancelado',
};

// Transiciones permitidas desde cada estado (espejo de wholesale-orders.service).
const NEXT: Record<WholesaleOrderStatus, WholesaleOrderStatus[]> = {
  DRAFT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: [],
  CANCELLED: [],
};

const eur = (n: number | string): string => `${Number(n).toFixed(2)} €`;
const fmtDate = (iso: string): string => new Date(iso).toLocaleDateString('es-ES');

interface DraftLine {
  productId: string;
  qty: string;
}

// Modal de creación de pedido: cliente + líneas (producto + cantidad) + notas.
function NewOrderModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [customerId, setCustomerId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([{ productId: '', qty: '1' }]);

  const { data: customers = [] } = useQuery({
    queryKey: ['b2b-customers'],
    queryFn: listCustomers,
  });
  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => listProducts(),
  });

  const createMut = useMutation({
    mutationFn: () => {
      const validLines = lines
        .filter((l) => l.productId && Number(l.qty) > 0)
        .map((l) => ({ productId: l.productId, qty: Number(l.qty) }));
      return createWholesaleOrder(
        notes.trim()
          ? { customerId, notes: notes.trim(), lines: validLines }
          : { customerId, lines: validLines },
      );
    },
    onSuccess: () => {
      toast('Pedido creado', 'success');
      onCreated();
    },
    onError: () => toast('No se pudo crear el pedido', 'error'),
  });

  const customerOptions = [
    { value: '', label: 'Selecciona un cliente…' },
    ...customers.map((c) => ({ value: c.id, label: c.name })),
  ];
  const productOptions = [
    { value: '', label: 'Producto…' },
    ...products.map((p) => ({ value: p.id, label: p.name })),
  ];

  const validLines = lines.filter((l) => l.productId && Number(l.qty) > 0);
  const canSubmit = customerId !== '' && validLines.length > 0 && !createMut.isPending;

  const setLine = (i: number, patch: Partial<DraftLine>): void =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  return (
    <Modal
      onClose={onClose}
      className="modal--form"
      testId="b2b-order-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) createMut.mutate();
      }}
    >
      <header className="modal-head">
        <h3>Nuevo pedido mayorista</h3>
      </header>
      <div className="modal-body">
        <section className="form-section">
          <span className="form-section-title">Cliente</span>
          <Select
            value={customerId}
            onChange={setCustomerId}
            ariaLabel="Cliente"
            options={customerOptions}
            data-testid="b2b-order-customer"
          />
        </section>

        <section className="form-section">
          <span className="form-section-title">Líneas</span>
          {lines.map((l, i) => (
            <div className="b2b-item-form" key={i}>
              <Select
                value={l.productId}
                onChange={(v) => setLine(i, { productId: v })}
                ariaLabel="Producto"
                options={productOptions}
                data-testid="b2b-order-line-product"
              />
              <input
                type="number"
                min="0"
                step="0.001"
                value={l.qty}
                onChange={(e) => setLine(i, { qty: e.target.value })}
                aria-label="Cantidad"
                data-testid="b2b-order-line-qty"
              />
              <button
                type="button"
                className="link-btn"
                onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                disabled={lines.length === 1}
                aria-label="Quitar línea"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className="link-btn"
            onClick={() => setLines((prev) => [...prev, { productId: '', qty: '1' }])}
            data-testid="b2b-order-add-line"
          >
            + Añadir línea
          </button>
        </section>

        <section className="form-section">
          <label>
            Notas
            <input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </section>
      </div>
      {createMut.isError && <p className="form-error">No se pudo crear el pedido.</p>}
      <div className="modal-foot modal-foot-actions">
        <button type="button" onClick={onClose}>
          Cancelar
        </button>
        <button
          type="submit"
          className="btn-primary"
          disabled={!canSubmit}
          data-testid="b2b-order-save"
        >
          {createMut.isPending ? 'Creando…' : 'Crear pedido'}
        </button>
      </div>
    </Modal>
  );
}

// Modal de detalle: líneas con precio congelado, total y transiciones de estado.
function OrderDetailModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: order } = useQuery({
    queryKey: ['b2b-order', orderId],
    queryFn: () => getWholesaleOrder(orderId),
  });

  const statusMut = useMutation({
    mutationFn: (status: WholesaleOrderStatus) => updateWholesaleOrderStatus(orderId, status),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['b2b-order', orderId] });
      void qc.invalidateQueries({ queryKey: ['b2b-orders'] });
      toast('Estado del pedido actualizado', 'success');
    },
    onError: () => toast('No se pudo cambiar el estado', 'error'),
  });

  return (
    <Modal onClose={onClose} className="modal--form" testId="b2b-order-detail">
      <header className="modal-head">
        <h3>Pedido {order ? `· ${order.customer.name}` : ''}</h3>
      </header>
      <div className="modal-body">
        {!order ? (
          <p className="catalog-empty">Cargando…</p>
        ) : (
          <>
            <p className="muted">
              {fmtDate(order.createdAt)} ·{' '}
              <span className="role-badge">{STATUS_LABEL[order.status]}</span>
            </p>
            <table className="catalog-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Cant.</th>
                  <th>Precio</th>
                  <th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((l) => (
                  <tr key={l.id}>
                    <td>{l.product?.name ?? l.productId}</td>
                    <td className="muted">{Number(l.qty)}</td>
                    <td className="muted">{eur(l.unitPrice)}</td>
                    <td>{eur(l.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Total</td>
                  <td>
                    <strong>{eur(order.total)}</strong>
                  </td>
                </tr>
              </tfoot>
            </table>
            {order.notes && <p className="muted">Notas: {order.notes}</p>}
          </>
        )}
      </div>
      <div className="modal-foot modal-foot--split">
        <div className="b2b-status-actions">
          {order &&
            NEXT[order.status].map((next) => (
              <button
                key={next}
                type="button"
                className={next === 'CANCELLED' ? 'link-btn' : 'btn-primary'}
                disabled={statusMut.isPending}
                onClick={() => statusMut.mutate(next)}
                data-testid={`b2b-order-to-${next}`}
              >
                {next === 'CANCELLED'
                  ? 'Cancelar pedido'
                  : `Marcar ${STATUS_LABEL[next].toLowerCase()}`}
              </button>
            ))}
        </div>
        <div className="modal-foot-actions">
          <button type="button" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function OrdersSection() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: page, isLoading } = useQuery({
    queryKey: ['b2b-orders', statusFilter],
    queryFn: () => listWholesaleOrders(statusFilter ? { status: statusFilter } : {}),
  });
  const orders = page?.items ?? [];

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['b2b-orders'] });

  return (
    <div className="table-panel" data-testid="b2b-orders">
      <SectionToolbar
        actionLabel="Nuevo pedido"
        onAction={() => setCreating(true)}
        actionTestId="b2b-new-order"
      >
        <span className="status-badge status-badge--success" data-testid="b2b-orders-direction">
          <ArrowUpRight size={13} aria-hidden="true" /> Salientes · a clientes
        </span>
        <Select
          className="catalog-search"
          value={statusFilter}
          onChange={setStatusFilter}
          ariaLabel="Filtrar por estado"
          data-testid="b2b-orders-status"
          options={[
            { value: '', label: 'Todos los estados' },
            { value: 'DRAFT', label: 'Borrador' },
            { value: 'CONFIRMED', label: 'Confirmado' },
            { value: 'SHIPPED', label: 'Enviado' },
            { value: 'CANCELLED', label: 'Cancelado' },
          ]}
        />
      </SectionToolbar>

      {isLoading ? (
        <p className="catalog-empty">Cargando…</p>
      ) : orders.length === 0 ? (
        <p className="catalog-empty">No hay pedidos mayoristas para este filtro.</p>
      ) : (
        <table className="catalog-table" data-testid="b2b-orders-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Cliente</th>
              <th>Estado</th>
              <th>Líneas</th>
              <th>Total</th>
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} data-testid="b2b-order-row">
                <td className="muted">{fmtDate(o.createdAt)}</td>
                <td>{o.customerName}</td>
                <td>
                  <span className="role-badge">{STATUS_LABEL[o.status]}</span>
                </td>
                <td className="muted">{o.lineCount}</td>
                <td>{eur(o.total)}</td>
                <td>
                  <button type="button" className="link-btn" onClick={() => setDetailId(o.id)}>
                    Ver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {creating && (
        <NewOrderModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            invalidate();
            setCreating(false);
          }}
        />
      )}
      {detailId && <OrderDetailModal orderId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}
