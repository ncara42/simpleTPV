import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Mockeamos las libs de datos para renderizar sin red. La vista Existencias carga el
// stock global, el catálogo, las familias y las tiendas; las alertas viven en
// Notificaciones y los traspasos tienen su propia vista.
vi.mock('./lib/stock.js', () => ({
  getGlobalStock: vi.fn(() => Promise.resolve([])),
  adjustStock: vi.fn(),
  setMinStock: vi.fn(),
  createTransfer: vi.fn(() => Promise.resolve({ id: 't1' })),
  sendTransfer: vi.fn(() => Promise.resolve({ id: 't1' })),
}));
vi.mock('./lib/families.js', () => ({ listFamilies: vi.fn(() => Promise.resolve([])) }));
vi.mock('./lib/products.js', () => ({ listProducts: vi.fn(() => Promise.resolve([])) }));
vi.mock('./lib/admin.js', () => ({ listStores: vi.fn(() => Promise.resolve([])) }));
vi.mock('./lib/auth.js', () => ({ api: { subscribeEvents: vi.fn(() => () => {}) } }));

import { MemoryRouter } from 'react-router-dom';

import { StockPage } from './StockPage.js';

function renderPage(): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <StockPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('StockPage (Existencias)', () => {
  it('renderiza la vista facetada de existencias', () => {
    renderPage();
    expect(screen.getByTestId('stock-page')).toBeInTheDocument();
    expect(screen.getByTestId('existences-facets')).toBeInTheDocument();
  });

  it('muestra el estado vacío cuando no hay existencias', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('existences-empty')).toBeInTheDocument());
  });
});
