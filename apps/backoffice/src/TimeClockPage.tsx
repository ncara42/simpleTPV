import { DataTable, type DataTableColumn, Select } from '@simpletpv/ui';
import { usePageHeader } from '@simpletpv/ui';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { fmtMinutes, hhmm, listHistoryAll, msToMin } from './lib/time-clock.js';

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

  type TimeRow = (typeof filtered)[number];
  const timeclockColumns: DataTableColumn<TimeRow>[] = [
    { key: 'user', header: 'Empleado', render: (r) => r.userName },
    { key: 'store', header: 'Tienda', render: (r) => <span className="muted">{r.storeName}</span> },
    { key: 'date', header: 'Fecha', render: (r) => <span className="muted">{r.date}</span> },
    {
      key: 'in',
      header: 'Entrada',
      render: (r) => <span className="muted tabular-nums">{hhmm(r.firstIn)}</span>,
    },
    {
      key: 'out',
      header: 'Salida',
      render: (r) => <span className="muted tabular-nums">{hhmm(r.lastOut)}</span>,
    },
    {
      key: 'breaks',
      header: 'Pausas',
      align: 'right',
      render: (r) => <span className="muted tabular-nums">{fmtMinutes(msToMin(r.breakMs))}</span>,
    },
    {
      key: 'worked',
      header: 'Horas',
      align: 'right',
      render: (r) => <span className="tabular-nums">{fmtMinutes(msToMin(r.workedMs))}</span>,
    },
  ];

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

        <DataTable
          columns={timeclockColumns}
          rows={filtered}
          rowKey={(r) => `${r.userId}-${r.storeId}-${r.date}`}
          rowTestId="timeclock-row"
          footer={
            <span data-testid="timeclock-totals">
              {totals.count} jornadas · pausas {fmtMinutes(totals.breaks)} · trabajadas{' '}
              {fmtMinutes(totals.worked)}
            </span>
          }
          emptyState={
            <span data-testid="timeclock-empty">Sin fichajes para los filtros seleccionados.</span>
          }
          data-testid="timeclock-table"
        />
      </div>
    </section>
  );
}
