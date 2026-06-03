import type { Store } from '../lib/admin.js';
import { fmtEur } from '../lib/format.js';

// Tarjeta de tienda del grid: nombre, dirección, estado abierto/activo, ventas del
// periodo y acción de dormir/activar. Presentacional: recibe los datos derivados
// y los callbacks del padre.
export function StoreCard({
  store,
  active,
  open,
  sales,
  periodLabel,
  onSelect,
  onToggleActive,
}: {
  store: Store;
  active: boolean;
  open: boolean;
  sales: number;
  periodLabel: string;
  onSelect: () => void;
  onToggleActive: () => void;
}) {
  return (
    <div
      className="store-card"
      data-testid="store-card"
      onClick={onSelect}
      title="Ver detalle de la tienda"
    >
      <div className="store-card-top">
        <span className="store-card-icon" aria-hidden="true">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 9l1-5h16l1 5" />
            <path d="M4 9v11h16V9" />
            <path d="M9 20v-6h6v6" />
          </svg>
        </span>
        <span className="store-card-text">
          <span className="store-card-name">{store.name}</span>
          <span className="store-card-addr">{store.address ?? '—'}</span>
        </span>
        <span className="store-card-badges">
          <span className={`store-open ${open ? 'on' : 'off'}`} data-testid="store-open">
            <span className="store-open-dot" />
            {open ? 'Abierta' : 'Cerrada'}
          </span>
          <span className={`store-badge ${active ? 'active' : 'muted'}`} data-testid="store-status">
            {active ? 'Activa' : 'Dormida'}
          </span>
        </span>
      </div>
      <div className="store-card-foot">
        <span className="store-card-sales" data-testid="store-sales">
          <strong>{fmtEur(sales)}</strong>
          <span className="store-card-sales-label">ventas · {periodLabel}</span>
        </span>
        <button
          type="button"
          className="link-btn store-toggle"
          onClick={(e) => {
            e.stopPropagation();
            onToggleActive();
          }}
          data-testid="store-toggle"
        >
          {active ? 'Dormir' : 'Activar'}
        </button>
      </div>
    </div>
  );
}
