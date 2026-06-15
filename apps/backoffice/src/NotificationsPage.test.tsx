import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// vi.mock se hoistea por encima de los imports → las fns deben crearse con
// vi.hoisted para poder referenciarlas tanto en el factory como en cada test.
const { listAlerts, listExpiringBatches } = vi.hoisted(() => ({
  listAlerts: vi.fn(() => Promise.resolve([])),
  listExpiringBatches: vi.fn(() => Promise.resolve([])),
}));
vi.mock('./lib/stock.js', () => ({ listAlerts, listExpiringBatches }));
vi.mock('./lib/auth.js', () => ({ api: { subscribeEvents: vi.fn(() => () => {}) } }));

import { NotificationsPage } from './NotificationsPage.js';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NotificationsPage />
    </QueryClientProvider>,
  );
}

describe('NotificationsPage', () => {
  it('muestra el portal con ambas secciones vacías (sin alertas ni caducidad)', async () => {
    listAlerts.mockResolvedValueOnce([]);
    listExpiringBatches.mockResolvedValueOnce([]);
    renderPage();
    expect(screen.getByTestId('notifications-page')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('alerts-empty')).toBeInTheDocument());
    expect(screen.getByTestId('expiring-empty')).toBeInTheDocument();
  });

  it('lista lotes caducados y por caducar con su estado', async () => {
    listAlerts.mockResolvedValueOnce([]);
    listExpiringBatches.mockResolvedValueOnce([
      {
        id: 'b-1',
        productId: 'p-1',
        productName: 'Flores CBD',
        storeId: 's-1',
        storeName: 'Centro',
        lotCode: 'LOT-A',
        expiryDate: '2026-05-28',
        quantity: 8,
        daysToExpiry: -6,
        status: 'expired',
      },
      {
        id: 'b-2',
        productId: 'p-2',
        productName: 'Aceite CBD',
        storeId: 's-1',
        storeName: 'Centro',
        lotCode: 'LOT-B',
        expiryDate: '2026-06-12',
        quantity: 15,
        daysToExpiry: 9,
        status: 'expiring',
      },
    ] as never);
    renderPage();

    // DataTable monta el contenedor (expiring-table) siempre, con skeleton durante la carga;
    // por eso esperamos a las FILAS, no a la tabla, para confirmar que llegaron los datos.
    const rows = await screen.findAllByTestId('expiring-row');
    expect(rows).toHaveLength(2);
    expect(screen.getByText('Caducado')).toBeInTheDocument();
    expect(screen.getByText('Por caducar')).toBeInTheDocument();
    expect(screen.getByText('LOT-A')).toBeInTheDocument();
    // No debe quedar el vacío de caducidad cuando hay filas.
    expect(screen.queryByTestId('expiring-empty')).not.toBeInTheDocument();
  });
});
