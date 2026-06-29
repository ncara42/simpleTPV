import { Copy, Pencil, Plus, Tags, Trash2 } from 'lucide-react';

import { useScrollShadow } from '../hooks/use-scroll-shadow.js';
import { fmtEur } from '../lib/format.js';
import {
  discountLabel,
  initials,
  pctSigned,
  type PriceListView,
  productRows,
  swCode,
  tipoLabel,
} from './pricelist-facets.js';

// Columna derecha: ficha de la tarifa. Cabecera (código · nombre · descuento · estado
// + acciones), stats derivadas, datos de la tarifa, tabla de precios por producto y
// los clientes que la usan. Reutiliza el lenguaje visual de la ficha de Clientes
// (`.cust-*`, `.ventas-*`); lo específico de tarifas vive en `pricelists.css`.

export interface PriceListDetailCustomer {
  id: string;
  name: string;
  subtitle: string;
  billed12m: number;
  active: boolean;
}

interface PriceListDetailProps {
  priceList: PriceListView | null;
  customers: PriceListDetailCustomer[];
  detailLoading: boolean;
  onEdit: (t: PriceListView) => void;
  onDuplicate: (t: PriceListView) => void;
  onDelete: (t: PriceListView) => void;
  onAddProduct: (t: PriceListView) => void;
  onEditItem: (productId: string, name: string, price: number) => void;
  onRemoveItem: (productId: string, name: string) => void;
}

