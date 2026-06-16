import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// vi.mock se hoistea por encima de los imports → las fns deben crearse con
// vi.hoisted para poder referenciarlas tanto en el factory como en cada test.
const { listAlerts, listExpiringBatches } = vi.hoisted(() => ({
  listAlerts: vi.fn(() => Promise.resolve([])),
  listExpiringBatches: vi.fn(() => Promise.resolve([])),
}));
const { listPendingCashMovements, approveCashMovement, denyCashMovement } = vi.hoisted(() => ({
  listPendingCashMovements: vi.fn(() => Promise.resolve([])),
  approveCashMovement: vi.fn(() => Promise.resolve({})),
  denyCashMovement: vi.fn(() => Promise.resolve({})),
}));
vi.mock('./lib/stock.js', () => ({ listAlerts, listExpiringBatches }));
vi.mock('./lib/cash.js', () => ({
  listPendingCashMovements,
  approveCashMovement,
  denyCashMovement,
}));
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
    expect(screen.getByTestId('cash-approvals-empty')).toBeInTheDocument();
  });

  it('lista las solicitudes de caja pendientes y aprueba/deniega', async () => {
    listAlerts.mockResolvedValue([]);
    listExpiringBatches.mockResolvedValue([]);
    // Persistente: tras aprobar se invalida y refetch; la fila debe seguir presente
    // para poder pulsar Denegar en la misma prueba.
    listPendingCashMovements.mockResolvedValue([
      {
        id: 'cm-1',
        cashSessionId: 'cs-1',
        storeId: 's-1',
        userId: 'u-1',
        type: 'TRANSFER_OUT',
        amount: '40.00',
        reason: 'a central',
        status: 'PENDING',
        requestedById: 'u-1',
        reviewedById: null,
        reviewedAt: null,
        targetStoreId: 's-2',
        createdAt: '2026-06-16T08:00:00.000Z',
        store: { name: 'Centro' },
        requestedBy: { name: 'Ana Caja' },
      },
    ] as never);
    renderPage();

    const rows = await screen.findAllByTestId('cash-approval-row');
    expect(rows).toHaveLength(1);
    expect(screen.getByText('Traspaso a central')).toBeInTheDocument();
    expect(screen.getByText('Ana Caja')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('cash-approve'));
    await waitFor(() => expect(approveCashMovement).toHaveBeenCalledWith('cm-1'));

    fireEvent.click(screen.getByTestId('cash-deny'));
    await waitFor(() => expect(denyCashMovement).toHaveBeenCalledWith('cm-1'));
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
