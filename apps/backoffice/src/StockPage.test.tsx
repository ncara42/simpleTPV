import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

// Mockeamos las libs de datos para renderizar sin red. El smoke test verifica el
// cableado del orquestador (pestañas + cambio de sección), independientemente de
// que la lógica viva en un único archivo o en componentes de sección separados.
vi.mock('./lib/stock.js', () => ({
  getGlobalStock: vi.fn(() => Promise.resolve([])),
  listAlerts: vi.fn(() => Promise.resolve([])),
  listTransfers: vi.fn(() => Promise.resolve([])),
  listMovements: vi.fn(() => Promise.resolve({ items: [] })),
  setMinStock: vi.fn(),
  sendTransfer: vi.fn(),
  createTransfer: vi.fn(),
}));
vi.mock('./lib/admin.js', () => ({ listStores: vi.fn(() => Promise.resolve([])) }));
vi.mock('./lib/auth.js', () => ({ api: { subscribeEvents: vi.fn(() => () => {}) } }));

import { StockPage } from './StockPage.js';

function renderPage(): ReactElement {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <StockPage />
    </QueryClientProvider>,
  );
  return <></>;
}

describe('StockPage', () => {
  it('renderiza las tres pestañas', () => {
    renderPage();
    expect(screen.getByTestId('stock-page')).toBeInTheDocument();
    expect(screen.getByTestId('stock-tab-global')).toBeInTheDocument();
    expect(screen.getByTestId('stock-tab-alerts')).toBeInTheDocument();
    expect(screen.getByTestId('stock-tab-transfers')).toBeInTheDocument();
  });

  it('muestra la sección global por defecto (KPIs + vacío sin datos)', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('stock-kpis')).toBeInTheDocument());
    expect(screen.getByTestId('stock-empty')).toBeInTheDocument();
  });

  it('cambia a Alertas y a Traspasos al pulsar las pestañas', async () => {
    renderPage();

    fireEvent.click(screen.getByTestId('stock-tab-alerts'));
    await waitFor(() => expect(screen.getByTestId('alerts-empty')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('stock-tab-transfers'));
    await waitFor(() => expect(screen.getByTestId('transfers-empty')).toBeInTheDocument());
  });
});
