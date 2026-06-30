import type { CashSession } from '@simpletpv/auth';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CashCloseSummary } from './CashCloseSummary.js';

function session(
  expected: string,
  closing: string,
  difference: string,
  closingNote: string | null = null,
): CashSession {
  return {
    id: 'cs1',
    storeId: 's1',
    userId: 'u1',
    openingAmount: '100',
    closingAmount: closing,
    expectedAmount: expected,
    difference,
    status: 'CLOSED',
    openedAt: '2026-06-03T08:00:00.000Z',
    closedAt: '2026-06-03T20:00:00.000Z',
    closingNote,
  };
}

describe('CashCloseSummary', () => {
  it('muestra esperado, contado y diferencia con signo', () => {
    render(<CashCloseSummary session={session('150.00', '155.50', '5.50')} onDismiss={vi.fn()} />);
    expect(screen.getByTestId('cash-expected')).toHaveTextContent('150,00');
    expect(screen.getByTestId('cash-counted-result')).toHaveTextContent('155,50');
    expect(screen.getByTestId('cash-difference')).toHaveTextContent('+5,50');
  });

  it('invoca onDismiss al aceptar', () => {
    const onDismiss = vi.fn();
    render(<CashCloseSummary session={session('150', '150', '0')} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByTestId('cash-dismiss'));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('muestra la anotación del descuadre cuando existe', () => {
    render(
      <CashCloseSummary
        session={session('150', '140', '-10', 'Faltaba cambio al abrir')}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByTestId('cash-summary-note')).toHaveTextContent('Faltaba cambio al abrir');
  });

  it('no muestra anotación si el cierre cuadra', () => {
    render(<CashCloseSummary session={session('150', '150', '0')} onDismiss={vi.fn()} />);
    expect(screen.queryByTestId('cash-summary-note')).toBeNull();
  });
});
