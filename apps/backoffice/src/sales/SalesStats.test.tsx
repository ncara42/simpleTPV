import type { SalesStats as SalesStatsData } from '@simpletpv/auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// `vi.hoisted` para referenciar el mock dentro de la factory de `vi.mock` (que se eleva
// al inicio del módulo). Mismo patrón que dashboard/StockSummaryStrip.test.tsx.
const { getSalesStatsMock } = vi.hoisted(() => ({
  getSalesStatsMock: vi.fn(
    (..._args: unknown[]): Promise<SalesStatsData> =>
      Promise.resolve({ series: [], current: { count: 0, totalAmount: '0' }, previous: null }),
  ),
}));

vi.mock('../lib/sales.js', () => ({ getSalesStats: getSalesStatsMock }));

import { SalesStats } from './SalesStats.js';

// Periodo actual: 400 € en 3 tickets (2 días) ; anterior: 300 € en 1 ticket → deltas +.
const STATS: SalesStatsData = {
  series: [
    { bucket: '2026-03-10', count: 1, total: '200' },
    { bucket: '2026-03-11', count: 2, total: '200' },
  ],
  current: { count: 3, totalAmount: '400' },
  previous: { count: 1, totalAmount: '300' },
};

function renderStats(query: Record<string, string> = {}): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <SalesStats query={query} />
    </QueryClientProvider>,
  );
}

describe('SalesStats (S-10)', () => {
  beforeEach(() => {
    getSalesStatsMock.mockReset();
  });

  it('pinta los KPIs (total, nº tickets, ticket medio), el delta vs periodo anterior y la gráfica', async () => {
    getSalesStatsMock.mockResolvedValue(STATS);
    renderStats({ from: '2026-03-10', to: '2026-03-11' });

    // Espera a que el fetch resuelva y aparezcan las tarjetas KPI (no solo el
    // contenedor `sales-stats`, que también existe durante el loading).
    const total = await screen.findByTestId('sales-stats-kpi-total');
    expect(total).toHaveTextContent('400');
    // Nº de tickets = 3.
    expect(screen.getByTestId('sales-stats-kpi-count')).toHaveTextContent('3');
    // Ticket medio = 400/3 = 133,33 €.
    expect(screen.getByTestId('sales-stats-kpi-avg')).toHaveTextContent('133,33');

    // Delta del total: (400-300)/300 = +33,3 % (con flecha ▲, tono "up").
    const delta = screen.getByTestId('sales-stats-kpi-total-delta');
    expect(delta).toHaveTextContent('+33.3 %');
    expect(delta.className).toContain('is-up');

    // La gráfica de la serie temporal está presente.
    expect(screen.getByTestId('sales-stats-chart')).toBeInTheDocument();
  });

  it('sin periodo anterior (previous null) no muestra deltas', async () => {
    getSalesStatsMock.mockResolvedValue({ ...STATS, previous: null });
    renderStats();

    await waitFor(() => expect(screen.getByTestId('sales-stats-kpi-total')).toBeInTheDocument());
    // Los KPIs siguen; los deltas se omiten en las tres tarjetas.
    expect(screen.queryByTestId('sales-stats-kpi-total-delta')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sales-stats-kpi-count-delta')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sales-stats-kpi-avg-delta')).not.toBeInTheDocument();
    // La gráfica sigue presente (hay serie).
    expect(screen.getByTestId('sales-stats-chart')).toBeInTheDocument();
  });

  it('serie vacía muestra el estado vacío rotulado, sin gráfica ni KPIs', async () => {
    getSalesStatsMock.mockResolvedValue({
      series: [],
      current: { count: 0, totalAmount: '0' },
      previous: null,
    });
    renderStats();

    await waitFor(() => expect(screen.getByTestId('sales-stats-empty')).toBeInTheDocument());
    expect(screen.queryByTestId('sales-stats-chart')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sales-stats-kpi-total')).not.toBeInTheDocument();
  });

  it('pasa la query recibida tal cual a getSalesStats (mismos filtros que la tabla)', async () => {
    getSalesStatsMock.mockResolvedValue(STATS);
    const query = { storeId: 's1', familyId: 'f1', from: '2026-03-10', to: '2026-03-11' };
    renderStats(query);

    await waitFor(() => expect(getSalesStatsMock).toHaveBeenCalledWith(query));
  });
});
