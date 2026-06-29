import './estado.css';

import type { PurchaseOrderStatus } from '@simpletpv/auth';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Fragment, type ReactElement } from 'react';

import { listStores } from '../../lib/admin.js';
import { listPendingCashMovements } from '../../lib/cash.js';
import { listPurchaseOrders } from '../../lib/purchases.js';
import { verifyVerifactuChain } from '../../lib/verifactu.js';
import { PanelShell } from './PanelShell.js';
import type { PanelProps } from './types.js';

// ── Iconos (stroke = currentColor; el color lo pone el contenedor por tono) ──
function CheckIcon({ size, width = 2.5 }: { size: number; width?: number }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12l5 5L20 6" stroke="currentColor" strokeWidth={width} />
    </svg>
  );
}
function AlertIcon({ size }: { size: number }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 7v6" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
      <circle cx="12" cy="17" r="1.3" fill="currentColor" />
    </svg>
  );
}

type Tone = 'success' | 'warning' | 'muted';

// ── 1 · Pasos: ciclo de un pedido de compra (DRAFT→CONFIRMED→PARTIALLY_RECEIVED→RECEIVED) ─────────
const STEP_LABELS = ['Pedido', 'Aprob.', 'Envío', 'Recib.'] as const;
// Índice del paso ACTUAL por estado. RECEIVED = 4 → los 4 pasos completados (sin paso «actual»).
const PO_CURRENT: Record<PurchaseOrderStatus, number> = {
  DRAFT: 0,
  CONFIRMED: 1,
  PARTIALLY_RECEIVED: 2,
  RECEIVED: 4,
};

export function StepProgress(_props: PanelProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-purchase-orders'],
    queryFn: () => listPurchaseOrders(),
    placeholderData: keepPreviousData,
  });
  const orders = q.data ?? [];
  // Pedido a seguir: el más reciente que aún no está recibido del todo; si todos recibidos, el último.
  const sorted = [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const tracked = sorted.find((o) => o.status !== 'RECEIVED') ?? sorted[0];
  // Sin pedidos → todos los pasos en «pendiente» (current = -1, nada hecho ni actual).
  const current = tracked ? PO_CURRENT[tracked.status] : -1;

  return (
    <PanelShell id="estado-pasos" bare>
      <div className="st-card">
        <div className="st-label">Pasos</div>
        <div className="st-steps">
          {STEP_LABELS.map((label, i) => {
            const state = i < current ? 'done' : i === current ? 'current' : 'todo';
            return (
              <Fragment key={label}>
                {i > 0 ? <span className={`st-bar st-bar--${i < current ? 'on' : 'off'}`} /> : null}
                <span className={`st-dot st-dot--${state}`}>
                  {state === 'done' ? <CheckIcon size={12} width={3.5} /> : i + 1}
                </span>
              </Fragment>
            );
          })}
        </div>
        <div className="st-step-labels">
          {STEP_LABELS.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      </div>
    </PanelShell>
  );
}

// ── 2 · Operativo: tiendas activas con estado operativo verificado y sin incidencia ──────────────
export function OperationalStatus(_props: PanelProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-stores'],
    queryFn: () => listStores(),
    placeholderData: keepPreviousData,
  });
  const active = (q.data ?? []).filter((s) => s.active);
  const online = active.filter((s) => s.opsVerified && !s.opsIncident).length;
  const total = active.length;
  const tone: Tone =
    q.data === undefined ? 'muted' : online === total && total > 0 ? 'success' : 'warning';

  return (
    <PanelShell id="estado-operativo" bare>
      <div className="st-card st-card--center">
        <span className={`st-op-badge st-tone-${tone}`}>
          {tone === 'success' ? <CheckIcon size={22} /> : <AlertIcon size={22} />}
        </span>
        <div className="st-op-title">{tone === 'success' ? 'Operativo' : 'Atención'}</div>
        <div className="st-op-sub">
          {total === 0 ? 'Sin tiendas activas' : `${online}/${total} tiendas online`}
        </div>
      </div>
    </PanelShell>
  );
}

// ── 3 · Cumplimiento: cadena VeriFactu íntegra + cajas sin movimientos pendientes de aprobar ──────
export function ComplianceChecks(_props: PanelProps): ReactElement {
  const chain = useQuery({
    queryKey: ['dash-verifactu-chain'],
    queryFn: () => verifyVerifactuChain(),
    placeholderData: keepPreviousData,
  });
  const cash = useQuery({
    queryKey: ['dash-cash-pending'],
    queryFn: () => listPendingCashMovements(),
    placeholderData: keepPreviousData,
  });

  const verifactuTone: Tone =
    chain.data === undefined ? 'muted' : chain.data.ok ? 'success' : 'warning';
  const pending = cash.data?.length ?? 0;
  const cashTone: Tone = cash.data === undefined ? 'muted' : pending === 0 ? 'success' : 'warning';

  const rows: Array<{ label: string; tone: Tone }> = [
    {
      label: verifactuTone === 'warning' ? 'VeriFactu con incidencias' : 'VeriFactu al día',
      tone: verifactuTone,
    },
    {
      label: cashTone === 'warning' ? `${pending} movimiento(s) por aprobar` : 'Cajas cuadradas',
      tone: cashTone,
    },
  ];

  return (
    <PanelShell id="estado-cumplimiento" bare>
      <div className="st-card">
        <div className="st-label">Cumplimiento</div>
        <div className="st-checks">
          {rows.map((r) => (
            <div className="st-check-row" key={r.label}>
              <span className={`st-check-badge st-tone-${r.tone}`}>
                {r.tone === 'success' ? (
                  <CheckIcon size={16} />
                ) : r.tone === 'warning' ? (
                  <AlertIcon size={16} />
                ) : null}
              </span>
              <span className="st-check-text">{r.label}</span>
            </div>
          ))}
        </div>
      </div>
    </PanelShell>
  );
}
