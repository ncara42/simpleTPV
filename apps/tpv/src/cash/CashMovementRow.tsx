import type { CashMovement, CashMovementStatus, CashMovementType } from '@simpletpv/auth';

import { eur } from '../lib/format.js';

// Etiquetas de tipo y estado de un movimiento de efectivo (#146). El TRANSFER_OUT
// (traspaso a central) sale del cajón igual que una retirada → signo negativo.
const TYPE_LABEL: Record<CashMovementType, string> = {
  IN: 'Entrada',
  OUT: 'Retirada',
  TRANSFER_OUT: 'Traspaso a central',
};

const STATUS_LABEL: Record<CashMovementStatus, string> = {
  PENDING: 'Pendiente',
  APPROVED: 'Aprobado',
  DENIED: 'Denegado',
};

// Una fila de la lista de movimientos/solicitudes de la caja: tipo + motivo,
// estado de la solicitud y el importe con su signo.
export function CashMovementRow({ movement }: { movement: CashMovement }) {
  const isCredit = movement.type === 'IN';
  return (
    <li data-testid="cash-movement-item">
      <span>
        {TYPE_LABEL[movement.type]} · {movement.reason}{' '}
        <span
          className={`cash-mv-status cash-mv-${movement.status.toLowerCase()}`}
          data-testid="cash-movement-status"
        >
          {STATUS_LABEL[movement.status]}
        </span>
      </span>
      <strong className="tabular-nums">
        {isCredit ? '+' : '-'}
        {eur(Number(movement.amount))} €
      </strong>
    </li>
  );
}
