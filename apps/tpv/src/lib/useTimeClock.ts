import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { currentDevice, timeClockToday } from './time-clock.js';

// Estado del fichaje del turno actual con contador en vivo, compartido entre el
// panel de Fichaje y el item del sidebar. Las queries se deduplican por
// queryKey, así que ambos consumidores leen el mismo dato sin doble fetch.
export function useTimeClock(storeId: string | null) {
  const device = useQuery({ queryKey: ['official-device'], queryFn: currentDevice });
  const authorized = device.data?.authorized === true;

  const summaryQuery = useQuery({
    queryKey: ['time-clock-today', storeId],
    queryFn: () => timeClockToday(storeId as string),
    enabled: storeId !== null && authorized,
  });
  const summary = summaryQuery.data;
  const status = summary?.status ?? 'OUT';

  // Reloj en vivo: avanza el contador cada segundo mientras se está fichado.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (status !== 'IN') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [status]);

  const workedMs = summary?.workedMs ?? 0;
  const liveWorkedMs =
    status === 'IN' && summary?.runningSince
      ? workedMs + (now - new Date(summary.runningSince).getTime())
      : workedMs;

  return { device, authorized, summary, summaryQuery, status, liveWorkedMs } as const;
}
