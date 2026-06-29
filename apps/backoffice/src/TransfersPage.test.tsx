import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./lib/stock.js', () => ({
  listTransfers: vi.fn(() => Promise.resolve([])),
  getGlobalStock: vi.fn(() => Promise.resolve([])),
  createTransfer: vi.fn(),
  sendTransfer: vi.fn(),
  receiveTransfer: vi.fn(),
  closeTransfer: vi.fn(),
}));
vi.mock('./lib/admin.js', () => ({ listStores: vi.fn(() => Promise.resolve([])) }));
vi.mock('./lib/products.js', () => ({ listProducts: vi.fn(() => Promise.resolve([])) }));

import { PageActionsProvider, usePageActionsValue } from './lib/pageActions.js';
import { TransfersPage } from './TransfersPage.js';

// El CTA «Nuevo traspaso» vive en el slot de acciones de la TopBar (usePageActions),
// no en la card. Montamos el provider + un slot que pinta su valor para asertarlo.
function ActionsSlot() {
  return <>{usePageActionsValue()}</>;
}

describe('TransfersPage', () => {
  it('muestra los traspasos (vacío) y la acción de nuevo traspaso', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <PageActionsProvider>
          <ActionsSlot />
          <TransfersPage />
        </PageActionsProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByTestId('transfers-page')).toBeInTheDocument();
    expect(screen.getByTestId('new-transfer')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('transfers-empty')).toBeInTheDocument());
  });
});