export function PriceListDetail({
  priceList,
  customers,
  detailLoading,
  onEdit,
  onDuplicate,
  onDelete,
  onAddProduct,
  onEditItem,
  onRemoveItem,
}: PriceListDetailProps) {
  const { scrollRef, sentinelRef, showShadow } = useScrollShadow();
  if (!priceList) {
    return (
      <div className="pl-detail" data-testid="b2b-pricelist-detail">
        <div className="ventas-detail-blank">
          <Tags size={22} aria-hidden="true" />
          <span className="ventas-detail-blank-title">Selecciona una tarifa</span>
          <span className="ventas-detail-blank-text">
            Elige una tarifa de la lista para ver sus precios por producto y los clientes que la
            usan.
          </span>
        </div>
      </div>
    );
  }

  const t = priceList;
  const isBase = t.tipo === 'base';
  const desc = isBase
    ? 'Tarifa base · precios de venta al público (PVP)'
    : `Descuento medio ${discountLabel(t.avgDiscount)} sobre PVP`;
  const rows = productRows(t);

  const stats: Array<{ label: string; value: string; tone?: string }> = [
    { label: 'Facturado 12m', value: fmtEur(t.billed12m) },
    { label: 'Clientes', value: String(t.customerCount) },
    { label: 'Productos', value: String(t.itemCount) },
    {
      label: 'Dto. medio',
      value: discountLabel(t.avgDiscount),
      tone: isBase ? 'muted' : 'disc',
    },
  ];

  const meta: Array<{ label: string; value: string }> = [
    { label: 'Tipo', value: tipoLabel(t.tipo) },
    { label: 'Descuento', value: isBase ? '—' : `${discountLabel(t.avgDiscount)} sobre PVP` },
    { label: 'Productos con precio', value: String(t.itemCount) },
    { label: 'Clientes asignados', value: String(t.customerCount) },
  ];

  return (
    <div
      className={`pl-detail scroll-shadow-host${showShadow ? ' has-scroll-shadow' : ''}`}
      data-testid="b2b-pricelist-detail"
    >
      <div className="pl-detail-head">
        <div className="cust-detail-id">
          <span className="cust-avatar cust-avatar--lg" aria-hidden="true">
            {swCode(t.name)}
          </span>
          <div className="cust-detail-titles">
            <div className="cust-detail-name-row">
              <span className="cust-detail-name" data-testid="b2b-pricelist-detail-name">
                {t.name}
              </span>
              {/* El descuento y el estado no se marcan con píldoras en la cabecera:
                  el descuento ya vive en el subtítulo, las stats y los datos; el estado
                  solo se señala cuando es relevante (inactiva), como en Clientes. */}
              {!t.active && (
                <span className="cust-badge" data-tone="off">
                  <span className="cust-badge-dot" />
                  Inactiva
                </span>
              )}
            </div>
            <div className="cust-detail-sub">{desc}</div>
          </div>
        </div>
        <div className="cust-detail-actions">
          <button
            type="button"
            className="ventas-btn ventas-btn--icon"
            onClick={() => onDuplicate(t)}
            data-testid="b2b-pricelist-duplicate"
            title="Duplicar"
            aria-label="Duplicar tarifa"
          >
            <Copy size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="ventas-btn ventas-btn--icon"
            onClick={() => onEdit(t)}
            data-testid="b2b-pricelist-edit"
            title="Editar"
            aria-label="Editar tarifa"
          >
            <Pencil size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="ventas-btn ventas-btn--primary"
            onClick={() => onAddProduct(t)}
            data-testid="b2b-pricelist-add-product"
          >
            <Plus size={15} aria-hidden="true" />
            {isBase ? 'Fijar precio' : 'Añadir producto'}
          </button>
          {/* Borrar al extremo derecho: solo icono, neutro en reposo y rojo (peligro)
              al pasar el ratón / enfocar (reutiliza `.cust-del-btn`, como en Clientes). */}
          <button
            type="button"
            className="ventas-btn ventas-btn--icon cust-del-btn"
            onClick={() => onDelete(t)}
            data-testid="b2b-pricelist-delete-header"
            title="Eliminar tarifa"
            aria-label="Eliminar tarifa"
          >
            <Trash2 size={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="pl-detail-body" ref={scrollRef}>
        <div className="cust-stats">
          {stats.map((s) => (
            <div className="cust-stat" key={s.label}>
              <span className="cust-stat-label">{s.label}</span>
              <span className="cust-stat-value cust-num" data-tone={s.tone ?? 'plain'}>
                {s.value}
              </span>
            </div>
          ))}
        </div>

        <div>
          <h4 className="ventas-section-title">Datos de la tarifa</h4>
          <div className="ventas-meta-grid">
            {meta.map((m) => (
              <div className="ventas-meta" key={m.label}>
                <span className="ventas-meta-label">{m.label}</span>
                <span className="ventas-meta-value">{m.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="pl-section-head">
            <h4 className="ventas-section-title">Precios por producto</h4>
            <span className="pl-section-note">
              {t.itemCount} producto{t.itemCount !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="pl-products" data-testid="b2b-pricelist-items">
            <div className="pl-products-head">
              <span>Producto</span>
              <span className="pl-r">PVP</span>
              <span className="pl-r">Precio</span>
              <span className="pl-r">Δ</span>
              <span aria-hidden="true" />
            </div>
            {detailLoading ? (
              <div className="pl-products-empty">Cargando precios…</div>
            ) : rows.length === 0 ? (
              <div className="pl-products-empty">Sin precios fijados todavía.</div>
            ) : (
              rows.map((p) => (
                <div className="pl-product-row" key={p.productId} data-testid="b2b-pricelist-item">
                  <span className="pl-product-name">{p.name}</span>
                  <span className="cust-num pl-r" data-tone="muted">
                    {p.pvp === null ? '—' : fmtEur(p.pvp)}
                  </span>
                  <span className="cust-num pl-r pl-product-price">{fmtEur(p.price)}</span>
                  <span className="cust-num pl-r" data-tone={p.delta === null ? 'muted' : 'disc'}>
                    {p.delta === null ? '—' : pctSigned(p.delta)}
                  </span>
                  <span className="pl-product-actions">
                    <button
                      type="button"
                      className="pl-icon-btn"
                      title="Editar precio"
                      aria-label={`Editar precio de ${p.name}`}
                      onClick={() => onEditItem(p.productId, p.name, p.price)}
                    >
                      <Pencil size={13} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="pl-icon-btn pl-icon-btn--danger"
                      title="Quitar producto"
                      aria-label={`Quitar ${p.name} de la tarifa`}
                      onClick={() => onRemoveItem(p.productId, p.name)}
                    >
                      <Trash2 size={13} aria-hidden="true" />
                    </button>
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <div className="pl-section-head">
            <h4 className="ventas-section-title">Clientes con esta tarifa</h4>
            <span className="pl-section-note">{customers.length} en total</span>
          </div>
          {customers.length === 0 ? (
            <div className="pl-cust-empty">Sin clientes asignados a esta tarifa.</div>
          ) : (
            <div className="pl-cust" data-testid="b2b-pricelist-customers">
              {customers.map((c) => (
                <div className="pl-cust-row" key={c.id}>
                  <span className="cust-avatar" aria-hidden="true">
                    {initials(c.name)}
                  </span>
                  <span className="pl-cust-body">
                    <span className="pl-cust-name">{c.name}</span>
                    <span className="pl-cust-sub">{c.subtitle}</span>
                  </span>
                  <span className="cust-num pl-cust-billed">{fmtEur(c.billed12m)}</span>
                  <span className="cust-badge" data-tone={c.active ? 'ok' : 'off'}>
                    <span className="cust-badge-dot" />
                    {c.active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <span className="scroll-shadow-sentinel" ref={sentinelRef} aria-hidden="true" />
      </div>
    </div>
  );
}
