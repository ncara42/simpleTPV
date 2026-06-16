import type { CashMovement, CashMovementStatus, CashMovementType } from '@simpletpv/auth';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CashMovementRow } from './CashMovementRow.js';

function movement(
  type: CashMovementType,
  status: CashMovementStatus,
  amount = '30.00',
): CashMovement {
  return {
    id: 'cm1',
    cashSessionId: 'cs1',
    storeId: 's1',
    userId: 'u1',
    type,
    amount,
    reason: 'motivo',
    status,
    requestedById: 'u1',
    reviewedById: null,
    reviewedAt: null,
    targetStoreId: type === 'TRANSFER_OUT' ? 's2' : null,
    createdAt: '2026-06-16T08:00:00.000Z',
  };
}

describe('CashMovementRow', () => {
  it('una entrada APPROVED muestra signo + y el estado Aprobado', () => {
    render(
      <ul>
        <CashMovementRow movement={movement('IN', 'APPROVED')} />
      </ul>,
    );
    expect(screen.getByTestId('cash-movement-item')).toHaveTextContent('Entrada');
    expect(screen.getByTestId('cash-movement-item')).toHaveTextContent('+30,00');
    expect(screen.getByTestId('cash-movement-status')).toHaveTextContent('Aprobado');
  });

  it('una retirada PENDING muestra signo − y el estado Pendiente', () => {
    render(
      <ul>
        <CashMovementRow movement={movement('OUT', 'PENDING')} />
      </ul>,
    );
    expect(screen.getByTestId('cash-movement-item')).toHaveTextContent('Retirada');
    expect(screen.getByTestId('cash-movement-item')).toHaveTextContent('-30,00');
    expect(screen.getByTestId('cash-movement-status')).toHaveTextContent('Pendiente');
  });

  it('un traspaso DENIED se etiqueta como Traspaso a central, signo − y estado Denegado', () => {
    render(
      <ul>
        <CashMovementRow movement={movement('TRANSFER_OUT', 'DENIED', '50.00')} />
      </ul>,
    );
    expect(screen.getByTestId('cash-movement-item')).toHaveTextContent('Traspaso a central');
    expect(screen.getByTestId('cash-movement-item')).toHaveTextContent('-50,00');
    expect(screen.getByTestId('cash-movement-status')).toHaveTextContent('Denegado');
  });
});
