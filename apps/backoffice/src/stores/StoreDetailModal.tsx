import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Eye, KeyRound, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { useConfirm } from '../components/ConfirmProvider.js';
import { Modal } from '../components/Modal.js';
import type { Store } from '../lib/admin.js';
import { updateStoreOps } from '../lib/admin.js';
import { createDevice, listDevices, revokeDevice } from '../lib/devices.js';
import { formErrorMessage } from '../lib/form-error.js';
import { fmtDayMonth } from '../lib/format.js';
import { listStoreLog } from '../lib/time-clock.js';
import { StoreLogDrawer } from './StoreLogDrawer.js';

export function StoreDetailModal({
  store,
  onEdit,
  onDelete,
  deleteError,
  onClose,
}: {
  store: Store;
  onEdit: () => void;
  onDelete: () => void;
  deleteError: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [logOpen, setLogOpen] = useState(false);
  // Token recién generado: se muestra UNA sola vez (no vuelve a viajar en el GET).
  const [token, setToken] = useState<string | null>(null);

  // Dispositivos de fichaje REALES de la tienda (I-08): la verdad viene de la API
  // de devices, no de un check manual (E-02/E-03).
  const { data: devices = [] } = useQuery({
    queryKey: ['devices', store.id],
    queryFn: () => listDevices(store.id),
  });
  const invalidateDevices = () => void qc.invalidateQueries({ queryKey: ['devices', store.id] });
  const createMut = useMutation({
    mutationFn: () => createDevice({ storeId: store.id, name: `TPV ${store.code}` }),
    onSuccess: (d) => {
      setToken(d.pairingToken);
      invalidateDevices();
    },
  });
  const revokeMut = useMutation({ mutationFn: revokeDevice, onSuccess: invalidateDevices });
  const askRevoke = async (id: string, name: string): Promise<void> => {
    const ok = await confirm({
      title: 'Revocar dispositivo',
      message: `¿Revocar "${name}"? El TPV emparejado con él quedará bloqueado para fichar.`,
      confirmLabel: 'Revocar',
      danger: true,
    });
    if (ok) revokeMut.mutate(id);
  };
  const anyPaired = devices.some((d) => d.authorized);

  // Estado operativo MANUAL persistido (I-09/D-10): verificada + incidencia. El
  // formulario edita en local y guarda vía PATCH /stores/:id/ops; la verdad
  // vuelve por el invalidate de 'stores'.
  const [opsVerified, setOpsVerified] = useState(store.opsVerified);
  const [opsIncident, setOpsIncident] = useState(store.opsIncident ?? '');
  // Baseline local: el prop `store` es un snapshot del listado y no se refresca
  // dentro del modal; tras guardar, la baseline se sincroniza con lo enviado.
  const [opsBaseline, setOpsBaseline] = useState({
    verified: store.opsVerified,
    incident: store.opsIncident ?? '',
  });
  const opsDirty = opsVerified !== opsBaseline.verified || opsIncident !== opsBaseline.incident;
  const opsMut = useMutation({
    mutationFn: () => updateStoreOps(store.id, { verified: opsVerified, incident: opsIncident }),
    onSuccess: () => {
      setOpsBaseline({ verified: opsVerified, incident: opsIncident });
      void qc.invalidateQueries({ queryKey: ['stores'] });
    },
  });
  // Registro de fichajes real de la tienda (GET /time-clock/entries, lo más reciente
  // primero) → resumen de última apertura/cierre + drawer.
  const { data: log = [] } = useQuery({
    queryKey: ['store-log', store.id],
    queryFn: () => listStoreLog(store.id),
  });
  const lastOpen = log.find((e) => e.type === 'apertura') ?? null;
  const lastClose = log.find((e) => e.type === 'cierre') ?? null;

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
              <Eye size={15} aria-hidden="true" />
              Ver registros
            </button>
          </section>

          <section className="form-section" data-testid="store-ops">
            <span className="form-section-title">Estado operativo</span>
            <label className="switch">
              <input
                type="checkbox"
                checked={opsVerified}
                onChange={(e) => setOpsVerified(e.target.checked)}
                data-testid="store-ops-verified"
              />
              <span className="switch-track">
                <span className="switch-thumb" />
              </span>
              <span className="switch-text">Tienda verificada</span>
            </label>
            <label>
              Incidencias / notas
              <input
                placeholder="p. ej. persiana rota, obras en la calle…"
                value={opsIncident}
                onChange={(e) => setOpsIncident(e.target.value)}
                data-testid="store-ops-incident"
              />
            </label>
            {opsMut.isError && (
              <p className="form-error">
                {formErrorMessage(opsMut.error, 'No se pudo guardar el estado.')}
              </p>
            )}
            <button
              type="button"
              className="btn-primary"
              disabled={!opsDirty || opsMut.isPending}
              onClick={() => opsMut.mutate()}
              data-testid="store-ops-save"
            >
              {opsMut.isPending
                ? 'Guardando…'
                : opsMut.isSuccess && !opsDirty
                  ? 'Guardado ✓'
                  : 'Guardar estado'}
            </button>
          </section>

          <section className="form-section" data-testid="store-device">
            <span className="form-section-title">Dispositivos de fichaje</span>
            {devices.length === 0 ? (
              <p className="store-device-note is-warn" data-testid="store-device-warn">
                <span className="store-device-note-icon" aria-hidden="true">
                  ⚠
                </span>
                Sin dispositivos: el TPV de esta tienda no puede fichar hasta emparejar uno.
              </p>
            ) : (
              <>
                {anyPaired ? (
                  <p className="store-device-note is-ok" data-testid="store-device-ok">
                    <span className="store-device-note-icon" aria-hidden="true">
                      ✓
                    </span>
                    Hay un dispositivo emparejado: el fichaje está operativo.
                  </p>
                ) : (
                  <p className="store-device-note is-warn" data-testid="store-device-warn">
                    <span className="store-device-note-icon" aria-hidden="true">
                      ⚠
                    </span>
                    Token generado pero ningún dispositivo emparejado todavía.
                  </p>
                )}
                <ul className="store-device-list" data-testid="store-device-list">
                  {devices.map((d) => (
                    <li key={d.id} className="store-device-item" data-testid="store-device-item">
                      <span className="store-device-name">{d.name}</span>
                      <span className={`store-device-state ${d.authorized ? 'is-ok' : ''}`}>
                        {d.authorized
                          ? `Emparejado${d.pairedAt ? ` · ${fmtDayMonth(d.pairedAt)}` : ''}`
                          : 'Pendiente de emparejar'}
                      </span>
                      <button
                        type="button"
                        className="link-btn danger"
                        onClick={() => void askRevoke(d.id, d.name)}
                        data-testid="store-device-revoke"
                      >
                        <Ban size={15} aria-hidden="true" />
                        Revocar
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="store-device-token">
              <button
                type="button"
                className="link-btn"
                onClick={() => createMut.mutate()}
                disabled={createMut.isPending}
                data-testid="store-gen-token"
              >
                <KeyRound size={15} aria-hidden="true" />
                {createMut.isPending ? 'Generando…' : 'Generar token de fichaje'}
              </button>
              {createMut.isError && (
                <p className="form-error">
                  {formErrorMessage(createMut.error, 'No se pudo generar el token.')}
                </p>
              )}
              {token && (
                <p className="muted" data-testid="store-token-value">
                  Token (se muestra una sola vez — introdúcelo en el TPV): <code>{token}</code>{' '}
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => void navigator.clipboard?.writeText(token)}
                    data-testid="store-token-copy"
                  >
                    Copiar
                  </button>
                </p>
              )}
            </div>
          </section>
        </div>

        {deleteError && <p className="form-error">{deleteError}</p>}
        <div className="modal-foot modal-foot--split">
          <div className="modal-foot-actions">
            <button type="button" onClick={onEdit} data-testid="store-edit">
              <Pencil size={16} aria-hidden="true" />
              Editar
            </button>
            <button type="button" className="danger" onClick={onDelete} data-testid="store-delete">
              <Trash2 size={16} aria-hidden="true" />
              Borrar
            </button>
          </div>
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
