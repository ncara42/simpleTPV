import { Select } from '@simpletpv/ui';
import { useMemo, useState } from 'react';

import { DEMO_TIME_CLOCK } from './demo/demoData.js';
import { usePageHeader } from './lib/pageHeader.js';

// Tiendas, empleados y fechas presentes en los fichajes, para poblar los filtros.
const STORE_OPTIONS = Array.from(new Map(DEMO_TIME_CLOCK.map((r) => [r.storeId, r.storeName])));
const EMPLOYEE_OPTIONS = Array.from(new Map(DEMO_TIME_CLOCK.map((r) => [r.userId, r.userName])));
const DATE_OPTIONS = Array.from(new Set(DEMO_TIME_CLOCK.map((r) => r.date)))
  .sort()
  .reverse();

// Minutos → "Xh Ym" (o "Ym" si es menos de una hora).
function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

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

  const filtered = useMemo(
    () =>
      DEMO_TIME_CLOCK.filter(
        (r) =>
          (!filters.storeId || r.storeId === filters.storeId) &&
          (!filters.userId || r.userId === filters.userId) &&
          (!filters.date || r.date === filters.date),
      ),
    [filters],
  );

  const totals = useMemo(
    () => ({
      count: filtered.length,
      worked: filtered.reduce((acc, r) => acc + r.workedMinutes, 0),
      breaks: filtered.reduce((acc, r) => acc + r.breakMinutes, 0),
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
                ...STORE_OPTIONS.map(([id, name]) => ({ value: id, label: name })),
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
                ...EMPLOYEE_OPTIONS.map(([id, name]) => ({ value: id, label: name })),
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
                ...DATE_OPTIONS.map((d) => ({ value: d, label: d })),
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
                <tr key={row.id} data-testid="timeclock-row">
                  <td>{row.userName}</td>
                  <td className="muted">{row.storeName}</td>
                  <td className="muted">{row.date}</td>
                  <td className="muted tabular-nums">{row.firstIn}</td>
                  <td className="muted tabular-nums">{row.lastOut}</td>
                  <td className="muted tabular-nums">{fmtMinutes(row.breakMinutes)}</td>
                  <td className="tabular-nums">{fmtMinutes(row.workedMinutes)}</td>
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
