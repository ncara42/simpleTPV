import { Button, Input, Select } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { sileo } from 'sileo';

import { useConfirm } from '../components/ConfirmProvider.js';
import { Modal } from '../components/Modal.js';
import {
  createWholesaleOrder,
  getWholesaleOrder,
  listAllWholesaleOrders,
  listCustomers,
  listPriceLists,
  updateWholesaleOrderStatus,
  type WholesaleOrderStatus,
} from '../lib/b2b.js';
import { formErrorMessage } from '../lib/form-error.js';
import { usePageActions } from '../lib/pageActions.js';
import { listProducts } from '../lib/products.js';
import {
  activeFacetCount,
  daysSince,
  EMPTY_FACETS,
  type EstadoFilter,
  filterOrders,
  mergeOrders,
  type OrderFacetState,
  type OrderView,
  type PeriodoFilter,
  PVP_KEY,
  searchBase,
  statusLabel,
  statusTone,
} from './order-facets.js';
import { OrderDetail } from './OrderDetail.js';
import { type FacetGroupView, OrderFacets } from './OrderFacets.js';
import { OrderList } from './OrderList.js';

interface DraftLine {
  productId: string;
  qty: string;
}

// Modal de creación de pedido: cliente + líneas (producto + cantidad) + notas.
function NewOrderModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
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
      sileo.success({ title: 'Pedido creado' });
      onCreated();
    },
    onError: (e) => sileo.error({ title: formErrorMessage(e, 'No se pudo crear el pedido') }),
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
              <Input
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
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </section>
      </div>
      {createMut.isError && (
        <p className="form-error">
          {formErrorMessage(createMut.error, 'No se pudo crear el pedido.')}
        </p>
      )}
      <div className="modal-foot modal-foot-actions">
        <button type="button" onClick={onClose}>
          Cancelar
        </button>
        <Button type="submit" disabled={!canSubmit} data-testid="b2b-order-save">
          {createMut.isPending ? 'Creando…' : 'Crear pedido'}
        </Button>
      </div>
    </Modal>
  );
}

