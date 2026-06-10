import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Libs de datos mockeadas para renderizar sin red. Smoke test del orquestador
// Proveedores (P1-B): cuatro pestañas + cambio de sección.
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
vi.mock('./lib/families.js', () => ({ listFamilies: vi.fn(() => Promise.resolve([])) }));
vi.mock('./lib/products.js', () => ({ listProducts: vi.fn(() => Promise.resolve([])) }));
vi.mock('./lib/supplier-prices.js', () => ({
  listSupplierPrices: vi.fn(() => Promise.resolve([])),
  compareSupplierPrices: vi.fn(() => Promise.resolve([])),
  upsertSupplierPrice: vi.fn(),
  deleteSupplierPrice: vi.fn(),
  importSupplierPricesCsv: vi.fn(),
}));

import { SuppliersPage } from './SuppliersPage.js';

function renderPage(): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <SuppliersPage />
    </QueryClientProvider>,
  );
}

describe('SuppliersPage', () => {
  it('renderiza las cuatro pestañas', () => {
    renderPage();
    expect(screen.getByTestId('suppliers-page')).toBeInTheDocument();
    expect(screen.getByTestId('suppliers-tab-suppliers')).toBeInTheDocument();
    expect(screen.getByTestId('suppliers-tab-prices')).toBeInTheDocument();
    expect(screen.getByTestId('suppliers-tab-orders')).toBeInTheDocument();
    expect(screen.getByTestId('suppliers-tab-suggest')).toBeInTheDocument();
  });

  it('muestra Proveedores por defecto (vacío sin datos)', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('suppliers-empty')).toBeInTheDocument());
  });

  it('cambia a Tarifas de compra y a Propuesta al pulsar las pestañas', async () => {
    renderPage();

    fireEvent.click(screen.getByTestId('suppliers-tab-prices'));
    await waitFor(() => expect(screen.getByTestId('sp-empty')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('suppliers-tab-suggest'));
    await waitFor(() => expect(screen.getByTestId('suggest-empty')).toBeInTheDocument());
  });
});
