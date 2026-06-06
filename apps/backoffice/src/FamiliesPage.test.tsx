import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./lib/families.js', () => ({
  listFamilies: vi.fn(() => Promise.resolve([])),
  createFamily: vi.fn(),
  updateFamily: vi.fn(),
  deleteFamily: vi.fn(),
}));

import { ConfirmProvider } from './components/ConfirmProvider.js';
import { FamiliesPage } from './FamiliesPage.js';

function renderPage(): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ConfirmProvider>
        <FamiliesPage />
      </ConfirmProvider>
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
