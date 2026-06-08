import type { TimeClockHistoryRow, TimeClockLogRow } from '@simpletpv/auth';

import { api } from './auth.js';

export type { TimeClockHistoryRow };

// Filtros opcionales del histórico cross-tienda. Sin nada → últimos 30 días, todas
// las tiendas de la organización (lo resuelve el backend).
export interface TimeClockHistoryFilters {
  storeId?: string;
  userId?: string;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
}

// Histórico de fichajes agregado por jornada de TODAS las tiendas de la organización
// (GET /time-clock/history-all). Solo ADMIN/MANAGER (org-wide). Alimenta la vista
// Control horario del backoffice; el filtrado fino (tienda/empleado/fecha) se hace
// en cliente sobre el resultado, así que aquí solo se pasa lo imprescindible.
export function listHistoryAll(
  filters: TimeClockHistoryFilters = {},
): Promise<TimeClockHistoryRow[]> {
  const query: Record<string, string> = {};
  if (filters.storeId) query.storeId = filters.storeId;
  if (filters.userId) query.userId = filters.userId;
  if (filters.from) query.from = filters.from;
  if (filters.to) query.to = filters.to;
  return api.get<TimeClockHistoryRow[]>('/time-clock/history-all', query);
}

// Entrada del registro de fichajes de una tienda tal como la pinta el detalle de
// tienda (apertura/cierre por empleado). Fuente de verdad del tipo (antes vivía en
// los fixtures demo).
export interface StoreLogEntry {
  name: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  type: 'apertura' | 'cierre';
}

// Log de fichajes de una tienda (GET /time-clock/entries): mapea las entradas crudas
// (CLOCK_IN/CLOCK_OUT con nombre de empleado) a aperturas/cierres. Ignora las pausas.
export async function listStoreLog(storeId: string): Promise<StoreLogEntry[]> {
  const rows = await api.get<TimeClockLogRow[]>('/time-clock/entries', { storeId });
  return rows
    .filter((r) => r.type === 'CLOCK_IN' || r.type === 'CLOCK_OUT')
    .map((r) => ({
      name: r.userName,
      date: r.createdAt.slice(0, 10),
      time: r.createdAt.slice(11, 16),
      type: r.type === 'CLOCK_IN' ? 'apertura' : 'cierre',
    }));
}
