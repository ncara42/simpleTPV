import type { Store, Transfer, TransferLine } from '@simpletpv/auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listStores } from '../lib/admin.js';
import {
  closeTransfer,
  createTransfer,
  listTransfers,
  receiveTransfer,
  sendTransfer,
} from '../lib/stock.js';
import { CreateTransferModal } from './CreateTransferModal.js';
import { TransfersSection } from './TransfersSection.js';

vi.mock('../lib/stock.js', () => ({
  listTransfers: vi.fn(() => Promise.resolve([])),
  createTransfer: vi.fn(() => Promise.resolve({ id: 't-new' })),
  sendTransfer: vi.fn(() => Promise.resolve({})),
  receiveTransfer: vi.fn(() => Promise.resolve({})),
  closeTransfer: vi.fn(() => Promise.resolve({})),
  listTransferAttachments: vi.fn(() => Promise.resolve([])),
  uploadTransferAttachment: vi.fn(() => Promise.resolve({})),
}));
vi.mock('../lib/admin.js', () => ({ listStores: vi.fn(() => Promise.resolve([])) }));
vi.mock('../lib/products.js', () => ({ listProducts: vi.fn(() => Promise.resolve([])) }));

const STORES: Store[] = [
  { id: 's-centro', code: 'CEN', name: 'Centro' } as Store,
  { id: 's-norte', code: 'NOR', name: 'Norte' } as Store,
];

function makeLine(over: Partial<TransferLine> = {}): TransferLine {
  return {
    id: 'l1',
    transferId: 't1',
    productId: 'p1',
    quantitySent: '5',
    quantityReceived: null,
    discrepancy: null,
    discrepancyNote: null,
    ...over,
  } as TransferLine;
}

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

