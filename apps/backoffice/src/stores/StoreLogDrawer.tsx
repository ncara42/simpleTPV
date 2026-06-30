import { type FacetedColumn, FacetedTable } from '@simpletpv/ui';

import { fmtDayMonth } from '../lib/format.js';
import type { StoreLogEntry } from '../lib/time-clock.js';

// Pop-up lateral (derecha) con el registro de fichajes de una tienda: tabla
// agrupada por día (mismo lenguaje que Fichajes/Inventario) con empleado, hora y
// movimiento (apertura/cierre). Presentacional.
export function StoreLogDrawer({
  storeName,
  entries,
  onClose,
}: {
  storeName: string;
  entries: StoreLogEntry[];
  onClose: () => void;
}) {
  const columns: FacetedColumn<StoreLogEntry>[] = [
    { key: 'name', header: 'Empleado', variant: 'name', render: (e) => e.name },
    {
      key: 'time',
      header: 'Hora',
      variant: 'mid',
      render: (e) => <span className="store-log-time">{e.time}</span>,
    },
    {
      key: 'type',
      header: 'Movimiento',
      variant: 'state',
      render: (e) => (
        <span className={`store-log-tag ${e.type === 'apertura' ? 'is-open' : 'is-close'}`}>
          {e.type === 'apertura' ? 'Apertura' : 'Cierre'}
        </span>
      ),
    },
  ];

  // Grupos por día, conservando el orden de llegada (más reciente primero).
  const groups = (() => {
    const byDate = new Map<string, StoreLogEntry[]>();
    for (const e of entries) {
      const arr = byDate.get(e.date);
      if (arr) arr.push(e);
      else byDate.set(e.date, [e]);
    }
    return [...byDate.entries()].map(([date, rows]) => ({
      key: date,
      label: fmtDayMonth(date),
      meta: `${rows.length} ${rows.length === 1 ? 'registro' : 'registros'}`,
      rows,
    }));
  })();

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="store-log-drawer"
        role="dialog"
        aria-label={`Registro de fichajes de ${storeName}`}
        onClick={(e) => e.stopPropagation()}
        data-testid="store-log-drawer"
      >
        <header className="store-log-drawer-head">
          <div>
            <h3>Registro de fichajes</h3>
            <p className="modal-sub">{storeName} · aperturas y cierres</p>
          </div>
          <button
            type="button"
            className="drawer-close"
            onClick={onClose}
            aria-label="Cerrar registro"
            data-testid="store-log-close"
          >
            ✕
          </button>
        </header>

        {entries.length === 0 ? (
          <p className="store-log-empty" data-testid="store-log-empty">
            Sin registros de fichaje.
          </p>
        ) : (
          <div className="cat-main cat-main--solo store-log-main" data-testid="store-log-table">
            <FacetedTable<StoreLogEntry>
              layout="table"
              columns={columns}
              groups={groups}
              rowKey={(e) => `${e.date}-${e.time}-${e.type}-${e.name}`}
              rowTestId="store-log-row"
            />
          </div>
        )}
      </aside>
    </div>
  );
}
