import type { StoreLogEntry } from '../demo/demoData.js';
import { fmtDayMonth } from '../lib/format.js';

// Pop-up lateral (derecha) con el registro de fichajes de una tienda: tabla con
// empleado, fecha, hora y movimiento (apertura/cierre). Presentacional.
export function StoreLogDrawer({
  storeName,
  entries,
  onClose,
}: {
  storeName: string;
  entries: StoreLogEntry[];
  onClose: () => void;
}) {
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
          <div className="store-log-table-wrap">
            <table className="catalog-table store-log-table" data-testid="store-log-table">
              <thead>
                <tr>
                  <th>Empleado</th>
                  <th>Fecha</th>
                  <th>Hora</th>
                  <th>Movimiento</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={`${e.date}-${e.time}-${e.type}`}>
                    <td>{e.name}</td>
                    <td className="muted">{fmtDayMonth(e.date)}</td>
                    <td className="store-log-time">{e.time}</td>
                    <td>
                      <span
                        className={`store-log-tag ${e.type === 'apertura' ? 'is-open' : 'is-close'}`}
                      >
                        {e.type === 'apertura' ? 'Apertura' : 'Cierre'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </aside>
    </div>
  );
}
