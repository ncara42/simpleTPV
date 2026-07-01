import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { Store } from './lib/admin.js';

const STORES: Store[] = [
  {
    id: 's1',
    name: 'Centro',
    code: '01',
    address: 'C/ Mayor 1',
    active: true,
    opsVerified: false,
    opsIncident: null,
    opsUpdatedAt: null,
    isCentral: true,
  },
  {
    id: 's2',
    name: 'Norte',
    code: '02',
    address: null,
    active: false,
    opsVerified: false,
    opsIncident: null,
    opsUpdatedAt: null,
    isCentral: false,
  },
];

vi.mock('./lib/admin.js', () => ({
  listStores: vi.fn(() => Promise.resolve(STORES)),
  createStore: vi.fn(),
  updateStore: vi.fn(),
  updateStoreOps: vi.fn(),
  setStoreCentral: vi.fn(),
  deleteStore: vi.fn(),
}));

// Dispositivos reales del detalle (I-08): sin red en unit.
vi.mock('./lib/devices.js', () => ({
  listDevices: vi.fn(() => Promise.resolve([])),
  createDevice: vi.fn(),
  revokeDevice: vi.fn(),
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

import { ConfirmProvider } from './components/ConfirmProvider.js';
import { PageActionsProvider, usePageActionsValue } from './lib/pageActions.js';
import { StoresPage } from './StoresPage.js';

// Las acciones («Nueva tienda», exportar CSV) viven en el slot de la TopBar
// (usePageActions), no en la card. Montamos el provider + un slot que pinta su
// valor para poder asertarlas (mismo patrón que TransfersPage.test.tsx).
function ActionsSlot() {
  return <>{usePageActionsValue()}</>;
}

function renderPage(): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ConfirmProvider>
          <PageActionsProvider>
            <ActionsSlot />
            <StoresPage onOpenStoreView={vi.fn()} />
          </PageActionsProvider>
        </ConfirmProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('StoresPage', () => {
  it('renderiza la lista y selecciona la primera tienda por defecto (3 paneles)', async () => {
    renderPage();
    expect(screen.getByTestId('new-store')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByTestId('store-lrow')).toHaveLength(2));
    // Sin selección explícita en la URL, cae a la primera de la lista (paneles 2/3).
    expect(await screen.findByTestId('store-detail-panel')).toBeInTheDocument();
    expect(screen.getByTestId('store-ops-panel')).toBeInTheDocument();
  });

  it('selecciona una tienda de la lista y actualiza los paneles de detalle/operativa', async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId('store-lrow').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByTestId('store-lrow')[1]!);
    await waitFor(() =>
      expect(screen.getByTestId('store-detail-panel')).toHaveTextContent('Norte'),
    );
    expect(screen.getByTestId('store-ops-panel')).toHaveTextContent('Norte');
  });

  it('abre el modal de precios por tienda al pulsar "Precios" sin ocultar los paneles (#127 A)', async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId('store-lrow').length).toBeGreaterThan(0));
    const pricesBtn = await screen.findByTestId('store-open-prices');
    fireEvent.click(pricesBtn);
    expect(await screen.findByTestId('store-prices-detail')).toBeInTheDocument();
    // A diferencia de la modal anterior, los paneles permanentes NO se ocultan al
    // abrir Precios (ya no hay dos modales que apilar, solo un overlay sobre ellos).
    expect(screen.getByTestId('store-detail-panel')).toBeInTheDocument();
  });
});