describe('TransfersSection — nombre, buscador y fallback', () => {
  it('muestra la nota como subtítulo y la ruta en su propia columna', async () => {
    vi.mocked(listTransfers).mockResolvedValue([
      makeTransfer({ id: 't1', notes: 'Pedido semanal' }),
      makeTransfer({ id: 't2', notes: null }),
    ]);
    renderWithClient(<TransfersSection />);

    // La nota del usuario aparece como subtítulo (solo en la fila con nota).
    expect(await screen.findByTestId('transfer-note')).toHaveTextContent('Pedido semanal');
    // La ruta va en su propia columna, en ambas filas (con y sin nota).
    const routes = screen.getAllByTestId('transfer-route').map((c) => c.textContent);
    expect(routes).toEqual(['Centro → Norte', 'Centro → Norte']);
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

describe('TransfersSection v2 — grupos, detalle en línea y ciclo de vida', () => {
  it('agrupa por estado y despliega el detalle en línea al pulsar una fila', async () => {
    vi.mocked(listTransfers).mockResolvedValue([
      makeTransfer({ id: 't1', notes: 'Pedido semanal', status: 'DRAFT', lines: [makeLine()] }),
    ]);
    renderWithClient(<TransfersSection />);

    await screen.findByText('Pedido semanal');
    // "Borradores" aparece como vista del carril y como cabecera de grupo; acotamos a la tabla.
    expect(
      within(screen.getByTestId('transfers-table')).getByText('Borradores'),
    ).toBeInTheDocument();
    // El detalle no está montado hasta desplegar la fila.
    expect(screen.queryByTestId('transfer-detail')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('transfer-row'));

    const detail = await screen.findByTestId('transfer-detail');
    expect(within(detail).getByText('Traspaso creado')).toBeInTheDocument();
  });

  it('envía un borrador desde la acción del detalle desplegado', async () => {
    vi.mocked(listTransfers).mockResolvedValue([
      makeTransfer({ id: 't1', status: 'DRAFT', lines: [makeLine()] }),
    ]);
    renderWithClient(<TransfersSection />);

    fireEvent.click(await screen.findByTestId('transfer-row'));
    const action = await screen.findByTestId('transfer-action');
    expect(action).toHaveTextContent('Enviar');

    fireEvent.click(action);

    await waitFor(() => expect(sendTransfer).toHaveBeenCalledWith('t1'));
  });

  it('recibe un traspaso en tránsito con todas sus líneas', async () => {
    vi.mocked(listTransfers).mockResolvedValue([
      makeTransfer({
        id: 't1',
        status: 'SENT',
        sentAt: '2026-06-21T09:00:00.000Z',
        lines: [makeLine({ id: 'l1', quantitySent: '6' })],
      }),
    ]);
    renderWithClient(<TransfersSection />);

    fireEvent.click(await screen.findByTestId('transfer-row'));
    const action = await screen.findByTestId('transfer-action');
    expect(action).toHaveTextContent('Recibir');

    fireEvent.click(action);

    await waitFor(() =>
      expect(receiveTransfer).toHaveBeenCalledWith('t1', {
        lines: [{ lineId: 'l1', quantityReceived: 6 }],
      }),
    );
  });

  it('cierra un traspaso recibido', async () => {
    vi.mocked(listTransfers).mockResolvedValue([
      makeTransfer({
        id: 't1',
        status: 'RECEIVED',
        receivedAt: '2026-06-22T09:00:00.000Z',
        lines: [makeLine({ id: 'l1', quantitySent: '6', quantityReceived: '6' })],
      }),
    ]);
    renderWithClient(<TransfersSection />);

    fireEvent.click(await screen.findByTestId('transfer-row'));
    const action = await screen.findByTestId('transfer-action');
    expect(action).toHaveTextContent('Cerrar');

    fireEvent.click(action);

    await waitFor(() => expect(closeTransfer).toHaveBeenCalledWith('t1'));
  });

  it('muestra «Todo en perfecto estado» cuando la recepción no tuvo incidencias', async () => {
    vi.mocked(listTransfers).mockResolvedValue([
      makeTransfer({
        id: 't1',
        status: 'RECEIVED',
        receivedAt: '2026-06-22T09:00:00.000Z',
        lines: [makeLine({ id: 'l1', quantitySent: '6', quantityReceived: '6', discrepancy: '0' })],
      }),
    ]);
    renderWithClient(<TransfersSection />);

    fireEvent.click(await screen.findByTestId('transfer-row'));
    const review = await screen.findByTestId('transfer-review');
    expect(within(review).getByTestId('transfer-review-ok')).toHaveTextContent(
      'Todo en perfecto estado',
    );
  });

  it('lista la incidencia y el comentario por línea en la revisión', async () => {
    vi.mocked(listTransfers).mockResolvedValue([
      makeTransfer({
        id: 't1',
        status: 'RECEIVED',
        receivedAt: '2026-06-22T09:00:00.000Z',
        lines: [
          makeLine({
            id: 'l1',
            quantitySent: '6',
            quantityReceived: '5',
            discrepancy: '-1',
            discrepancyNote: 'Unidad dañada en transporte',
          }),
        ],
      }),
    ]);
    renderWithClient(<TransfersSection />);

    fireEvent.click(await screen.findByTestId('transfer-row'));
    const incidents = await screen.findByTestId('transfer-review-incidents');
    expect(incidents).toHaveTextContent('Unidad dañada en transporte');
    expect(incidents).toHaveTextContent('5 / 6');
  });

  it('filtra por la vista de estado seleccionada', async () => {
    vi.mocked(listTransfers).mockResolvedValue([
      makeTransfer({ id: 't1', notes: 'Borrador A', status: 'DRAFT', lines: [makeLine()] }),
      makeTransfer({ id: 't2', notes: 'Tránsito B', status: 'SENT', lines: [makeLine()] }),
    ]);
    renderWithClient(<TransfersSection />);

    await screen.findByText('Borrador A');
    const table = screen.getByTestId('transfers-table');
    expect(within(table).getAllByTestId('transfer-row')).toHaveLength(2);

    fireEvent.click(screen.getByTestId('transfers-view-sent'));

    await waitFor(() => expect(within(table).getAllByTestId('transfer-row')).toHaveLength(1));
    expect(within(table).getByText('Tránsito B')).toBeInTheDocument();
    expect(within(table).queryByText('Borrador A')).not.toBeInTheDocument();
  });
});
