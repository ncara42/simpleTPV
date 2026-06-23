import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Una fila con stock en dos tiendas; el TOTAL global (30) es independiente de la
// selección de tiendas (P080).
const ROW = {
  productId: 'p1',
  productName: 'Leche entera',
  total: 30,
  rotation: 'alta' as const,
  stores: [
    { storeId: 'a', storeName: 'Norte', quantity: 10, minStock: 5 },
    { storeId: 'b', storeName: 'Sur', quantity: 20, minStock: 5 },
  ],
};

// `vi.hoisted` para poder referenciar los mocks dentro de la factory de `vi.mock`
// (que se eleva al inicio del módulo, antes de las consts normales).
const { listAlertsMock, getGlobalStockMock } = vi.hoisted(() => ({
  listAlertsMock: vi.fn((..._args: unknown[]): Promise<unknown[]> => Promise.resolve([])),
  getGlobalStockMock: vi.fn((): Promise<unknown[]> => Promise.resolve([])),
}));

vi.mock('../lib/stock.js', () => ({
  getGlobalStock: getGlobalStockMock,
  listAlerts: listAlertsMock,
  adjustStock: vi.fn(),
  setMinStock: vi.fn(),
  createTransfer: vi.fn(() => Promise.resolve({ id: 't1' })),
  sendTransfer: vi.fn(() => Promise.resolve({ id: 't1' })),
}));
vi.mock('../lib/admin.js', () => ({
  listStores: vi.fn(() =>
    Promise.resolve([
      { id: 'a', name: 'Norte', code: 'NOR' },
      { id: 'b', name: 'Sur', code: 'SUR' },
    ]),
  ),
}));
vi.mock('../lib/families.js', () => ({ listFamilies: vi.fn(() => Promise.resolve([])) }));
vi.mock('../lib/products.js', () => ({
  listProducts: vi.fn(() => Promise.resolve([{ id: 'p1', name: 'Leche entera', sku: null }])),
}));

import { MemoryRouter } from 'react-router-dom';

import { GlobalStockSection } from './GlobalStockSection.js';

function renderSection(): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <GlobalStockSection />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('GlobalStockSection (S-14)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    listAlertsMock.mockReset();
    listAlertsMock.mockResolvedValue([]);
    getGlobalStockMock.mockReset();
    getGlobalStockMock.mockResolvedValue([ROW]);
  });

  it('la columna Total muestra el total GLOBAL del producto (P080)', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByText('Leche entera')).toBeInTheDocument());
    // Total global = 30 (10 + 20), no el de una tienda concreta.
    expect(screen.getByText('30')).toBeInTheDocument();
  });

  it('oculta la columna Total global al seleccionar UNA sola tienda (S-15)', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByText('Leche entera')).toBeInTheDocument());
    // Con todas las tiendas (selección vacía), la columna Total global está presente.
    expect(screen.getByRole('columnheader', { name: 'Total' })).toBeInTheDocument();
    // Seleccionar una sola tienda (Norte) en el MultiSelect.
    fireEvent.click(screen.getByTestId('stock-store'));
    fireEvent.click(screen.getByText('Norte'));
    // S-15: con 1 tienda, "Por tienda" ya muestra esa cifra → el Total global se oculta.
    await waitFor(() =>
      expect(screen.queryByRole('columnheader', { name: 'Total' })).not.toBeInTheDocument(),
    );
  });

  it('expone el filtro multi-tienda (MultiSelect) en vez del Select simple', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByTestId('stock-store')).toBeInTheDocument());
    // El disparador del MultiSelect arranca en "Todas las tiendas" (selección vacía).
    expect(screen.getByText('Todas las tiendas')).toBeInTheDocument();
  });

  it('sin roturas muestra el aviso verde positivo (P079)', async () => {
    listAlertsMock.mockResolvedValue([]);
    renderSection();
    await waitFor(() => expect(screen.getByTestId('stock-alerts-ok')).toBeInTheDocument());
    expect(screen.getByText('Stock al día, sin roturas')).toBeVisible();
    expect(screen.queryByTestId('stock-alerts-panel')).not.toBeInTheDocument();
  });

  it('con roturas muestra el panel de roturas (global) y no el aviso verde', async () => {
    listAlertsMock.mockResolvedValue([
      {
        id: 'al1',
        productName: 'Leche entera',
        storeName: 'Norte',
        severity: 'critical',
        alertType: 'out_of_stock',
      },
    ]);
    renderSection();
    await waitFor(() => expect(screen.getByTestId('stock-alerts-panel')).toBeInTheDocument());
    expect(screen.queryByTestId('stock-alerts-ok')).not.toBeInTheDocument();
    // La query de roturas es global: se llama sin argumento de tienda (P082).
    expect(listAlertsMock).toHaveBeenCalledWith();
  });
});

describe('GlobalStockSection — traspaso desde rotura (S-16)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    getGlobalStockMock.mockReset();
    getGlobalStockMock.mockResolvedValue([ROW]);
    listAlertsMock.mockReset();
  });

  const ALERT = {
    id: 'al1',
    productId: 'p1',
    productName: 'Leche entera',
    storeId: 'a', // destino: tienda con la rotura
    storeName: 'Norte',
    alertType: 'out_of_stock',
    severity: 'critical',
    hasSubstituteStock: false,
    resolved: false,
    createdAt: '2026-06-22T00:00:00Z',
  };

  it('el botón "Traspasar" abre el modal con destino y producto prefijados (P092/P093)', async () => {
    // ROW tiene excedente en la tienda 'b' (20-5) → hay origen sugerido.
    listAlertsMock.mockResolvedValue([ALERT]);
    renderSection();
    await waitFor(() => expect(screen.getByTestId('stock-alert-transfer')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('stock-alert-transfer'));
    // Se abre el modal de traspaso con el producto prefijado como línea.
    expect(await screen.findByTestId('transfer-form')).toBeVisible();
    expect(screen.getByTestId('transfer-line-row')).toBeInTheDocument();
  });

  it('sin tienda con excedente muestra la CTA de pedido de compra (P097)', async () => {
    // Stock sin excedente en ninguna tienda (todas por debajo del mínimo).
    getGlobalStockMock.mockResolvedValue([
      {
        productId: 'p1',
        productName: 'Leche entera',
        total: 5,
        rotation: 'alta',
        stores: [
          { storeId: 'a', storeName: 'Norte', quantity: 3, minStock: 5 },
          { storeId: 'b', storeName: 'Sur', quantity: 2, minStock: 5 },
        ],
      },
    ]);
    listAlertsMock.mockResolvedValue([ALERT]);
    renderSection();
    await waitFor(() => expect(screen.getByTestId('stock-alert-transfer')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('stock-alert-transfer'));
    expect(await screen.findByTestId('stock-no-surplus')).toBeVisible();
    expect(screen.getByTestId('stock-create-purchase')).toBeVisible();
    // No abre el modal directamente en este caso.
    expect(screen.queryByTestId('transfer-form')).not.toBeInTheDocument();
  });
});
