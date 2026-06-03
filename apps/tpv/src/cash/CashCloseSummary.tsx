import type { CashSession } from '@simpletpv/auth';

import { eur } from '../lib/format.js';

// Resumen del cierre de caja con cuadre: esperado vs contado y diferencia
// (sobrante/faltante). Presentacional: recibe la sesión ya cerrada.
export function CashCloseSummary({
  session,
  onDismiss,
}: {
  session: CashSession;
  onDismiss: () => void;
}) {
  const expected = Number(session.expectedAmount ?? 0);
  const counted = Number(session.closingAmount ?? 0);
  const difference = Number(session.difference ?? 0);
  const diffClass =
    difference > 0
      ? 'cash-diff-positive'
      : difference < 0
        ? 'cash-diff-negative'
        : 'cash-diff-zero';

  return (
    <section className="cash-panel closed" data-testid="cash-panel">
      <div className="cash-bar">
        <div className="cash-status">
          <span className="cash-dot" />
          <span className="cash-badge" data-testid="cash-status">
            Caja cerrada
          </span>
        </div>
      </div>
      <div className="cash-form" style={{ paddingTop: 0 }}>
        <div className="cash-reconciliation" data-testid="cash-summary">
          <div className="cash-recon-row">
            <span style={{ color: 'var(--ui-text-muted)' }}>Esperado</span>
            <span data-testid="cash-expected">{eur(expected)} €</span>
          </div>
          <div className="cash-recon-row">
            <span style={{ color: 'var(--ui-text-muted)' }}>Contado</span>
            <span data-testid="cash-counted-result">{eur(counted)} €</span>
          </div>
          <div className={`cash-recon-row cash-diff ${diffClass}`}>
            <span>Diferencia</span>
            <span data-testid="cash-difference">
              {difference > 0 ? '+' : ''}
              {eur(difference)} €
            </span>
          </div>
        </div>
        <button
          className="cash-btn-cancel"
          onClick={onDismiss}
          data-testid="cash-dismiss"
          style={{ width: '100%' }}
        >
          Aceptar
        </button>
      </div>
    </section>
  );
}
