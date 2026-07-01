import { BarChart2, Receipt, ScrollText, Tag } from 'lucide-react';
import { useState } from 'react';

import type { Store } from '../lib/admin.js';
import type { DeviceSummary } from '../lib/devices.js';
import { fmtDayMonth, fmtEur } from '../lib/format.js';
import type { StoreLogEntry } from '../lib/time-clock.js';
import { StoreLogDrawer } from './StoreLogDrawer.js';

interface StoreChip {
  label: string;
  cls: 'is-ok' | 'is-warn' | 'is-brand' | 'is-muted';
}

interface StoreDetailPanelProps {
  store: Store;
  /** Venta del periodo activo (ya resuelta por StoresPage vía getSalesByStore). */
  sales: number;
  /** «Ventas · Hoy/Semana/Mes» — etiqueta del periodo activo. */
  periodCaption: string;
  devices: DeviceSummary[];
  log: StoreLogEntry[];
  onEdit: () => void;
  onDelete: () => void;
  deleteError: string | null;
  onOpenStock: () => void;
  onOpenSales: () => void;
  onOpenPrices: () => void;
}

// Panel 2 (ficha): identidad + venta del periodo como métrica destacada + chips de
// estado + datos + accesos rápidos + resumen de aperturas/cierres + Editar/Borrar.
// Reencarnación EN LÍNEA (no modal) de la mitad "identidad" de StoreDetailModal;
// misma lógica de chips/accesos, solo cambia la presentación.
export function StoreDetailPanel({
  store,
  sales,
  periodCaption,
  devices,
  log,
  onEdit,
  onDelete,
  deleteError,
  onOpenStock,
  onOpenSales,
  onOpenPrices,
}: StoreDetailPanelProps) {
  const [logOpen, setLogOpen] = useState(false);
  const anyPaired = devices.some((d) => d.authorized);
  const hasIncident = (store.opsIncident ?? '').trim() !== '';

  const chips: StoreChip[] = [
    store.opsVerified
      ? { label: 'Verificada', cls: 'is-ok' }
      : { label: 'Sin verificar', cls: 'is-muted' },
    ...(hasIncident ? [{ label: 'Incidencia', cls: 'is-warn' as const }] : []),
    ...(store.isCentral ? [{ label: 'Central', cls: 'is-brand' as const }] : []),
    devices.length === 0
      ? { label: 'Sin dispositivos', cls: 'is-warn' }
      : anyPaired
        ? { label: 'Fichaje operativo', cls: 'is-ok' }
        : { label: 'Pendiente de emparejar', cls: 'is-muted' },
  ];

  const devicesValue =
    devices.length === 0
      ? 'Ninguno'
      : anyPaired
        ? `${devices.filter((d) => d.authorized).length} emparejado${devices.filter((d) => d.authorized).length > 1 ? 's' : ''}`
        : 'Pendiente';

  const lastOpen = log.find((e) => e.type === 'apertura') ?? null;
  const lastClose = log.find((e) => e.type === 'cierre') ?? null;

  return (
    <div className="store-ficha" data-testid="store-detail-panel">
      <div className="store-ficha-head">
        <div className="store-ficha-name">{store.name}</div>
        <div className="store-ficha-sub">
          {store.address ?? '—'} · Código {store.code}
        </div>
        <div className="store-hero">
          <span className="store-hero-val">{fmtEur(sales)}</span>
          <span className="store-hero-cap">{periodCaption}</span>
        </div>
        <div className="store-chips">
          {chips.map((c) => (
            <span key={c.label} className={`store-chip ${c.cls}`}>
              {c.label}
            </span>
          ))}
        </div>
      </div>

      <div className="store-ficha-body">
        <div className="store-sec">
          <h4 className="store-sec-title">Datos de la tienda</h4>
          <div className="store-meta-grid">
            <div className="store-meta">
              <span className="store-meta-label">Código</span>
              <span className="store-meta-value">{store.code}</span>
            </div>
            {/* «Alta» del prototipo no existe en el modelo Store real (sin createdAt);
                se sustituye por el estado activa/dormida, ya disponible. */}
            <div className="store-meta">
              <span className="store-meta-label">Estado</span>
              <span className="store-meta-value">{store.active ? 'Activa' : 'Dormida'}</span>
            </div>
            <div className="store-meta">
              <span className="store-meta-label">Dirección</span>
              <span className="store-meta-value">{store.address ?? '—'}</span>
            </div>
            <div className="store-meta">
              <span className="store-meta-label">Dispositivos</span>
              <span className="store-meta-value">{devicesValue}</span>
            </div>
          </div>
        </div>

        <div className="store-sec">
          <h4 className="store-sec-title">Accesos rápidos</h4>
          <div className="store-quick">
            <button
              type="button"
              className="store-quick-btn"
              onClick={() => setLogOpen(true)}
              data-testid="store-log-open"
            >
              <ScrollText className="store-quick-ico" size={15} aria-hidden="true" />
              Registros
            </button>
            <button
              type="button"
              className="store-quick-btn"
              onClick={onOpenStock}
              data-testid="store-open-stock"
            >
              <BarChart2 className="store-quick-ico" size={15} aria-hidden="true" />
              Stock
            </button>
            <button
              type="button"
              className="store-quick-btn"
              onClick={onOpenSales}
              data-testid="store-open-sales"
            >
              <Receipt className="store-quick-ico" size={15} aria-hidden="true" />
              Ventas
            </button>
            <button
              type="button"
              className="store-quick-btn"
              onClick={onOpenPrices}
              data-testid="store-open-prices"
            >
              <Tag className="store-quick-ico" size={15} aria-hidden="true" />
              Precios
            </button>
          </div>
        </div>

        <div className="store-sec" data-testid="store-detail-open">
          <h4 className="store-sec-title">Aperturas y cierres</h4>
          <div className="store-log-summary">
            <div className="store-log-summary-row">
              <span className="store-log-tag is-open">Apertura</span>
              <span className="store-log-summary-who">
                {lastOpen ? lastOpen.name : 'Sin registro'}
              </span>
              {lastOpen && (
                <span className="store-log-summary-when">
                  {fmtDayMonth(lastOpen.date)} · {lastOpen.time}
                </span>
              )}
            </div>
            <div className="store-log-summary-row">
              <span className="store-log-tag is-close">Cierre</span>
              <span className="store-log-summary-who">
                {lastClose ? lastClose.name : 'Sin registro'}
              </span>
              {lastClose && (
                <span className="store-log-summary-when">
                  {fmtDayMonth(lastClose.date)} · {lastClose.time}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {deleteError && <p className="form-error">{deleteError}</p>}
      <div className="store-ficha-foot">
        <button type="button" className="store-foot-btn" onClick={onEdit} data-testid="store-edit">
          Editar
        </button>
        <button
          type="button"
          className="store-foot-btn store-foot-btn--danger"
          onClick={onDelete}
          data-testid="store-delete"
        >
          Borrar
        </button>
      </div>

      {logOpen && (
        <StoreLogDrawer storeName={store.name} entries={log} onClose={() => setLogOpen(false)} />
      )}
    </div>
  );
}
