import { HeatStrip } from '@simpletpv/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import { getSalesByHourOnDay, type SalesByHour } from '../../lib/dashboard.js';
import { PanelShell } from './PanelShell.js';
import type { PanelProps } from './types.js';

// Día de hoy (local) como 'YYYY-MM-DD' — mismo criterio que el selector de día de «Ventas por hora».
function todayLocalIso(): string {
  return new Intl.DateTimeFormat('en-CA').format(new Date());
}

// Sección 02 · Mapa de calor horario — una celda por hora con ventas; intensidad por facturación.
// Lectura instantánea de la hora punta del día (la celda más saturada = el máximo, marcada con anillo).
// Comparte el `queryKey` 'dash-hour' con el widget clásico de hora → caché compartida.
export function HourHeatmap({ store }: PanelProps): ReactElement {
  const day = todayLocalIso();
  const q = useQuery({
    queryKey: ['dash-hour', day, store],
    queryFn: () => getSalesByHourOnDay(day, store),
    placeholderData: keepPreviousData,
  });
  const cells = (q.data ?? []).map((h: SalesByHour) => ({ label: `${h.hour}`, value: h.revenue }));

  return (
    <PanelShell id="graf-heatmap" fill>
      <HeatStrip items={cells} isLoading={q.isLoading} isError={q.isError} />
    </PanelShell>
  );
}
