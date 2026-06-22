import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
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

// `vi.hoisted` para poder referenciar el mock dentro de la factory de `vi.mock`
// (que se eleva al inicio del módulo, antes de las consts normales).
const { listAlertsMock } = vi.hoisted(() => ({
  listAlertsMock: vi.fn((..._args: unknown[]): Promise<unknown[]> => Promise.resolve([])),
}));

vi.mock('../lib/stock.js', () => ({
  getGlobalStock: vi.fn(() => Promise.resolve([ROW])),
  listAlerts: listAlertsMock,
  adjustStock: vi.fn(),
  setMinStock: vi.fn(),
}));
vi.mock('../lib/admin.js', () => ({
  listStores: vi.fn(() =>
    Promise.resolve([
      { id: 'a', name: 'Norte' },
      { id: 'b', name: 'Sur' },
    ]),
  ),
}));
vi.mock('../lib/families.js', () => ({ listFamilies: vi.fn(() => Promise.resolve([])) }));

import { GlobalStockSection } from './GlobalStockSection.js';

function renderSection(): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <GlobalStockSection />
    </QueryClientProvider>,
  );
}

describe('GlobalStockSection (S-14)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    listAlertsMock.mockReset();
    listAlertsMock.mockResolvedValue([]);
  });

  it('la columna Total muestra el total GLOBAL del producto (P080)', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByText('Leche entera')).toBeInTheDocument());
    // Total global = 30 (10 + 20), no el de una tienda concreta.
    expect(screen.getByText('30')).toBeInTheDocument();
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
