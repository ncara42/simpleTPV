import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Libs de datos mockeadas para renderizar sin red. El smoke test fija el cableado
// del orquestador (tres pestañas + cambio de sección) antes de descomponerlo.
vi.mock('./lib/purchases.js', () => ({
  listSuppliers: vi.fn(() => Promise.resolve([])),
  listPurchaseOrders: vi.fn(() => Promise.resolve([])),
  getPurchaseOrder: vi.fn(() => Promise.resolve(null)),
  suggestPurchase: vi.fn(() => Promise.resolve([])),
  createSupplier: vi.fn(),
  deleteSupplier: vi.fn(),
  confirmPurchaseOrder: vi.fn(),
  createPurchaseOrder: vi.fn(),
  receivePurchaseOrder: vi.fn(),
}));
vi.mock('./lib/admin.js', () => ({ listStores: vi.fn(() => Promise.resolve([])) }));

import { PurchasesPage } from './PurchasesPage.js';

function renderPage(): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <PurchasesPage />
    </QueryClientProvider>,
  );
}

describe('PurchasesPage', () => {
  it('renderiza las tres pestañas', () => {
    renderPage();
    expect(screen.getByTestId('purchases-page')).toBeInTheDocument();
    expect(screen.getByTestId('purchases-tab-orders')).toBeInTheDocument();
    expect(screen.getByTestId('purchases-tab-suppliers')).toBeInTheDocument();
    expect(screen.getByTestId('purchases-tab-suggest')).toBeInTheDocument();
  });

  it('muestra Pedidos por defecto (vacío sin datos)', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('orders-empty')).toBeInTheDocument());
  });

  it('cambia a Proveedores y a Propuesta al pulsar las pestañas', async () => {
    renderPage();

    fireEvent.click(screen.getByTestId('purchases-tab-suppliers'));
    await waitFor(() => expect(screen.getByTestId('suppliers-empty')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('purchases-tab-suggest'));
    await waitFor(() => expect(screen.getByTestId('suggest-empty')).toBeInTheDocument());
  });
});
