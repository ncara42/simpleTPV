import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// `vi.hoisted` para referenciar los mocks dentro de la factory de `vi.mock` (que se eleva al
// inicio del módulo). Mismo patrón que stock/GlobalStockSection.test.tsx.
const { listAlertsMock, listExpiringBatchesMock } = vi.hoisted(() => ({
  listAlertsMock: vi.fn((..._args: unknown[]): Promise<unknown[]> => Promise.resolve([])),
  listExpiringBatchesMock: vi.fn((..._args: unknown[]): Promise<unknown[]> => Promise.resolve([])),
}));

vi.mock('../lib/stock.js', () => ({
  listAlerts: listAlertsMock,
  listExpiringBatches: listExpiringBatchesMock,
}));

import { StockSummaryStrip } from './StockSummaryStrip.js';

// Roturas de muestra: una crítica (sin sustituto) y una soft (con sustituto).
const ALERTS = [
  {
    id: 'a1',
    productId: 'p1',
    productName: 'Leche entera',
    storeId: 's1',
    storeName: 'Norte',
    alertType: 'OUT_OF_STOCK',
    hasSubstituteStock: false,
    severity: 'critical',
    resolved: false,
    createdAt: '2026-06-22T00:00:00Z',
  },
  {
    id: 'a2',
    productId: 'p2',
    productName: 'Pan de molde',
    storeId: 's2',
    storeName: 'Sur',
    alertType: 'LOW_STOCK',
    hasSubstituteStock: true,
    severity: 'soft',
    resolved: false,
    createdAt: '2026-06-22T00:00:00Z',
  },
];

function renderStrip(onNavigate?: (tab: 'suppliers' | 'stock' | 'sales') => void): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <StockSummaryStrip onNavigate={onNavigate} />
    </QueryClientProvider>,
  );
}

describe('StockSummaryStrip (S-13)', () => {
  beforeEach(() => {
    listAlertsMock.mockReset();
    listAlertsMock.mockResolvedValue([]);
    listExpiringBatchesMock.mockReset();
    listExpiringBatchesMock.mockResolvedValue([]);
  });

  it('con roturas muestra el conteo, el desglose crítica/sustituto y el enlace', async () => {
    listAlertsMock.mockResolvedValue(ALERTS);
    renderStrip();

    // Espera al fetch: 2 productos en rotura.
    await waitFor(() => expect(screen.getByText('Leche entera')).toBeInTheDocument());
    expect(screen.getByTestId('dash-stock-summary')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('productos en rotura')).toBeInTheDocument();
    // Desglose: 1 crítica (severity critical) · 1 con sustituto (severity soft).
    expect(screen.getByText('1 crítica · 1 con sustituto')).toBeInTheDocument();
    // El enlace "Ver inventario →" está presente.
    expect(screen.getByTestId('dash-stock-summary-link')).toBeInTheDocument();
    // No se muestra el estado vacío verde.
    expect(screen.queryByTestId('stock-summary-ok')).not.toBeInTheDocument();
    // La query de roturas es global: se llama SIN argumento de tienda (key propia).
    expect(listAlertsMock).toHaveBeenCalledWith();
  });

  it('lista como máximo el top 5 de roturas y resume el resto con "+N más"', async () => {
    const many = Array.from({ length: 7 }, (_, i) => ({
      ...ALERTS[0],
      id: `a${i}`,
      productName: `Producto ${i}`,
    }));
    listAlertsMock.mockResolvedValue(many);
    renderStrip();

    await waitFor(() => expect(screen.getByTestId('dash-stock-summary-list')).toBeInTheDocument());
    // 5 ítems listados + "+2 más".
    const items = screen
      .getByTestId('dash-stock-summary-list')
      .querySelectorAll('.dash-stock-summary-item');
    expect(items).toHaveLength(5);
    expect(screen.getByText('+2 más')).toBeInTheDocument();
  });

  it('sin roturas muestra el estado vacío verde positivo (P079)', async () => {
    listAlertsMock.mockResolvedValue([]);
    renderStrip();

    await waitFor(() => expect(screen.getByTestId('stock-summary-ok')).toBeInTheDocument());
    expect(screen.getByText('Sin roturas de stock')).toBeVisible();
    // La franja sigue presente (siempre visible) y el enlace también.
    expect(screen.getByTestId('dash-stock-summary')).toBeInTheDocument();
    expect(screen.getByTestId('dash-stock-summary-link')).toBeInTheDocument();
  });

  it('muestra el bloque de caducidad cuando hay lotes por caducar (P076)', async () => {
    listAlertsMock.mockResolvedValue([]);
    listExpiringBatchesMock.mockResolvedValue([{ id: 'b1' }, { id: 'b2' }]);
    renderStrip();

    await waitFor(() =>
      expect(screen.getByTestId('dash-stock-summary-expiry')).toBeInTheDocument(),
    );
    expect(screen.getByText('2 lotes por caducar')).toBeInTheDocument();
    expect(listExpiringBatchesMock).toHaveBeenCalledWith();
  });

  it('el enlace "Ver inventario" navega a la vista de inventario (onNavigate "stock")', async () => {
    const onNavigate = vi.fn();
    listAlertsMock.mockResolvedValue(ALERTS);
    renderStrip(onNavigate);

    await waitFor(() => expect(screen.getByTestId('dash-stock-summary-link')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('dash-stock-summary-link'));
    expect(onNavigate).toHaveBeenCalledWith('stock');
  });
});
