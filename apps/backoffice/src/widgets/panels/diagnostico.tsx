import { ActivityFeed } from '@simpletpv/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import { listAlerts } from '../../lib/stock.js';
import { PanelShell } from './PanelShell.js';
import type { PanelProps } from './types.js';

// Hora local 'HH:MM' de un ISO; cadena vacía si no parsea.
function hhmm(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(d);
}

// Sección 06 · Diagnóstico — feed de actividad de alertas de stock (rotura crítica / stock bajo),
// con punto semántico por severidad sobre la guía temporal. Reusa el endpoint de alertas (sin periodo).
export function DiagnosticActivity({ store }: PanelProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-alerts', store],
    queryFn: () => listAlerts(store),
    placeholderData: keepPreviousData,
  });
  const items = (q.data ?? []).slice(0, 8).map((a) => {
    const tone: 'success' | 'danger' | 'warning' = a.resolved
      ? 'success'
      : a.severity === 'critical'
        ? 'danger'
        : 'warning';
    return {
      title: (
        <>
          <strong>{a.productName}</strong> · {a.severity === 'critical' ? 'rotura' : 'stock bajo'}
        </>
      ),
      meta: [a.storeName, hhmm(a.createdAt)].filter(Boolean).join(' · '),
      tone,
    };
  });

  return (
    <PanelShell id="diag-actividad" fill>
      <ActivityFeed items={items} isLoading={q.isLoading} isError={q.isError} />
    </PanelShell>
  );
}
