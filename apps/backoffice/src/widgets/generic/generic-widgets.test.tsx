import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { GenericSpec } from '../../lib/dashboard-layout.js';

// Mock del cliente API: cada test ajusta lo que devuelve api.get.
const getMock = vi.fn();
vi.mock('../../lib/auth.js', () => ({ api: { get: (...args: unknown[]) => getMock(...args) } }));

import { GenericChart } from './GenericChart.js';
import { GenericInsight } from './GenericInsight.js';
import { GenericKpi } from './GenericKpi.js';
import { GenericTable } from './GenericTable.js';

function renderWithClient(node: React.ReactElement): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe('GenericInsight', () => {
  it('renderiza markdown (sin red)', () => {
    const spec: GenericSpec = {
      type: 'insight',
      endpoint: '',
      title: 'Resumen',
      defaultSize: { w: 4, h: 2 },
      params: { markdown: 'Ventas **en alza** este mes.' },
    };
    renderWithClient(<GenericInsight spec={spec} />);
    expect(screen.getByText('Resumen')).toBeInTheDocument();
    // react-markdown convierte **en alza** en un <strong>.
    expect(screen.getByText('en alza').tagName).toBe('STRONG');
  });
});

describe('GenericTable', () => {
  it('hace fetch al endpoint y pinta filas con las columnas de fields', async () => {
    getMock.mockResolvedValueOnce([
      { producto: 'Café', unidades: 12 },
      { producto: 'Té', unidades: 5 },
    ]);
    const spec: GenericSpec = {
      type: 'table',
      endpoint: '/dashboard/product-rankings',
      title: 'Top productos',
      defaultSize: { w: 6, h: 3 },
      fields: ['producto', 'unidades'],
    };
    renderWithClient(<GenericTable spec={spec} />);
    await waitFor(() => expect(screen.getByText('Café')).toBeInTheDocument());
    expect(screen.getByText('Té')).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith('/dashboard/product-rankings', {});
  });
});

describe('GenericKpi', () => {
  it('hace fetch y muestra el valor del campo indicado', async () => {
    getMock.mockResolvedValueOnce({ total: 1234.5 });
    const spec: GenericSpec = {
      type: 'kpi',
      endpoint: '/dashboard/sales-kpis',
      title: 'Facturación',
      defaultSize: { w: 2, h: 1 },
      fields: ['total'],
      period: 'month',
    };
    renderWithClient(<GenericKpi spec={spec} />);
    await waitFor(() => expect(screen.getByTestId('dash-generic-kpi')).toHaveTextContent('1234,5'));
    // El period viaja como query param.
    expect(getMock).toHaveBeenCalledWith('/dashboard/sales-kpis', { period: 'month' });
  });
});

describe('GenericChart', () => {
  it('hace fetch y renderiza un gráfico de barras con label/value', async () => {
    getMock.mockResolvedValueOnce([
      { tienda: 'Centro', ventas: 100 },
      { tienda: 'Sur', ventas: 60 },
    ]);
    const spec: GenericSpec = {
      type: 'bar',
      endpoint: '/dashboard/sales-by-family',
      title: 'Ventas por tienda',
      defaultSize: { w: 6, h: 2 },
      fields: ['tienda', 'ventas'],
    };
    renderWithClient(<GenericChart spec={spec} />);
    await waitFor(() => expect(screen.getByText('Ventas por tienda')).toBeInTheDocument());
    // Las etiquetas de las barras aparecen en el eje del Chart.
    await waitFor(() => expect(screen.getByText('Centro')).toBeInTheDocument());
  });
});
