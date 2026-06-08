import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Store } from './lib/admin.js';

const STORES: Store[] = [
  { id: 's1', name: 'Centro', code: '01', address: 'C/ Mayor 1', active: true },
  { id: 's2', name: 'Norte', code: '02', address: null, active: false },
];

vi.mock('./lib/admin.js', () => ({
  listStores: vi.fn(() => Promise.resolve(STORES)),
  createStore: vi.fn(),
  deleteStore: vi.fn(),
}));

// El modal de precios por tienda (#127 A) consulta overrides y productos; los
// mockeamos para que no toquen la API real al abrirse.
vi.mock('./lib/store-prices.js', () => ({
  listStorePrices: vi.fn(() => Promise.resolve([])),
  setStorePrice: vi.fn(),
  removeStorePrice: vi.fn(),
}));
vi.mock('./lib/products.js', () => ({
  listProducts: vi.fn(() => Promise.resolve([])),
}));

import { StoresPage } from './StoresPage.js';

function renderPage(): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <StoresPage onOpenStoreView={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('StoresPage', () => {
  it('renderiza la cabecera y las tarjetas de tienda (sin filtros)', async () => {
    renderPage();
    expect(screen.getByTestId('new-store')).toBeInTheDocument();
    // Ya no hay filtros de estado/periodo: el panel solo crea y observa.
    expect(screen.queryByTestId('store-status-filter')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByTestId('store-card')).toHaveLength(2));
  });

  it('abre el detalle al pulsar una tarjeta', async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId('store-card').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByTestId('store-card')[0]!);
    expect(screen.getByTestId('store-detail')).toBeInTheDocument();
  });

  it('abre el modal de precios por tienda al pulsar "Precios" (#127 A)', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getAllByTestId('store-open-prices').length).toBeGreaterThan(0),
    );
    fireEvent.click(screen.getAllByTestId('store-open-prices')[0]!);
    // El enlace lleva stopPropagation: abre precios, no el detalle de la tienda.
    expect(await screen.findByTestId('store-prices-detail')).toBeInTheDocument();
    expect(screen.queryByTestId('store-detail')).not.toBeInTheDocument();
  });
});
