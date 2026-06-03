import type { StoreOps } from '../demo/demoData.js';
import type { Store } from '../lib/admin.js';

// Detalle de una tienda: estado administrativo (activa/dormida), estado operativo
// (fichaje abierto/cerrado) y dispositivo autorizado. Presentacional: el estado
// vive en el padre y se modifica vía callbacks.
export function StoreDetailModal({
  store,
  ops,
  active,
  onToggleActive,
  onPatchOps,
  onClose,
}: {
  store: Store;
  ops: StoreOps | undefined;
  active: boolean;
  onToggleActive: () => void;
  onPatchOps: (patch: Partial<StoreOps>) => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal--form"
        onClick={(e) => e.stopPropagation()}
        data-testid="store-detail"
      >
        <h3>{store.name}</h3>
        <p className="muted">
          {store.address ?? '—'} · Código {store.code}
        </p>

        <div className="store-detail-block">
          <span className="store-detail-label">Estado administrativo</span>
          <div className="store-detail-row">
            <span className={`store-badge ${active ? 'active' : 'muted'}`}>
              {active ? 'Activa' : 'Dormida'}
            </span>
            <button className="link-btn" onClick={onToggleActive}>
              {active ? 'Dormir' : 'Activar'}
            </button>
          </div>
        </div>

        <div className="store-detail-block">
          <span className="store-detail-label">Estado operativo (fichaje)</span>
          <div className="store-detail-row" data-testid="store-detail-open">
            <span className={`store-open ${ops?.open ? 'on' : 'off'}`}>
              <span className="store-open-dot" />
              {ops?.open ? 'Abierta' : 'Cerrada'}
            </span>
            <span className="muted">
              {ops?.open
                ? `Abrió ${ops.openedBy} a las ${ops.openedSince}`
                : 'Sin fichajes activos'}
            </span>
          </div>
          <button
            className="link-btn"
            onClick={() =>
              onPatchOps(
                ops?.open
                  ? { open: false, openedBy: null, openedSince: null }
                  : { open: true, openedBy: 'Tú', openedSince: 'ahora' },
              )
            }
            data-testid="store-open-toggle"
          >
            {ops?.open ? 'Forzar cierre' : 'Marcar abierta'}
          </button>
        </div>

        <div className="store-detail-block" data-testid="store-device">
          <span className="store-detail-label">Dispositivo autorizado</span>
          <label>
            {ops?.deviceType === 'ip' ? 'IP del dispositivo' : 'Identificador del dispositivo'}
            <input
              value={ops?.deviceValue ?? ''}
              placeholder={ops?.deviceType === 'ip' ? 'p. ej. 83.45.12.7' : 'p. ej. TPV-01'}
              onChange={(e) => onPatchOps({ deviceValue: e.target.value, deviceVerified: false })}
              data-testid="store-device-value"
            />
          </label>
          {ops?.deviceVerified ? (
            <p className="store-device-ok" data-testid="store-device-ok">
              ✓ Dispositivo verificado.
            </p>
          ) : (
            <p className="store-device-warn" data-testid="store-device-warn">
              ⚠ Dispositivo no verificado: el TPV de esta tienda no podrá operar hasta autorizarlo.
            </p>
          )}
          {!ops?.deviceVerified && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => onPatchOps({ deviceVerified: true })}
              data-testid="store-device-authorize"
            >
              Autorizar dispositivo
            </button>
          )}
        </div>

        <div className="modal-foot">
          <button type="button" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
