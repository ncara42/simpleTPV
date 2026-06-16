import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/dashboard.js', () => ({ getSalesToday: vi.fn() }));

import type { SalesTodayResponse } from '../lib/dashboard.js';
import { getSalesToday } from '../lib/dashboard.js';
import { SalesCounterWidget } from './SalesCounterWidget.js';

const mockedGetSalesToday = vi.mocked(getSalesToday);

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function resp(over: Partial<SalesTodayResponse> = {}): SalesTodayResponse {
  return {
    today: { total: 234.5, count: 4 },
    yesterday: { total: 200, count: 3 },
    deltaPct: 23.4,
    byStore: [],
    intraday: [],
    ...over,
  };
}

describe('SalesCounterWidget', () => {
  it('no renderiza nada ni consulta sin tienda activa', () => {
    const { container } = renderWithClient(<SalesCounterWidget storeId={null} />);
    expect(container).toBeEmptyDOMElement();
    expect(mockedGetSalesToday).not.toHaveBeenCalled();
  });

  it('muestra hoy, ayer y el delta positivo (tendencia al alza)', async () => {
    mockedGetSalesToday.mockResolvedValue(resp());

    renderWithClient(<SalesCounterWidget storeId="store-1" />);

    expect(await screen.findByTestId('sales-counter')).toBeInTheDocument();
    expect(mockedGetSalesToday).toHaveBeenCalledWith('store-1');
    expect(screen.getByTestId('sales-counter-today')).toHaveTextContent('234,50');
    expect(screen.getByTestId('sales-counter')).toHaveTextContent('ayer 200,00');
    const delta = screen.getByTestId('sales-counter-delta');
    expect(delta).toHaveTextContent('+23.4 %');
    expect(delta).toHaveClass('trend-up');
  });

  it('marca tendencia a la baja con delta negativo', async () => {
    mockedGetSalesToday.mockResolvedValue(resp({ deltaPct: -12 }));

    renderWithClient(<SalesCounterWidget storeId="store-1" />);

    const delta = await screen.findByTestId('sales-counter-delta');
    expect(delta).toHaveTextContent('-12.0 %');
    expect(delta).toHaveClass('trend-down');
  });

  it('muestra — y tendencia neutra cuando ayer no tuvo ventas (deltaPct null)', async () => {
    mockedGetSalesToday.mockResolvedValue(
      resp({ yesterday: { total: 0, count: 0 }, deltaPct: null }),
    );

    renderWithClient(<SalesCounterWidget storeId="store-1" />);

    const delta = await screen.findByTestId('sales-counter-delta');
    expect(delta).toHaveTextContent('—');
    expect(delta).toHaveClass('trend-flat');
  });
});
