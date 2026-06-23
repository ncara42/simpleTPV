import type { Store, Transfer } from '@simpletpv/auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listStores } from '../lib/admin.js';
import { createTransfer, listTransfers } from '../lib/stock.js';
import { CreateTransferModal } from './CreateTransferModal.js';
import { TransfersSection } from './TransfersSection.js';

vi.mock('../lib/stock.js', () => ({
  listTransfers: vi.fn(() => Promise.resolve([])),
  createTransfer: vi.fn(() => Promise.resolve({ id: 't-new' })),
  sendTransfer: vi.fn(),
}));
vi.mock('../lib/admin.js', () => ({ listStores: vi.fn(() => Promise.resolve([])) }));
vi.mock('../lib/products.js', () => ({ listProducts: vi.fn(() => Promise.resolve([])) }));

const STORES: Store[] = [
  { id: 's-centro', code: 'CEN', name: 'Centro' } as Store,
  { id: 's-norte', code: 'NOR', name: 'Norte' } as Store,
];

function makeTransfer(over: Partial<Transfer>): Transfer {
  return {
    id: 't1',
    originStoreId: 's-centro',
    destStoreId: 's-norte',
    status: 'DRAFT',
    notes: null,
    createdBy: 'u1',
    createdAt: '2026-06-20T10:00:00.000Z',
    sentAt: null,
    receivedAt: null,
    closedAt: null,
    lines: [],
    ...over,
  } as Transfer;
}

function renderWithClient(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listStores).mockResolvedValue(STORES);
});

describe('CreateTransferModal — campo Nombre y notes', () => {
  it('expone el campo Nombre con su testid y aria-label', async () => {
    renderWithClient(<CreateTransferModal onClose={() => {}} onCreated={() => {}} />);

    const field = await screen.findByTestId('transfer-name');
    expect(field).toHaveAttribute('aria-label', 'Nombre del traspaso');
    expect(field).toHaveAttribute('maxLength', '80');
  });

  it('envía notes con el nombre escrito al crear', async () => {
    renderWithClient(
      <CreateTransferModal
        onClose={() => {}}
        onCreated={() => {}}
        prefill={{
          suggestedOriginStoreId: 's-centro',
          destStoreId: 's-norte',
          productId: 'p1',
          qty: 2,
        }}
      />,
    );

    const field = await screen.findByTestId('transfer-name');
    fireEvent.change(field, { target: { value: '  Reposición fin de mes  ' } });
    fireEvent.click(screen.getByTestId('transfer-save'));

    await waitFor(() => expect(createTransfer).toHaveBeenCalledTimes(1));
    expect(createTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        originStoreId: 's-centro',
        destStoreId: 's-norte',
        notes: 'Reposición fin de mes',
      }),
    );
  });

  it('auto-nombra "Origen → Destino" cuando el campo se deja vacío', async () => {
    renderWithClient(
      <CreateTransferModal
        onClose={() => {}}
        onCreated={() => {}}
        prefill={{
          suggestedOriginStoreId: 's-centro',
          destStoreId: 's-norte',
          productId: 'p1',
          qty: 1,
        }}
      />,
    );

    // El auto-nombre resuelve nombres de tienda; espera a que el catálogo `stores`
    // esté cargado (el disparador de origen muestra "Centro") antes de enviar.
    await screen.findByText('Centro');
    fireEvent.click(screen.getByTestId('transfer-save'));

    await waitFor(() => expect(createTransfer).toHaveBeenCalledTimes(1));
    expect(createTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ notes: 'Centro → Norte' }),
    );
  });
});

describe('TransfersSection — columna, buscador y fallback', () => {
  it('muestra el nombre (notes) y el fallback "Origen → Destino" en la columna', async () => {
    vi.mocked(listTransfers).mockResolvedValue([
      makeTransfer({ id: 't1', notes: 'Pedido semanal' }),
      makeTransfer({ id: 't2', notes: null }),
    ]);
    renderWithClient(<TransfersSection />);

    const cells = await screen.findAllByTestId('transfer-name-cell');
    const texts = cells.map((c) => c.textContent);
    expect(texts).toContain('Pedido semanal');
    expect(texts).toContain('Centro → Norte');
  });

  it('filtra la lista por el buscador (data-testid transfers-search)', async () => {
    vi.mocked(listTransfers).mockResolvedValue([
      makeTransfer({ id: 't1', notes: 'Pedido semanal' }),
      makeTransfer({ id: 't2', notes: 'Devoluciones' }),
    ]);
    renderWithClient(<TransfersSection />);

    await screen.findByText('Pedido semanal');
    const table = screen.getByTestId('transfers-table');
    expect(within(table).getAllByTestId('transfer-row')).toHaveLength(2);

    fireEvent.change(screen.getByTestId('transfers-search'), { target: { value: 'semanal' } });

    await waitFor(() => expect(within(table).getAllByTestId('transfer-row')).toHaveLength(1));
    expect(within(table).getByText('Pedido semanal')).toBeInTheDocument();
    expect(within(table).queryByText('Devoluciones')).not.toBeInTheDocument();
  });
});
