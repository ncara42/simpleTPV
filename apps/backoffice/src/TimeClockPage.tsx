import { Select } from '@simpletpv/ui';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { usePageHeader } from './lib/pageHeader.js';
import { listHistoryAll } from './lib/time-clock.js';

// Minutos → "Xh Ym" (o "Ym" si es menos de una hora).
function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

// ISO → "HH:MM" (mismo criterio que el log de tienda: corte directo del ISO). Guion
// largo si la jornada no tiene entrada/salida registrada.
function hhmm(iso: string | null): string {
  return iso ? iso.slice(11, 16) : '—';
}

const msToMin = (ms: number): number => Math.round(ms / 60000);

interface Filters {
  storeId: string;
  userId: string;
  date: string;
}
const NO_FILTERS: Filters = { storeId: '', userId: '', date: '' };

export function TimeClockPage() {
  usePageHeader('Control horario', 'Fichajes por empleado y fecha · totales de horas');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const setFilter = (patch: Partial<Filters>): void => setFilters((f) => ({ ...f, ...patch }));

  // Histórico cross-tienda agregado por jornada (últimos 30 días, todas las tiendas
  // de la organización). El filtrado fino se hace en cliente sobre este conjunto.
  const { data: jornadas = [] } = useQuery({
    queryKey: ['timeclock-history-all'],
    queryFn: () => listHistoryAll(),
  });

  // Opciones de los filtros derivadas de las jornadas presentes: tiendas y empleados
  // deduplicados, fechas en orden descendente.
  const storeOptions = useMemo(
    () => [...new Map(jornadas.map((r) => [r.storeId, r.storeName]))],
    [jornadas],
  );
  const employeeOptions = useMemo(
    () => [...new Map(jornadas.map((r) => [r.userId, r.userName]))],
    [jornadas],
  );
  const dateOptions = useMemo(
    () => [...new Set(jornadas.map((r) => r.date))].sort().reverse(),
    [jornadas],
  );

  const filtered = useMemo(
    () =>
      jornadas.filter(
        (r) =>
          (!filters.storeId || r.storeId === filters.storeId) &&
          (!filters.userId || r.userId === filters.userId) &&
          (!filters.date || r.date === filters.date),
      ),
    [jornadas, filters],
  );

  const totals = useMemo(
    () => ({
      count: filtered.length,
      worked: filtered.reduce((acc, r) => acc + msToMin(r.workedMs), 0),
      breaks: filtered.reduce((acc, r) => acc + msToMin(r.breakMs), 0),
    }),
    [filtered],
  );

  const hasFilters = Boolean(filters.storeId || filters.userId || filters.date);

  return (
    <section className="catalog">
      <div className="table-panel">
        <div className="users-toolbar sales-toolbar">
          <div className="sales-filters">
            <Select
              className="catalog-search"
              value={filters.storeId}
              onChange={(value) => setFilter({ storeId: value })}
              ariaLabel="Filtrar por tienda"
              data-testid="timeclock-store"
              options={[
                { value: '', label: 'Todas las tiendas' },
                ...storeOptions.map(([id, name]) => ({ value: id, label: name })),
              ]}
            />
            <Select
              className="catalog-search"
              value={filters.userId}
              onChange={(value) => setFilter({ userId: value })}
              ariaLabel="Filtrar por empleado"
              data-testid="timeclock-employee"
              options={[
                { value: '', label: 'Todos los empleados' },
                ...employeeOptions.map(([id, name]) => ({ value: id, label: name })),
              ]}
            />
            <Select
              className="catalog-search"
              value={filters.date}
              onChange={(value) => setFilter({ date: value })}
              ariaLabel="Filtrar por fecha"
              data-testid="timeclock-date"
              options={[
                { value: '', label: 'Todas las fechas' },
                ...dateOptions.map((d) => ({ value: d, label: d })),
              ]}
            />
            {hasFilters && (
              <button
                type="button"
                className="users-sel-btn"
                onClick={() => setFilters(NO_FILTERS)}
                data-testid="timeclock-clear"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="catalog-empty" data-testid="timeclock-empty">
            Sin fichajes para los filtros seleccionados.
          </p>
        ) : (
          <table className="catalog-table" data-testid="timeclock-table">
            <thead>
              <tr>
                <th>Empleado</th>
                <th>Tienda</th>
                <th>Fecha</th>
                <th>Entrada</th>
                <th>Salida</th>
                <th>Pausas</th>
                <th>Horas</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={`${row.userId}-${row.storeId}-${row.date}`} data-testid="timeclock-row">
                  <td>{row.userName}</td>
                  <td className="muted">{row.storeName}</td>
                  <td className="muted">{row.date}</td>
                  <td className="muted tabular-nums">{hhmm(row.firstIn)}</td>
                  <td className="muted tabular-nums">{hhmm(row.lastOut)}</td>
                  <td className="muted tabular-nums">{fmtMinutes(msToMin(row.breakMs))}</td>
                  <td className="tabular-nums">{fmtMinutes(msToMin(row.workedMs))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr data-testid="timeclock-totals">
                <td colSpan={5}>{totals.count} jornadas</td>
                <td className="tabular-nums">{fmtMinutes(totals.breaks)}</td>
                <td className="tabular-nums">{fmtMinutes(totals.worked)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </section>
  );
}
