import type { PurchaseOrder, Supplier } from '@simpletpv/auth';
import { cn, type FacetedColumn, FacetedTable } from '@simpletpv/ui';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { fmtEur } from '../lib/format.js';
import { listPurchaseOrders } from '../lib/purchases.js';
import { listSupplierPrices } from '../lib/supplier-prices.js';
import { STATUS_LABEL } from './labels.js';
import { frequencyLabel } from './OrderFrequencyField.js';
import type { SupplierGroup, SupplierMetrics, SupplierRow } from './suppliers-view.js';

// Tabla de Proveedores: variante del componente único (FacetedTable) con detalle EN
// LÍNEA (acordeón) de CARGA PEREZOSA — el detalle solo se monta al expandir y carga sus
// pedidos/tarifa entonces. Agrupada por estado (Activos · Inactivos); filas con proveedor
// + lead time, fiabilidad, pedidos abiertos, volumen 12m y estado. El carril y el scroll
// los aporta la página.

const EMPTY: ReadonlySet<string> = new Set();

interface SuppliersGroupedTableProps {
  groups: SupplierGroup[];
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onEdit: (supplier: Supplier) => void;
  onDelete: (supplier: Supplier) => void;
  deletingId: string | null;
  empty: ReactNode;
}

export function SuppliersGroupedTable({
  groups,
  expandedId,
  onToggleExpand,
  onEdit,
  onDelete,
  deletingId,
  empty,
}: SuppliersGroupedTableProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggleGroup = (key: string): void =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const columns: FacetedColumn<SupplierRow>[] = [
    {
      key: 'name',
      header: 'Proveedor',
      variant: 'name',
      render: (row) => {
        const expanded = expandedId === row.supplier.id;
        return (
          <div className="sup-cell-name-row">
            <ChevronRight
              size={13}
              className={cn('sup-row-caret', expanded && 'is-expanded')}
              aria-hidden="true"
            />
            <span className="sup-name" data-testid="supplier-name">
              {row.supplier.name}
            </span>
          </div>
        );
      },
    },
    {
      key: 'lead',
      header: 'Lead time',
      variant: 'num',
      colClassName: 'sup-col-lead',
      tdClassName: 'sup-cell-lead',
      render: (row) => `${row.supplier.leadTimeDays} d`,
    },
    {
      key: 'ontime',
      header: 'A tiempo',
      variant: 'num',
      colClassName: 'sup-col-ontime',
      render: (row) => (
        <span className={cn('sup-cell-ontime', onTimeTone(row.metrics.onTimePct))}>
          {row.metrics.onTimePct == null ? '—' : `${row.metrics.onTimePct}%`}
        </span>
      ),
    },
    {
      key: 'open',
      header: 'Abiertos',
      variant: 'num',
      colClassName: 'sup-col-open',
      render: (row) => (
        <span
          className={`sup-badge ${row.metrics.openCount > 0 ? 'sup-badge--open' : 'sup-badge--neutral'}`}
        >
          {row.metrics.openCount}
        </span>
      ),
    },
    {
      key: 'bought',
      header: 'Pedidos 12m',
      variant: 'num',
      colClassName: 'sup-col-bought',
      tdClassName: 'sup-cell-bought',
      render: (row) => row.metrics.orders12m,
    },
    {
      key: 'state',
      header: 'Estado',
      variant: 'mid',
      colClassName: 'sup-col-state',
      render: (row) => (
        <span className={`sup-state sup-state--${row.supplier.active ? 'active' : 'inactive'}`}>
          <span className="sup-state-dot" aria-hidden="true" />
          {row.supplier.active ? 'Activo' : 'Inactivo'}
        </span>
      ),
    },
  ];

  const fgroups = groups.map((g) => ({
    key: g.key,
    label: g.label,
    meta: `${g.count} ${g.count === 1 ? 'proveedor' : 'proveedores'}`,
    metaRight: `${g.openTotal} ${g.openTotal === 1 ? 'abierto' : 'abiertos'}`,
    rows: g.rows,
  }));

  return (
    <div className="sup-main" data-testid="suppliers-table">
      <FacetedTable<SupplierRow>
        layout="table"
        groups={fgroups}
        columns={columns}
        rowKey={(row) => row.supplier.id}
        rowTestId="supplier-row"
        collapsedKeys={collapsed}
        onToggleGroup={toggleGroup}
        expandedKeys={expandedId ? new Set([expandedId]) : EMPTY}
        onToggleRow={(key) => onToggleExpand(key)}
        renderDetail={(row) => (
          <SupplierRowDetail
            supplier={row.supplier}
            metrics={row.metrics}
            onEdit={onEdit}
            onDelete={onDelete}
            deleting={deletingId === row.supplier.id}
          />
        )}
        emptyState={<span data-testid="suppliers-empty">{empty}</span>}
      />
    </div>
  );
}

