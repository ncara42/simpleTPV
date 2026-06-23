import { SectionHeader, StatusPill, WidgetStates } from './atoms.js';
import { formatValue } from './format.js';

// Lista de alertas de stock (roturas / caducidad): nombre + detalle + estado (StatusPill) +
// cantidad/umbral. Presentacional; la capa de datos mapea /stock/alerts y /stock/expiring.
export interface StockAlertItem {
  name: string;
  /** Tienda, lote o fecha de caducidad. */
  detail?: string;
  /** Unidades (caducidades). Las alertas de rotura no traen cantidad → se omite la columna. */
  quantity?: number;
  threshold?: number;
  tone: 'ok' | 'warn' | 'danger';
  status: string;
}
export interface StockAlertListProps {
  title?: string;
  items: StockAlertItem[];
  isLoading?: boolean;
  isError?: boolean;
}

export function StockAlertList({
  title,
  items,
  isLoading = false,
  isError = false,
}: StockAlertListProps) {
  let body;
  if (isLoading) body = <WidgetStates state="loading" />;
  else if (isError) body = <WidgetStates state="error" />;
  else if (!items || items.length === 0) body = <WidgetStates state="empty" />;
  else
    body = (
      <ul className="dv-stock">
        {items.map((it, i) => (
          <li key={`${it.name}-${i}`} className={`dv-stock-row dv-stock-row--${it.tone}`}>
            <div className="dv-stock-main">
              <span className="dv-stock-name">{it.name}</span>
              {it.detail ? <span className="dv-stock-detail">{it.detail}</span> : null}
            </div>
            <StatusPill label={it.status} tone={it.tone} />
            {it.quantity != null ? (
              <span className="dv-stock-qty">
                {formatValue(it.quantity, 'integer')}
                {it.threshold != null ? (
                  <span className="dv-stock-threshold">
                    {' '}
                    / {formatValue(it.threshold, 'integer')}
                  </span>
                ) : null}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    );
  return (
    <figure className="dv-stock-wrap">
      {title ? <SectionHeader title={title} /> : null}
      {body}
    </figure>
  );
}
