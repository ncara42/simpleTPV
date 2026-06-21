import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { GenericSpec } from '../../lib/dashboard-layout.js';

// Mock del cliente API: devuelve datos según el endpoint de cada pieza (fetch por hoja).
const getMock = vi.fn();
vi.mock('../../lib/auth.js', () => ({ api: { get: (...args: unknown[]) => getMock(...args) } }));

import { GenericPanel } from './GenericPanel.js';

function renderWithClient(node: React.ReactElement): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe('GenericPanel — panel v2 (#204)', () => {
  it('monta la receta (KpiRow + ChartGrid) y cada pieza resuelve sus datos', async () => {
    getMock.mockImplementation((endpoint: string) => {
      if (endpoint === '/dashboard/sales-kpis') return Promise.resolve({ revenue: 84560.09 });
      if (endpoint === '/dashboard/sales-by-employee')
        return Promise.resolve([
          { userName: 'Ana', total: 100 },
          { userName: 'Luis', total: 60 },
        ]);
      return Promise.resolve([]);
    });

    const spec: GenericSpec = {
      type: 'composite',
      kind: 'panel',
      version: 2,
      endpoint: '',
      title: 'Rendimiento de ventas',
      defaultSize: { w: 6, h: 4 },
      recipe: 'kpiRow+oneChart',
      density: 'comfortable',
      slots: {
        kpis: [
          {
            piece: 'kpiTile',
            title: 'Facturación',
            endpoint: '/dashboard/sales-kpis',
            valueField: 'revenue',
            format: 'eur',
          },
        ],
        charts: [
          {
            piece: 'comparisonBars',
            title: 'Por vendedor',
            endpoint: '/dashboard/sales-by-employee',
            labelField: 'userName',
            valueField: 'total',
          },
        ],
      },
    };

    renderWithClient(<GenericPanel spec={spec} />);

    expect(screen.getByTestId('dash-generic-panel')).toBeInTheDocument();
    expect(screen.getByTestId('dv-kpi-row')).toBeInTheDocument();
    expect(screen.getByTestId('dv-chart-grid')).toBeInTheDocument();
    // Título del panel + rótulo del KPI + título de la gráfica.
    expect(screen.getByText('Rendimiento de ventas')).toBeInTheDocument();
    expect(screen.getByText('Facturación')).toBeInTheDocument();
    expect(screen.getByText('Por vendedor')).toBeInTheDocument();
    // El KPI resuelve su valor formateado en es-ES.
    await waitFor(() => expect(screen.getByText(/84\.560,09\s?€/)).toBeInTheDocument());
    // La gráfica de comparación pinta las etiquetas de sus barras.
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
  });

  it('un slot vacío no rompe el render (solo charts)', () => {
    getMock.mockResolvedValue([]);
    const spec: GenericSpec = {
      type: 'composite',
      kind: 'panel',
      version: 2,
      endpoint: '',
      title: 'Solo tabla',
      defaultSize: { w: 6, h: 5 },
      recipe: 'tableFull',
      density: 'compact',
      slots: {
        charts: [
          {
            piece: 'dataGrid',
            title: 'Productos',
            endpoint: '/products',
            columns: [
              { field: 'name', label: 'Producto' },
              { field: 'price', label: 'Precio', format: 'eur', align: 'right' },
            ],
          },
        ],
      },
    };
    renderWithClient(<GenericPanel spec={spec} />);
    expect(screen.getByTestId('dash-generic-panel')).toBeInTheDocument();
    expect(screen.getByTestId('dv-chart-grid')).toBeInTheDocument();
    expect(screen.queryByTestId('dv-kpi-row')).toBeNull();
    expect(screen.getByText('Solo tabla')).toBeInTheDocument();
  });
});
