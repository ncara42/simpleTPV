import type { TimeClockLogRow } from '@simpletpv/auth';

import { api } from './auth.js';

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