// Pedidos salientes: maestro-detalle de 3 columnas (carril de facetas · lista · ficha),
// espejo de Clientes/Tarifas. Las sub-pestañas y el «Nuevo pedido» viven en la TopBar.
export function OrdersSection() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const now = useMemo(() => Date.now(), []);

  const [facets, setFacets] = useState<OrderFacetState>(EMPTY_FACETS);
  const [sortDesc, setSortDesc] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: orders = [] } = useQuery({
    queryKey: ['b2b-orders'],
    queryFn: listAllWholesaleOrders,
  });
  const { data: customers = [] } = useQuery({
    queryKey: ['b2b-customers'],
    queryFn: listCustomers,
  });
  const { data: priceLists = [] } = useQuery({
    queryKey: ['b2b-pricelists'],
    queryFn: listPriceLists,
  });

  const views = useMemo(
    () => mergeOrders(orders, customers, priceLists),
    [orders, customers, priceLists],
  );

  const invalidateOrders = () => {
    void qc.invalidateQueries({ queryKey: ['b2b-orders'] });
    void qc.invalidateQueries({ queryKey: ['b2b-order'] });
  };

  // ── Lista filtrada + selección ─────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const rows = filterOrders(views, facets, now);
    const dir = sortDesc ? -1 : 1;
    return rows
      .slice()
      .sort(
        (a, b) =>
          (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir ||
          a.ref.localeCompare(b.ref),
      );
  }, [views, facets, now, sortDesc]);

  const totalAmount = useMemo(() => filtered.reduce((acc, o) => acc + o.total, 0), [filtered]);

  const selected = useMemo(() => {
    if (selectedId) {
      const found = views.find((o) => o.id === selectedId);
      if (found) return found;
    }
    return filtered[0] ?? null;
  }, [selectedId, views, filtered]);

  const { data: detail = null, isLoading: detailLoading } = useQuery({
    queryKey: ['b2b-order', selected?.id],
    queryFn: () => getWholesaleOrder(selected!.id),
    enabled: !!selected,
  });

  const statusMut = useMutation({
    mutationFn: (v: { id: string; status: WholesaleOrderStatus }) =>
      updateWholesaleOrderStatus(v.id, v.status),
    onSuccess: (_data, v) => {
      invalidateOrders();
      sileo.success({
        title:
          v.status === 'CANCELLED'
            ? 'Pedido cancelado'
            : `Pedido marcado como ${statusLabel(v.status).toLowerCase()}`,
      });
    },
    onError: (e) => sileo.error({ title: formErrorMessage(e, 'No se pudo cambiar el estado') }),
  });

  // ── Facetas ────────────────────────────────────────────────────────────────────
  const base = useMemo(() => searchBase(views, facets.search), [views, facets.search]);
  const cnt = (pred: (o: OrderView) => boolean) => base.filter(pred).length;

  // Tarifas presentes entre los pedidos (price lists usadas + PVP al final).
  const tariffPairs = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of views) map.set(v.tariffKey, v.tariffName);
    return [...map.entries()].sort((a, b) => {
      if (a[0] === PVP_KEY) return 1;
      if (b[0] === PVP_KEY) return -1;
      return a[1].localeCompare(b[1]);
    });
  }, [views]);

  const groups: FacetGroupView[] = [
    {
      key: 'estado',
      title: 'Estado',
      options: [
        { key: 'all', label: 'Todos', count: base.length, active: facets.estado === 'all' },
        ...(['DRAFT', 'CONFIRMED', 'SHIPPED', 'CANCELLED'] as const).map((s) => ({
          key: s,
          label: statusLabel(s),
          count: cnt((o) => o.status === s),
          active: facets.estado === s,
          tone: statusTone(s),
        })),
      ],
    },
    {
      key: 'periodo',
      title: 'Periodo',
      options: [
        { key: 'all', label: 'Cualquiera', count: base.length, active: facets.periodo === 'all' },
        {
          key: 'today',
          label: 'Hoy',
          count: cnt((o) => daysSince(o.createdAt, now) <= 0),
          active: facets.periodo === 'today',
        },
        {
          key: '7',
          label: 'Últimos 7 días',
          count: cnt((o) => daysSince(o.createdAt, now) < 7),
          active: facets.periodo === '7',
        },
        {
          key: '30',
          label: 'Últimos 30 días',
          count: cnt((o) => daysSince(o.createdAt, now) < 30),
          active: facets.periodo === '30',
        },
      ],
    },
    {
      key: 'tarifa',
      title: 'Tarifa',
      options: [
        { key: '__all__', label: 'Todas', count: base.length, active: facets.tarifas.size === 0 },
        ...tariffPairs.map(([key, name]) => ({
          key,
          label: name,
          count: cnt((o) => o.tariffKey === key),
          active: facets.tarifas.has(key),
        })),
      ],
    },
  ];

  const toggleFacet = (groupKey: string, optKey: string) => {
    setFacets((f) => {
      if (groupKey === 'estado') {
        return { ...f, estado: f.estado === optKey ? 'all' : (optKey as EstadoFilter) };
      }
      if (groupKey === 'periodo') {
        return { ...f, periodo: f.periodo === optKey ? 'all' : (optKey as PeriodoFilter) };
      }
      // tarifa (multi): «Todas» limpia el set; el resto alterna su clave.
      if (optKey === '__all__') return { ...f, tarifas: new Set<string>() };
      const next = new Set(f.tarifas);
      if (next.has(optKey)) next.delete(optKey);
      else next.add(optKey);
      return { ...f, tarifas: next };
    });
  };

  const clearFilters = () => setFacets((f) => ({ ...EMPTY_FACETS, search: f.search }));

  // ── Acciones de la TopBar (Nuevo pedido) ───────────────────────────
  usePageActions(
    <Button
      onClick={() => setCreating(true)}
      data-testid="b2b-new-order"
      icon={<Plus size={16} aria-hidden="true" />}
    >
      Nuevo pedido
    </Button>,
  );

  const hasFilters = activeFacetCount(facets) > 0 || facets.search.trim() !== '';

  return (
    <div className="b2b-orders-page">
      <div className="cust-card">
        <div className="pl-layout">
          <OrderFacets
            search={facets.search}
            onSearchChange={(v) => setFacets((f) => ({ ...f, search: v }))}
            groups={groups}
            onToggleFacet={toggleFacet}
            showClear={activeFacetCount(facets) > 0}
            clearCount={activeFacetCount(facets)}
            onClear={clearFilters}
          />
          <OrderList
            rows={filtered}
            total={views.length}
            totalAmount={totalAmount}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
            sortDesc={sortDesc}
            onToggleSort={() => setSortDesc((s) => !s)}
            now={now}
            hasFilters={hasFilters}
            onClearFilters={clearFilters}
          />
          <OrderDetail
            order={selected}
            detail={detail}
            detailLoading={detailLoading}
            busy={statusMut.isPending}
            now={now}
            onAdvance={(status) => {
              if (selected) statusMut.mutate({ id: selected.id, status });
            }}
            onCancel={async () => {
              if (!selected) return;
              const ok = await confirm({
                title: 'Cancelar pedido',
                message: `¿Cancelar el pedido ${selected.ref} de ${selected.customerName}? No podrá reactivarse.`,
                confirmLabel: 'Cancelar pedido',
                danger: true,
              });
              if (ok) statusMut.mutate({ id: selected.id, status: 'CANCELLED' });
            }}
          />
        </div>
      </div>

      {creating && (
        <NewOrderModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            invalidateOrders();
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}
