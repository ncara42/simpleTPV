import type { Store } from '../lib/admin.js';
import { fmtEur } from '../lib/format.js';

export function StoreCard({
  store,
  active,
  sales,
  periodLabel,
  onSelect,
}: {
  store: Store;
  active: boolean;
  sales: number;
  periodLabel: string;
  onSelect: () => void;
}) {
  return (
    <div
      className={`store-card${active ? '' : ' is-dormant'}`}
      data-testid="store-card"
      onClick={onSelect}
      title="Ver detalle de la tienda"
    >
      <div className="store-card-head">
        <span className="store-card-text">
          <span className="store-card-name">{store.name}</span>
          <span className="store-card-addr">{store.address ?? '—'}</span>
        </span>
        <span
          className={`store-open-icon${active ? ' on' : ''}`}
          data-testid="store-open"
          title={active ? 'Activa' : 'Dormida'}
          aria-label={active ? 'Tienda activa' : 'Tienda dormida'}
        >
          <svg className="store-icon-closed" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M2 20h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="14" cy="12" r="0.8" fill="currentColor" />
          </svg>
          <svg className="store-icon-open" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M13 4h3a2 2 0 0 1 2 2v14"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M2 20h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M13 20h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path
              d="M13 4.562v16.157a1 1 0 0 1-1.242.97L5 20V5.562a2 2 0 0 1 1.515-1.94l4-1A2 2 0 0 1 13 4.561Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="10" cy="12" r="0.8" fill="currentColor" />
          </svg>
        </span>
      </div>

      <div className="store-card-metric" data-testid="store-sales">
        <span className="store-card-sales-value">{fmtEur(sales)}</span>
        <span className="store-card-sales-label">{periodLabel}</span>
      </div>

      <div className="store-card-foot">
        <span className={`store-status-text${active ? '' : ' muted'}`} data-testid="store-status">
          {active ? 'Activa' : 'Dormida'}
        </span>
      </div>
    </div>
  );
}
