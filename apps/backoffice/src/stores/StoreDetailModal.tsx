import { useState } from 'react';

import { Modal } from '../components/Modal.js';
import { DEMO_STORE_LOG, type StoreOps } from '../demo/demoData.js';
import type { Store } from '../lib/admin.js';
import { fmtDayMonth } from '../lib/format.js';
import { StoreLogDrawer } from './StoreLogDrawer.js';

// Detalle de una tienda: historial de aperturas/cierres (quién y cuándo) y dispositivo
// autorizado. El estado abierta/cerrada y activa/dormida se ven y gestionan en la card.
// Presentacional: el estado vive en el padre y se modifica vía callbacks.
export function StoreDetailModal({
  store,
  ops,
  onPatchOps,
  onClose,
}: {
  store: Store;
  ops: StoreOps | undefined;
  onPatchOps: (patch: Partial<StoreOps>) => void;
  onClose: () => void;
}) {
  const [logOpen, setLogOpen] = useState(false);
  const log = DEMO_STORE_LOG[store.id] ?? [];
  // El registro está ordenado de más reciente a más antiguo: el primero de cada tipo
  // es el último movimiento de ese tipo.
  const lastOpen = log.find((e) => e.type === 'apertura') ?? null;
  const lastClose = log.find((e) => e.type === 'cierre') ?? null;

  const isIp = ops?.deviceType === 'ip';
  const deviceLabel = isIp ? 'IP del dispositivo' : 'Identificador del dispositivo';
  const devicePlaceholder = isIp ? 'p. ej. 83.45.12.7' : 'p. ej. TPV-01';

  return (
    <>
      <Modal onClose={onClose} className="modal--form store-detail-modal" testId="store-detail">
        <header className="modal-head">
          <h3>{store.name}</h3>
          <p className="modal-sub">
            {store.address ?? '—'} · Código {store.code}
          </p>
        </header>

        <div className="modal-body">
          <section className="form-section">
            <span className="form-section-title">Aperturas y cierres</span>
            <div className="store-log-summary" data-testid="store-detail-open">
              <div className="store-log-summary-row">
                <span className="store-log-tag is-open">Apertura</span>
                <span className="store-log-summary-who">
                  {lastOpen ? lastOpen.name : 'Sin registro'}
                </span>
                {lastOpen && (
                  <span className="store-log-summary-when">
                    {fmtDayMonth(lastOpen.date)} · {lastOpen.time}
                  </span>
                )}
              </div>
              <div className="store-log-summary-row">
                <span className="store-log-tag is-close">Cierre</span>
                <span className="store-log-summary-who">
                  {lastClose ? lastClose.name : 'Sin registro'}
                </span>
                {lastClose && (
                  <span className="store-log-summary-when">
                    {fmtDayMonth(lastClose.date)} · {lastClose.time}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              className="link-btn"
              onClick={() => setLogOpen(true)}
              data-testid="store-log-open"
            >
              Ver registros
            </button>
          </section>

          <section className="form-section" data-testid="store-device">
            <span className="form-section-title">Dispositivo autorizado</span>
            <label>
              {deviceLabel}
              <input
                value={ops?.deviceValue ?? ''}
                placeholder={devicePlaceholder}
                onChange={(e) => onPatchOps({ deviceValue: e.target.value, deviceVerified: false })}
                data-testid="store-device-value"
              />
            </label>
            {ops?.deviceVerified ? (
              <p className="store-device-note is-ok" data-testid="store-device-ok">
                <span className="store-device-note-icon" aria-hidden="true">
                  ✓
                </span>
                Dispositivo verificado.
              </p>
            ) : (
              <p className="store-device-note is-warn" data-testid="store-device-warn">
                <span className="store-device-note-icon" aria-hidden="true">
                  ⚠
                </span>
                Dispositivo no verificado: el TPV de esta tienda no podrá operar hasta autorizarlo.
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
          </section>
        </div>

        <div className="modal-foot">
          <button type="button" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </Modal>

      {logOpen && (
        <StoreLogDrawer storeName={store.name} entries={log} onClose={() => setLogOpen(false)} />
      )}
    </>
  );
}
