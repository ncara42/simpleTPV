import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/cash.js', () => ({ listClosedCashSessions: vi.fn() }));

import { listClosedCashSessions } from '../lib/cash.js';
import { CashClosuresList } from './CashClosuresList.js';

const mockedList = vi.mocked(listClosedCashSessions);

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function session(over: Record<string, unknown> = {}) {
  return {
    id: 'cs-1',
    storeId: 'store-1',
    userId: 'u-1',
    openingAmount: '100.00',
    closingAmount: '350.00',
    expectedAmount: '350.00',
    difference: '0.00',
    status: 'CLOSED',
    openedAt: '2026-06-16T08:00:00.000Z',
    closedAt: '2026-06-16T20:00:00.000Z',
    ...over,
  };
}

describe('CashClosuresList', () => {
  it('no renderiza ni consulta sin tienda activa', () => {
    const { container } = renderWithClient(<CashClosuresList storeId={null} />);
    expect(container).toBeEmptyDOMElement();
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('muestra el aviso de vacío cuando no hay cierres', async () => {
    mockedList.mockResolvedValue([] as never);
    renderWithClient(<CashClosuresList storeId="store-1" />);
    expect(await screen.findByTestId('cash-closures-empty')).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledWith('store-1');
  });

  it('lista cierres con su cuadre y marca sobrante/faltante', async () => {
    mockedList.mockResolvedValue([
      session({ id: 'cs-2', difference: '5.00', closingAmount: '355.00' }),
      session({ id: 'cs-3', difference: '-3.00', closingAmount: '347.00' }),
    ] as never);

    renderWithClient(<CashClosuresList storeId="store-1" />);

    const rows = await screen.findAllByTestId('cash-closure-row');
    expect(rows).toHaveLength(2);
    const diffs = screen.getAllByTestId('cash-closure-diff');
    expect(diffs[0]).toHaveTextContent('+5,00');
    expect(diffs[0]).toHaveClass('diff-over');
    expect(diffs[1]).toHaveTextContent('-3,00');
    expect(diffs[1]).toHaveClass('diff-under');
  });
});
