import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Mockeamos las libs de datos para renderizar sin red. Stock ya solo muestra el
// stock global: las alertas viven en Notificaciones y los traspasos en su propia
// vista (ya no hay desplegable de sección dentro de Stock).
vi.mock('./lib/stock.js', () => ({
  getGlobalStock: vi.fn(() => Promise.resolve([])),
  listMovements: vi.fn(() => Promise.resolve({ items: [] })),
  listAlerts: vi.fn(() => Promise.resolve([])),
  adjustStock: vi.fn(),
  setMinStock: vi.fn(),
}));
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

describe('StockPage', () => {
  it('renderiza la vista de stock global', () => {
    renderPage();
    expect(screen.getByTestId('stock-page')).toBeInTheDocument();
  });

  it('muestra la tabla vacía sin datos y ya no pinta el desplegable de sección', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('stock-empty')).toBeInTheDocument());
    expect(screen.queryByTestId('stock-subtabs')).not.toBeInTheDocument();
  });
});
