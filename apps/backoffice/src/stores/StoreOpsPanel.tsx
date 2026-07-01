import { Button, Input } from '@simpletpv/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
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
// Las cuatro secciones viven en tarjetas hermanas de las del resto de paneles
// (superficie + hairline + radio lg) sobre el fondo recesado de la columna.
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

  const saveLabel = opsMut.isPending
    ? 'Guardando…'
    : opsMut.isSuccess && !opsDirty
      ? 'Guardado ✓'
      : 'Guardar estado';

  return (
    <div className="store-ops-panel" data-testid="store-ops-panel">
      <header className="store-ops-head">
        <span className="store-ops-title">Operativa</span>
        <span className="store-ops-hint">Estado, dispositivos y actividad de {store.name}</span>
      </header>

      <section className="store-ops-card" data-testid="store-ops">
        <h4 className="store-sec-title">Estado operativo</h4>
        <label className="switch store-ops-toggle">
          <span className="store-ops-toggle-text">
            <span className="store-ops-toggle-name">Tienda verificada</span>
            <span className="store-ops-toggle-desc">Revisada y lista para operar.</span>
          </span>
          <input
            type="checkbox"
            checked={opsVerified}
            onChange={(e) => setOpsVerified(e.target.checked)}
            data-testid="store-ops-verified"
          />
          <span className="switch-track">
            <span className="switch-thumb" />
          </span>
        </label>
        <label className="store-ops-field">
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
        <div className="store-ops-actions">
          <Button
            type="button"
            size="sm"
            disabled={!opsDirty || opsMut.isPending}
            onClick={() => opsMut.mutate()}
            data-testid="store-ops-save"
          >
            {saveLabel}
          </Button>
        </div>
      </section>

      <section className="store-ops-card" data-testid="store-central">
        <h4 className="store-sec-title">Tienda central</h4>
        <label className="switch store-ops-toggle">
          <span className="store-ops-toggle-text">
            <span className="store-ops-toggle-name">Destino de traspasos</span>
            <span className="store-ops-toggle-desc">
              Recibe el efectivo transferido desde el resto de tiendas.
            </span>
          </span>
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
        </label>
        {centralMut.isError && (
          <p className="form-error">
            {formErrorMessage(centralMut.error, 'No se pudo cambiar la central.')}
          </p>
        )}
      </section>

      <section className="store-ops-card" data-testid="store-device">
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
                    className="store-ops-revoke"
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
        <div className="store-ops-actions">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={<KeyRound size={15} aria-hidden="true" />}
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending}
            data-testid="store-gen-token"
          >
            {createMut.isPending ? 'Generando…' : 'Generar token de fichaje'}
          </Button>
        </div>
        {createMut.isError && (
          <p className="form-error">
            {formErrorMessage(createMut.error, 'No se pudo generar el token.')}
          </p>
        )}
        {token && (
          <p className="store-ops-token" data-testid="store-token-value">
            <span className="store-ops-token-label">Token · se muestra una sola vez</span>
            <code>{token}</code>
            <button
              type="button"
              className="store-ops-revoke store-ops-token-copy"
              onClick={() => void navigator.clipboard?.writeText(token)}
              data-testid="store-token-copy"
            >
              Copiar
            </button>
          </p>
        )}
      </section>

      {(lastOpen || lastClose) && (
        <section className="store-ops-card">
          <h4 className="store-sec-title">Actividad reciente</h4>
          <div className="store-log-summary">
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
        </section>
      )}
    </div>
  );
}
