import type { PurchaseOrder, Supplier } from '@simpletpv/auth';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { fmtEur } from '../lib/format.js';
import { listPurchaseOrders } from '../lib/purchases.js';
import { listSupplierPrices } from '../lib/supplier-prices.js';
import { STATUS_LABEL } from './labels.js';
import type { SupplierGroup, SupplierMetrics, SupplierRow } from './suppliers-view.js';

// Tabla de Proveedores agrupada por estado (Activos · Inactivos) con detalle EN LÍNEA
// (acordeón), hermana de la de Traspasos (stock/TransfersTable). Cabecera fija; cabeceras
// de grupo plegables; filas con proveedor + lead time, fiabilidad, pedidos abiertos,
// volumen 12m y estado. Al pulsar una fila se despliega su detalle (datos, pedidos,
// tarifa, aprovisionamiento, actividad y acciones), igual que el acordeón de Traspasos.

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

  const isEmpty = groups.length === 0;

  return (
    <div className="sup-main" data-testid="suppliers-table">
      {isEmpty ? (
        <div className="sup-empty" data-testid="suppliers-empty">
          {empty}
        </div>
      ) : (
        <table className="sup-table">
          <colgroup>
            <col />
            <col className="sup-col-lead" />
            <col className="sup-col-ontime" />
            <col className="sup-col-open" />
            <col className="sup-col-bought" />
            <col className="sup-col-state" />
          </colgroup>
          <thead className="sup-thead">
            <tr>
              <th className="sup-th-name">Proveedor</th>
              <th className="sup-th-num">Lead time</th>
              <th className="sup-th-num">A tiempo</th>
              <th className="sup-th-num">Abiertos</th>
              <th className="sup-th-num">Pedidos 12m</th>
              <th>Estado</th>
            </tr>
          </thead>
          {groups.map((group) => {
            const isCollapsed = collapsed.has(group.key);
            return (
              <tbody key={group.key}>
                <tr className="sup-group-head" onClick={() => toggleGroup(group.key)}>
                  <td className="sup-group-cell" colSpan={6}>
                    <div className="sup-group-inner">
                      <ChevronDown
                        size={15}
                        className={`sup-group-caret${isCollapsed ? ' is-collapsed' : ''}`}
                        aria-hidden="true"
                      />
                      <span className="sup-group-name">{group.label}</span>
                      <span className="sup-group-count">
                        · {group.count} {group.count === 1 ? 'proveedor' : 'proveedores'}
                      </span>
                      <span className="sup-group-total">
                        {group.openTotal} {group.openTotal === 1 ? 'abierto' : 'abiertos'}
                      </span>
                    </div>
                  </td>
                </tr>
                {!isCollapsed &&
                  group.rows.map((row) => (
                    <SupplierTableRow
                      key={row.supplier.id}
                      row={row}
                      expanded={expandedId === row.supplier.id}
                      onToggle={() => onToggleExpand(row.supplier.id)}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      deleting={deletingId === row.supplier.id}
                    />
                  ))}
              </tbody>
            );
          })}
        </table>
      )}
    </div>
  );
}

interface SupplierTableRowProps {
  row: SupplierRow;
  expanded: boolean;
  onToggle: () => void;
  onEdit: (supplier: Supplier) => void;
  onDelete: (supplier: Supplier) => void;
  deleting: boolean;
}

function SupplierTableRow({
  row,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  deleting,
}: SupplierTableRowProps) {
  const { supplier, metrics } = row;
  return (
    <>
      <tr
        className={`sup-row${expanded ? ' is-expanded' : ''}`}
        data-testid="supplier-row"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <td className="sup-cell-name">
          <div className="sup-cell-name-row">
            <ChevronRight
              size={13}
              className={`sup-row-caret${expanded ? ' is-expanded' : ''}`}
              aria-hidden="true"
            />
            <span className="sup-name" data-testid="supplier-name">
              {supplier.name}
            </span>
          </div>
        </td>
        <td className="sup-cell-lead">{supplier.leadTimeDays} d</td>
        <td className={`sup-cell-ontime ${onTimeTone(metrics.onTimePct)}`}>
          {metrics.onTimePct == null ? '—' : `${metrics.onTimePct}%`}
        </td>
        <td className="sup-cell-open">
          <span
            className={`sup-badge ${metrics.openCount > 0 ? 'sup-badge--open' : 'sup-badge--neutral'}`}
          >
            {metrics.openCount}
          </span>
        </td>
        <td className="sup-cell-bought">{metrics.orders12m}</td>
        <td>
          <span className={`sup-state sup-state--${supplier.active ? 'active' : 'inactive'}`}>
            <span className="sup-state-dot" aria-hidden="true" />
            {supplier.active ? 'Activo' : 'Inactivo'}
          </span>
        </td>
      </tr>
      {expanded && (
        <tr className="sup-detail-row">
          <td className="sup-detail-cell" colSpan={6}>
            <SupplierRowDetail
              supplier={supplier}
              metrics={metrics}
              onEdit={onEdit}
              onDelete={onDelete}
              deleting={deleting}
            />
          </td>
        </tr>
      )}
    </>
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
