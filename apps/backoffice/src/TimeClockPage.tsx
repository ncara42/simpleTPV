import { type FacetedColumn, FacetedTable, type FacetSection } from '@simpletpv/ui';
import { usePageHeader } from '@simpletpv/ui';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { CsvActionButton } from './components/CsvActionButton.js';
import { FacetRail } from './components/FacetRail.js';
import { ImportExportModal } from './components/ImportExportModal.js';
import { ScrollShadowCell } from './components/ScrollShadowCell.js';
import { usePageActions } from './lib/pageActions.js';
import { fmtMinutes, hhmm, listHistoryAll, msToMin } from './lib/time-clock.js';

// Alterna una clave en un Set de forma inmutable.
function toggleInSet(set: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

export function TimeClockPage() {
  usePageHeader('Control horario', 'Fichajes por empleado y fecha · totales de horas');
  const [dataModal, setDataModal] = useState<'import' | 'export' | null>(null);
  // Facetas del carril: tienda y empleado en multi-selección (vacío = todas);
  // búsqueda por nombre de empleado. Mismo modelo que Existencias.
  const [search, setSearch] = useState('');
  const [storeIds, setStoreIds] = useState<ReadonlySet<string>>(new Set());
  const [userIds, setUserIds] = useState<ReadonlySet<string>>(new Set());
  // Días plegados (key = fecha): cabeceras de grupo plegables.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggleGroup = (key: string): void => setCollapsed((prev) => toggleInSet(prev, key));

  // Histórico cross-tienda agregado por jornada (últimos 30 días, todas las tiendas
  // de la organización). El filtrado fino se hace en cliente sobre este conjunto.
  const { data: jornadas = [], isLoading } = useQuery({
    queryKey: ['timeclock-history-all'],
    queryFn: () => listHistoryAll(),
  });

  type TimeRow = (typeof jornadas)[number];

  // Conjunto tras la búsqueda (alimenta los recuentos de las facetas, como en Inventario).
  const searched = useMemo<TimeRow[]>(
    () =>
      jornadas.filter((r) => !search || r.userName.toLowerCase().includes(search.toLowerCase())),
    [jornadas, search],
  );

  // Opciones de faceta (tienda/empleado) deduplicadas, con recuento sobre `searched`.
  const storeFacet = useMemo(
    () =>
      [...new Map(jornadas.map((r) => [r.storeId, r.storeName]))].map(([key, label]) => ({
        key,
        label,
        count: searched.filter((r) => r.storeId === key).length,
      })),
    [jornadas, searched],
  );
  const userFacet = useMemo(
    () =>
      [...new Map(jornadas.map((r) => [r.userId, r.userName]))].map(([key, label]) => ({
        key,
        label,
        count: searched.filter((r) => r.userId === key).length,
      })),
    [jornadas, searched],
  );

  const filtered = useMemo<TimeRow[]>(
    () =>
      searched.filter(
        (r) =>
          (storeIds.size === 0 || storeIds.has(r.storeId)) &&
          (userIds.size === 0 || userIds.has(r.userId)),
      ),
    [searched, storeIds, userIds],
  );

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

  const sections: FacetSection[] = [
    {
      kind: 'checks',
      title: 'Tienda',
      options: storeFacet,
      selected: storeIds,
      onToggle: (key) => setStoreIds((prev) => toggleInSet(prev, key)),
      testIdPrefix: 'timeclock-store',
    },
    {
      kind: 'checks',
      title: 'Empleado',
      options: userFacet,
      selected: userIds,
      onToggle: (key) => setUserIds((prev) => toggleInSet(prev, key)),
      testIdPrefix: 'timeclock-employee',
    },
  ];

  // Columnas de la tabla agrupada (la fecha sube a la cabecera de grupo).
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
        <div className="cat-layout">
          <FacetRail
            ariaLabel="Filtros de fichajes"
            testId="timeclock-facets"
            search={{
              value: search,
              onChange: setSearch,
              placeholder: 'Buscar empleado…',
              testId: 'timeclock-search',
            }}
            sections={sections}
          />
          <ScrollShadowCell className="cat-main" data-testid="timeclock-table">
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
