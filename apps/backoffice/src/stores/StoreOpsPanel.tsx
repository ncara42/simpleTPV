import { Button, Input } from '@simpletpv/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useConfirm } from '../components/ConfirmProvider.js';
import { setStoreCentral, type Store, updateStoreOps } from '../lib/admin.js';
import { createDevice, type DeviceSummary, revokeDevice } from '../lib/devices.js';
import { formErrorMessage } from '../lib/form-error.js';
import { fmtDayMonth } from '../lib/format.js';
import type { StoreLogEntry } from '../lib/time-clock.js';

interface StoreOpsPanelProps {
  store: Store;
  devices: DeviceSummary[];
  log: StoreLogEntry[];
}

// Panel 3 (operativa): estado operativo (verificada + incidencia), tienda central,
// dispositivos de fichaje y actividad reciente. Reencarnación EN LÍNEA de la mitad
// "administrativa" de StoreDetailModal — mismas mutaciones/claves de invalidación.
export function StoreOpsPanel({ store, devices, log }: StoreOpsPanelProps) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  // Token recién generado: se muestra UNA sola vez (no vuelve a viajar en el GET).
  const [token, setToken] = useState<string | null>(null);

  const invalidateDevices = (): void =>
    void qc.invalidateQueries({ queryKey: ['devices', store.id] });
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
  // formulario edita en local y guarda vía PATCH /stores/:id/ops; la verdad vuelve
  // por el invalidate de 'stores'.
  const [opsVerified, setOpsVerified] = useState(store.opsVerified);
  const [opsIncident, setOpsIncident] = useState(store.opsIncident ?? '');
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
  // Tienda central (#146): destino de los traspasos de efectivo. Una sola por
  // organización; marcar esta desmarca la anterior (el backend lo resuelve en una
  // transacción). La verdad vuelve por el invalidate de 'stores'.
  const centralMut = useMutation({
    mutationFn: (isCentral: boolean) => setStoreCentral(store.id, isCentral),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['stores'] }),
  });

  const lastOpen = log.find((e) => e.type === 'apertura') ?? null;
  const lastClose = log.find((e) => e.type === 'cierre') ?? null;

  return (
    <div className="store-ops-panel" data-testid="store-ops-panel">
      <div className="store-ops-head">
        <span className="store-ops-title">Operativa · {store.name}</span>
        <span className="store-ops-hint">Detalle en profundidad</span>
      </div>

      <div className="store-ops-sec" data-testid="store-ops">
        <h4 className="store-sec-title">Estado operativo</h4>
        <div className="store-ops-sec-body">
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
            <Input
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
          <Button
            type="button"
            disabled={!opsDirty || opsMut.isPending}
            onClick={() => opsMut.mutate()}
            data-testid="store-ops-save"
          >
            {opsMut.isPending
              ? 'Guardando…'
              : opsMut.isSuccess && !opsDirty
                ? 'Guardado ✓'
                : 'Guardar estado'}
          </Button>
        </div>
      </div>

      <div className="store-ops-sec" data-testid="store-central">
        <h4 className="store-sec-title">Tienda central</h4>
        <label className="switch">
          <input
            type="checkbox"
            checked={store.isCentral}
            disabled={centralMut.isPending}
            onChange={(e) => centralMut.mutate(e.target.checked)}
            data-testid="store-central-toggle"
          />
          <span className="switch-track">
            <span className="switch-thumb" />
          </span>
          <span className="switch-text">Destino de los traspasos de efectivo</span>
        </label>
        {centralMut.isError && (
          <p className="form-error">
            {formErrorMessage(centralMut.error, 'No se pudo cambiar la central.')}
          </p>
        )}
      </div>

      <div className="store-ops-sec" data-testid="store-device">
        <h4 className="store-sec-title">Dispositivos de fichaje</h4>
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
                  <span className={`store-device-state${d.authorized ? ' is-ok' : ''}`}>
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
                    Revocar
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <button
          type="button"
          className="link-btn"
          onClick={() => createMut.mutate()}
          disabled={createMut.isPending}
          data-testid="store-gen-token"
        >
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

      {(lastOpen || lastClose) && (
        <div className="store-ops-sec">
          <h4 className="store-sec-title">Actividad</h4>
          <div className="store-tl">
            <div className="store-tl-step">
              <div className="store-tl-rail">
                <span className={`store-tl-dot store-tl-dot--${lastOpen ? 'ok' : 'pending'}`}>
                  {lastOpen ? '↑' : '·'}
                </span>
                <span className="store-tl-line" />
              </div>
              <div className="store-tl-body">
                <span className="store-tl-label">
                  Apertura — {lastOpen ? lastOpen.name : 'Sin registro'}
                </span>
                <span className="store-tl-when">
                  {lastOpen ? `${fmtDayMonth(lastOpen.date)} · ${lastOpen.time}` : '—'}
                </span>
              </div>
            </div>
            <div className="store-tl-step">
              <div className="store-tl-rail">
                <span className="store-tl-dot store-tl-dot--done">↓</span>
              </div>
              <div className="store-tl-body">
                <span className="store-tl-label">
                  Cierre — {lastClose ? lastClose.name : 'Sin registro'}
                </span>
                <span className="store-tl-when">
                  {lastClose ? `${fmtDayMonth(lastClose.date)} · ${lastClose.time}` : '—'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
