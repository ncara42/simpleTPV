import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./lib/families.js', () => ({
  listFamilies: vi.fn(() => Promise.resolve([])),
  createFamily: vi.fn(),
  updateFamily: vi.fn(),
  deleteFamily: vi.fn(),
}));

// El panel de productos del nodo (I-13) y el contador real (E-16) consultan
// /products; sin red en unit.
vi.mock('./lib/products.js', () => ({
  listProducts: vi.fn(() => Promise.resolve([])),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
}));

import { ConfirmProvider } from './components/ConfirmProvider.js';
import { FamiliesPage } from './FamiliesPage.js';
import { PageActionsProvider, usePageActionsValue } from './lib/pageActions.js';

// El CTA «Nueva familia» vive en el slot de acciones de la TopBar (usePageActions),
// no en la card. Montamos el provider + un slot que pinta su valor para poder
// asertarlo en aislamiento.
function ActionsSlot() {
  return <>{usePageActionsValue()}</>;
}

function renderPage(): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <PageActionsProvider>
        <ConfirmProvider>
          <ActionsSlot />
          <FamiliesPage />
        </ConfirmProvider>
      </PageActionsProvider>
    </QueryClientProvider>,
  );
}

describe('FamiliesPage', () => {
  it('renderiza la cabecera y el botón de nueva familia', () => {
    renderPage();
    expect(screen.getByTestId('new-family')).toBeInTheDocument();
  });

  it('muestra el vacío cuando no hay familias', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('families-empty')).toBeInTheDocument());
  });
});