// Umbral de fiabilidad → color (verde ≥95 · ámbar ≥80 · rojo el resto · neutro si N/D).
function onTimeTone(pct: number | null): string {
  if (pct == null) return 'sup-ontime--none';
  if (pct >= 95) return 'sup-ontime--good';
  if (pct >= 80) return 'sup-ontime--mid';
  return 'sup-ontime--bad';
}

interface SupplierRowDetailProps {
  supplier: Supplier;
  metrics: SupplierMetrics;
  onEdit: (supplier: Supplier) => void;
  onDelete: (supplier: Supplier) => void;
  deleting: boolean;
}

function SupplierRowDetail({
  supplier,
  metrics,
  onEdit,
  onDelete,
  deleting,
}: SupplierRowDetailProps) {
  // Carga perezosa: este componente solo se monta cuando la fila está desplegada.
  // Reutiliza las mismas claves de caché que OrdersSection / SupplierPricesSection.
  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['purchase-orders', supplier.id],
    queryFn: () => listPurchaseOrders(undefined, supplier.id),
  });
  const { data: prices = [], isLoading: pricesLoading } = useQuery({
    queryKey: ['supplier-prices', supplier.id],
    queryFn: () => listSupplierPrices(supplier.id),
  });

  const recent = [...orders]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 4);
  const porRecibir = orders.filter(
    (o) => o.status === 'CONFIRMED' || o.status === 'PARTIALLY_RECEIVED',
  ).length;
  const received = orders.filter((o) => o.status === 'RECEIVED');
  const relPct = orders.length > 0 ? Math.round((received.length / orders.length) * 100) : 0;
  const lastReceiptLabel =
    metrics.lastReceipt != null ? new Date(metrics.lastReceipt).toLocaleDateString('es-ES') : '—';

  const meta: Array<{ label: string; value: string }> = [
    { label: 'NIF', value: supplier.nif ?? '—' },
    { label: 'Email', value: supplier.email ?? '—' },
    { label: 'Teléfono', value: supplier.phone ?? '—' },
    { label: 'Lead time', value: `${supplier.leadTimeDays} días` },
    { label: 'Periodicidad', value: frequencyLabel(supplier.orderFrequencyDays) },
    { label: 'Estado', value: supplier.active ? 'Activo' : 'Inactivo' },
    { label: 'Pedidos', value: String(metrics.totalOrders) },
  ];

  return (
    <div className="sup-detail" data-testid="supplier-detail-inline">
      <div className="sup-detail-grid">
        {meta.map((m) => (
          <div className="sup-meta-item" key={m.label}>
            <span className="sup-meta-label">{m.label}</span>
            <span className="sup-meta-value" title={m.value}>
              {m.value}
            </span>
          </div>
        ))}
      </div>

      <div className="sup-detail-cols">
        <div className="sup-detail-col">
          <h4 className="sup-section-title">Pedidos de compra recientes</h4>
          <div className="sup-list">
            {ordersLoading ? (
              <div className="sup-list-empty">Cargando pedidos…</div>
            ) : recent.length === 0 ? (
              <div className="sup-list-empty">Sin pedidos todavía.</div>
            ) : (
              recent.map((o) => (
                <div className="sup-list-row" key={o.id}>
                  <span className="sup-list-info">
                    <span className="sup-list-name">#{shortId(o.id)}</span>
                    <span className="sup-list-sub">
                      {new Date(o.createdAt).toLocaleDateString('es-ES')}
                    </span>
                  </span>
                  <span className="sup-list-right">
                    <span className={`sup-mini-badge ${orderBadgeTone(o.status)}`}>
                      {STATUS_LABEL[o.status]}
                    </span>
                    <span className="sup-list-value">{o.lines.length} líneas</span>
                  </span>
                </div>
              ))
            )}
          </div>

          <h4 className="sup-section-title sup-section-title--spaced">Tarifa de compra</h4>
          <div className="sup-list">
            {pricesLoading ? (
              <div className="sup-list-empty">Cargando tarifa…</div>
            ) : prices.length === 0 ? (
              <div className="sup-list-empty">Sin tarifa registrada.</div>
            ) : (
              prices.slice(0, 5).map((p) => (
                <div className="sup-list-row" key={p.id}>
                  <span className="sup-list-info">
                    <span className="sup-list-name sup-list-name--plain">{p.productName}</span>
                    <span className="sup-list-sub">{p.sku ?? '—'}</span>
                  </span>
                  <span className="sup-list-value">{fmtEur(p.price)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="sup-detail-col">
          <h4 className="sup-section-title">Aprovisionamiento</h4>
          <div className="sup-prov">
            <div className="sup-prov-grid">
              <div className="sup-prov-item">
                <span className="sup-prov-label">Abiertos</span>
                <span className="sup-prov-value">{metrics.openCount}</span>
              </div>
              <div className="sup-prov-item">
                <span className="sup-prov-label">Por recibir</span>
                <span className="sup-prov-value">{porRecibir}</span>
              </div>
              <div className="sup-prov-item">
                <span className="sup-prov-label">Últ. recepción</span>
                <span className="sup-prov-value sup-prov-value--sm">{lastReceiptLabel}</span>
              </div>
            </div>
            <div className="sup-prov-bar">
              <span className="sup-prov-fill" style={{ width: `${relPct}%` }} />
            </div>
            <span className="sup-prov-note">
              {received.length}/{orders.length} pedidos recibidos
            </span>
          </div>

          <h4 className="sup-section-title sup-section-title--spaced">Actividad</h4>
          {recent.length === 0 ? (
            <p className="sup-detail-loading">Sin actividad reciente.</p>
          ) : (
            <div className="sup-timeline">
              {recent.map((o, i) => {
                const step = orderStep(o.status);
                return (
                  <div className="sup-tl-step" key={o.id}>
                    <div className="sup-tl-rail">
                      <span className={`sup-tl-dot sup-tl-dot--${step.tone}`} aria-hidden="true">
                        {step.glyph}
                      </span>
                      {i < recent.length - 1 && <span className="sup-tl-line" />}
                    </div>
                    <div className="sup-tl-body">
                      <span className="sup-tl-label">{step.label}</span>
                      <span className="sup-tl-when">
                        {new Date(o.createdAt).toLocaleDateString('es-ES')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="sup-detail-actions">
        <button
          type="button"
          className="sup-detail-btn"
          onClick={() => onEdit(supplier)}
          data-testid="supplier-edit"
        >
          <Pencil size={14} aria-hidden="true" />
          Editar proveedor
        </button>
        <button
          type="button"
          className="sup-detail-btn sup-detail-btn--danger"
          disabled={deleting}
          onClick={() => onDelete(supplier)}
          data-testid="supplier-delete"
        >
          <Trash2 size={14} aria-hidden="true" />
          {deleting ? 'Borrando…' : 'Borrar'}
        </button>
      </div>
    </div>
  );
}

function shortId(id: string): string {
  return id.replace(/-/g, '').slice(0, 6).toUpperCase();
}

function orderBadgeTone(status: PurchaseOrder['status']): string {
  if (status === 'RECEIVED') return 'sup-mini-badge--ok';
  if (status === 'CONFIRMED' || status === 'PARTIALLY_RECEIVED') return 'sup-mini-badge--warn';
  return '';
}

function orderStep(status: PurchaseOrder['status']): {
  tone: 'ok' | 'transit' | 'pending';
  glyph: string;
  label: string;
} {
  switch (status) {
    case 'RECEIVED':
      return { tone: 'ok', glyph: '✓', label: 'Pedido recibido' };
    case 'PARTIALLY_RECEIVED':
      return { tone: 'transit', glyph: '→', label: 'Recepción parcial' };
    case 'CONFIRMED':
      return { tone: 'transit', glyph: '→', label: 'Pedido confirmado' };
    default:
      return { tone: 'pending', glyph: '·', label: 'Borrador creado' };
  }
}
