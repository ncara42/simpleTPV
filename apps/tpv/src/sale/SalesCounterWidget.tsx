import { useQuery } from '@tanstack/react-query';

import { getSalesToday } from '../lib/dashboard.js';
import { eur } from '../lib/format.js';

// Tendencia del delta para colorear el badge (igual criterio que el backoffice:
// 0, null o no finito → neutro).
function deltaTone(value: number | null): 'up' | 'down' | 'flat' {
  if (value === null || !Number.isFinite(value) || value === 0) {
    return 'flat';
  }
  return value > 0 ? 'up' : 'down';
}

// Formatea el delta como en el backoffice (`+12.5 %`); '—' cuando no hay base de
// comparación (ayer sin ventas → deltaPct null).
function fmtDelta(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return '—';
  }
  return `${value > 0 ? '+' : ''}${value.toFixed(1)} %`;
}

const ARROW: Record<'up' | 'down' | 'flat', string> = { up: '▲', down: '▼', flat: '→' };

// Recuento diario compacto en la cabecera de la venta (#5): facturación de hoy
// frente a ayer de la tienda activa, con el delta %. Solo lectura. Mientras no hay
// tienda o la query carga, no ocupa espacio (no desplaza la cuadrícula).
export function SalesCounterWidget({ storeId }: { storeId: string | null }) {
  const { data } = useQuery({
    queryKey: ['tpv-sales-today', storeId],
    // `enabled` impide ejecutar sin tienda; el guard interno lo deja como
    // invariante explícito (nunca enviamos storeId null a la API).
    queryFn: () => {
      if (!storeId) {
        throw new Error('storeId requerido para el recuento diario');
      }
      return getSalesToday(storeId);
    },
    enabled: storeId !== null,
  });

  if (!data) {
    return null;
  }

  const tone = deltaTone(data.deltaPct);

  return (
    <div className="sales-counter" data-testid="sales-counter" aria-label="Recuento diario">
      <span className="sales-counter-label">Hoy</span>
      <strong className="sales-counter-today" data-testid="sales-counter-today">
        {eur(data.today.total)} €
      </strong>
      <span className="sales-counter-sep">·</span>
      <span className="sales-counter-yesterday">ayer {eur(data.yesterday.total)} €</span>
      <span className={`sales-counter-delta trend-${tone}`} data-testid="sales-counter-delta">
        {ARROW[tone]} {fmtDelta(data.deltaPct)}
      </span>
    </div>
  );
}
