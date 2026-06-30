import { type FacetedColumn, FacetedTable, Select } from '@simpletpv/ui';
import { usePageHeader } from '@simpletpv/ui';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { CsvActionButton } from './components/CsvActionButton.js';
import { ImportExportModal } from './components/ImportExportModal.js';
import { ScrollShadowCell } from './components/ScrollShadowCell.js';
import { usePageActions } from './lib/pageActions.js';
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
  const [dataModal, setDataModal] = useState<'import' | 'export' | null>(null);
  // Días plegados (key = fecha). Cabeceras de grupo plegables como en Inventario.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggleGroup = (key: string): void =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Histórico cross-tienda agregado por jornada (últimos 30 días, todas las tiendas
  // de la organización). El filtrado fino se hace en cliente sobre este conjunto.
  const { data: jornadas = [], isLoading } = useQuery({
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

  // Exportación de fichajes: cabeceras + filas (filtradas en memoria) para el modal.
  const exportHeaders = ['Empleado', 'Tienda', 'Fecha', 'Entrada', 'Salida', 'Pausas', 'Horas'];
  const buildExportRows = (): string[][] =>
    filtered.map((r) => [
      r.userName,
      r.storeName,
      r.date,
      hhmm(r.firstIn),
      hhmm(r.lastOut),
      fmtMinutes(msToMin(r.breakMs)),
      fmtMinutes(msToMin(r.workedMs)),
    ]);

  type TimeRow = (typeof filtered)[number];
  // Columnas de la tabla agrupada (la fecha sube a la cabecera de grupo, así que la
  // columna Fecha desaparece para no repetirla en cada fila).
  const timeclockColumns: FacetedColumn<TimeRow>[] = [
    { key: 'user', header: 'Empleado', variant: 'name', render: (r) => r.userName },
    { key: 'store', header: 'Tienda', variant: 'mid', render: (r) => r.storeName },
    {
      key: 'in',
      header: 'Entrada',
      variant: 'mid',
      render: (r) => <span className="tabular-nums">{hhmm(r.firstIn)}</span>,
    },
    {
      key: 'out',
      header: 'Salida',
      variant: 'mid',
      render: (r) => <span className="tabular-nums">{hhmm(r.lastOut)}</span>,
    },
    {
      key: 'breaks',
      header: 'Pausas',
      variant: 'num',
      render: (r) => <span className="muted">{fmtMinutes(msToMin(r.breakMs))}</span>,
    },
    {
      key: 'worked',
      header: 'Horas',
      variant: 'num',
      render: (r) => fmtMinutes(msToMin(r.workedMs)),
    },
  ];

  // Grupos por día (fecha desc): meta = nº jornadas, metaRight = horas trabajadas del día.
  const groups = useMemo(() => {
    const byDate = new Map<string, TimeRow[]>();
    for (const r of filtered) {
      const arr = byDate.get(r.date);
      if (arr) arr.push(r);
      else byDate.set(r.date, [r]);
    }
    return [...byDate.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, rows]) => ({
        key: date,
        label: date,
        meta: `${rows.length} ${rows.length === 1 ? 'jornada' : 'jornadas'}`,
        metaRight: fmtMinutes(rows.reduce((acc, r) => acc + msToMin(r.workedMs), 0)),
        rows,
      }));
  }, [filtered]);

  usePageActions(
    <CsvActionButton
      kind="export"
      label="Exportar"
      onClick={() => setDataModal('export')}
      testId="timeclock-export"
    />,
  );

  return (
    <section className="catalog catalog--faceted">
      <div className="inv-card">
        <div className="cat-card-toolbar">
          <div className="users-toolbar">
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
        </div>
        <ScrollShadowCell className="cat-main cat-main--solo" data-testid="timeclock-table">
          <FacetedTable<TimeRow>
            layout="table"
            columns={timeclockColumns}
            groups={groups}
            rowKey={(r) => `${r.userId}-${r.storeId}-${r.date}`}
            rowTestId="timeclock-row"
            loading={isLoading}
            collapsedKeys={collapsed}
            onToggleGroup={toggleGroup}
            emptyState={
              <span data-testid="timeclock-empty">
                Sin fichajes para los filtros seleccionados.
              </span>
            }
          />
        </ScrollShadowCell>
        <div className="cat-card-footer">
          <span data-testid="timeclock-totals">
            {totals.count} jornadas · pausas {fmtMinutes(totals.breaks)} · trabajadas{' '}
            {fmtMinutes(totals.worked)}
          </span>
        </div>
      </div>

      {dataModal && (
        <ImportExportModal
          title="Fichajes"
          initialMode={dataModal}
          onClose={() => setDataModal(null)}
          testId="timeclock-data-modal"
          exportConfig={{
            headers: exportHeaders,
            getRows: buildExportRows,
            filenameBase: 'control-horario',
          }}
        />
      )}
    </section>
  );
}
