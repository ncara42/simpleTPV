import './exploraciones.css';

import { ActivityFeed, BulletMeter, DonutStat, ProjectionArea } from '@simpletpv/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import {
  getCumulativeMonth,
  getRecentSales,
  getSalesByPayment,
  getSalesGoal,
  PAYMENT_METHOD_LABELS,
} from '../../lib/dashboard.js';
import { PanelShell } from './PanelShell.js';
import type { PanelProps } from './types.js';
import { useFitCount } from './useFitCount.js';

// Euros sin decimales (es-ES, con separador de miles) para el feed de tickets.
const nfEur0 = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
  useGrouping: 'always',
});

// Hora local 'HH:MM' de un ISO-8601; cadena vacía si no parsea.
function hhmm(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(d);
}

// Se piden más tickets de los que caben; `useFitCount` recorta a los que entran en el tile.
const RECENT_FETCH = 16;
const TICKET_ROW_H = 50;

// Sección 04 · Objetivo del periodo (BulletMeter): facturación en curso (tramo sólido) vs. el
// periodo anterior COMPLETO como objetivo (marca de tinta) + proyección a fin de periodo (tramo
// punteado). Datos reales de `/dashboard/sales-goal`. Si no hubo periodo anterior con ventas el
// objetivo es 0 → la molécula muestra «sin datos» (no se inventa una meta).
export function ExpGoal({ period, store }: PanelProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-sales-goal', period, store],
    queryFn: () => getSalesGoal(period, store),
    placeholderData: keepPreviousData,
  });
  const g = q.data;

  return (
    <PanelShell id="exp-objetivo" fit="natural">
      <BulletMeter
        value={g?.current ?? 0}
        target={g?.target ?? 0}
        {...(g?.projection != null ? { projection: g.projection } : {})}
        format="eur0"
        isLoading={q.isLoading}
        isError={q.isError}
      />
    </PanelShell>
  );
}

// Sección 04 · Métodos de pago (DonutStat): reparto de la facturación del periodo por método de
// pago, anillo monocromo + total al centro + leyenda. Datos de `/dashboard/sales-by-payment`.
export function ExpPaymentMethods({ period, store }: PanelProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-payment', period, store],
    queryFn: () => getSalesByPayment(period, store),
    placeholderData: keepPreviousData,
  });
  const items = (q.data ?? []).map((p) => ({
    label: PAYMENT_METHOD_LABELS[p.method] ?? p.method,
    value: p.revenue,
  }));

  return (
    <PanelShell id="exp-metodos-pago" fill>
      <DonutStat
        items={items}
        format="eur0"
        centerCaption={`${items.length} ${items.length === 1 ? 'método' : 'métodos'}`}
        legendMax={5}
        isLoading={q.isLoading}
        isError={q.isError}
      />
    </PanelShell>
  );
}

// Sección 04 · Tickets recientes (ActivityFeed): últimas ventas (importe + nº de ticket, tienda y
// hora) sobre la guía temporal. Nº de hitos adaptado a la altura del tile. Datos de
// `/dashboard/recent-sales` (ignora el periodo: siempre las más recientes).
export function ExpRecentTickets({ store }: PanelProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-recent-sales', store],
    queryFn: () => getRecentSales(RECENT_FETCH, store),
    placeholderData: keepPreviousData,
  });
  const all = (q.data ?? []).map((s) => ({
    title: (
      <>
        <strong>{nfEur0.format(s.total)}</strong> · {s.ticketNumber}
      </>
    ),
    meta: [s.storeName, hhmm(s.createdAt)].filter(Boolean).join(' · '),
    tone: 'accent' as const,
  }));
  const { ref, count } = useFitCount(TICKET_ROW_H, { min: 3, max: all.length || 1 });
  const items = all.slice(0, count);

  return (
    <PanelShell id="exp-tickets-recientes" fill>
      <div ref={ref} style={{ height: '100%' }}>
        <ActivityFeed items={items} isLoading={q.isLoading} isError={q.isError} />
      </div>
    </PanelShell>
  );
}

// Sección 04 · Acumulado del mes (ProjectionArea): facturación acumulada diaria del mes en curso
// (área azul, parcial) vs. el mes anterior completo (línea gris) + proyección a fin de mes (tramo
// punteado). Datos de `/dashboard/cumulative-month` (siempre el mes natural, ignora el periodo).
export function ExpCumulativeMonth({ store }: PanelProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-cumulative-month', store],
    queryFn: () => getCumulativeMonth(store),
    placeholderData: keepPreviousData,
  });
  const cm = q.data;

  return (
    <PanelShell id="exp-acumulado-mes" fit="stretch">
      <div className="exp-area">
        <ProjectionArea
          actual={cm?.actual ?? []}
          compare={cm?.compare ?? []}
          {...(cm?.projectionEnd != null ? { projectionEnd: cm.projectionEnd } : {})}
          {...(cm?.totalPoints ? { totalPoints: cm.totalPoints } : {})}
          isLoading={q.isLoading}
          isError={q.isError}
        />
      </div>
    </PanelShell>
  );
}
