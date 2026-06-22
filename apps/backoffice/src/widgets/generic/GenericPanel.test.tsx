import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { GenericSpec } from '../../lib/dashboard-layout.js';

// Mock del cliente API: devuelve datos según el endpoint de cada pieza (fetch por hoja).
const getMock = vi.fn();
vi.mock('../../lib/auth.js', () => ({ api: { get: (...args: unknown[]) => getMock(...args) } }));

import { GenericPanel } from './GenericPanel.js';

function renderWithClient(node: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
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

  it('stockAlertList mapea /stock/alerts (rotura) y /stock/expiring (caducidad) (#209)', async () => {
    getMock.mockImplementation((endpoint: string) => {
      if (endpoint === '/stock/alerts')
        return Promise.resolve([
          {
            productName: 'Aceite CBD',
            storeName: 'Centro',
            alertType: 'OUT_OF_STOCK',
            severity: 'critical',
          },
          { productName: 'Crema CBD', storeName: 'Sur', alertType: 'LOW_STOCK', severity: 'soft' },
        ]);
      if (endpoint === '/stock/expiring')
        return Promise.resolve([
          {
            productName: 'Flores',
            lotCode: 'L-22',
            daysToExpiry: 3,
            quantity: '12',
            status: 'expiring',
          },
        ]);
      return Promise.resolve([]);
    });

    const spec: GenericSpec = {
      type: 'composite',
      kind: 'panel',
      version: 2,
      endpoint: '',
      title: 'Riesgo de stock',
      defaultSize: { w: 8, h: 5 },
      recipe: 'kpiRow+twoCharts',
      density: 'comfortable',
      slots: {
        charts: [
          {
            piece: 'stockAlertList',
            title: 'Alertas de stock',
            endpoint: '/stock/alerts',
            labelField: 'productName',
          },
          {
            piece: 'stockAlertList',
            title: 'Lotes por caducar',
            endpoint: '/stock/expiring',
            labelField: 'productName',
            valueField: 'quantity',
          },
        ],
      },
    };

    const { container } = renderWithClient(<GenericPanel spec={spec} />);

    // Rotura: estado por severidad (sin cantidad).
    await waitFor(() => expect(screen.getByText('Sin stock')).toBeInTheDocument());
    expect(screen.getByText('Stock bajo')).toBeInTheDocument();
    expect(screen.getByText('Aceite CBD')).toBeInTheDocument();
    // La alerta crítica usa la píldora danger.
    expect(container.querySelector('.dv-status-pill--danger')).toBeInTheDocument();
    // Caducidad: estado "Caduca en N d" + cantidad formateada.
    await waitFor(() => expect(screen.getByText('Caduca en 3 d')).toBeInTheDocument());
    expect(screen.getByText('Flores')).toBeInTheDocument();
  });

  it('kpiTile lee el campo del OBJETO aunque el endpoint traiga un `series` array (Beneficio)', async () => {
    // Regresión: /dashboard/margin-kpis devuelve {grossMargin, ..., series:number[]}. toRecords
    // tomaba `series` como filas y el tile leía un número del sparkline → "—". Debe leer grossMargin.
    getMock.mockImplementation((endpoint: string) => {
      if (endpoint === '/dashboard/margin-kpis')
        return Promise.resolve({
          grossMargin: 50660.25,
          realMargin: 50634.69,
          marginPct: 0.59,
          revenue: 84560.09,
          series: [0.59, 0.6, 0.595, 0.603],
        });
      return Promise.resolve([]);
    });

    const spec: GenericSpec = {
      type: 'composite',
      kind: 'panel',
      version: 2,
      endpoint: '',
      title: 'Beneficio',
      defaultSize: { w: 8, h: 1 },
      recipe: 'kpiRow',
      density: 'comfortable',
      slots: {
        kpis: [
          {
            piece: 'kpiTile',
            title: 'Beneficio',
            endpoint: '/dashboard/margin-kpis',
            valueField: 'grossMargin',
            format: 'eur',
          },
        ],
      },
    };

    renderWithClient(<GenericPanel spec={spec} />);
    // El valor sale del objeto (grossMargin), no "—".
    await waitFor(() => expect(screen.getByText(/50\.660,25\s?€/)).toBeInTheDocument());
    expect(screen.queryByText('—')).toBeNull();
  });

  it('heroChart+sideStats compone hero (gráfica) + side stats (KPIs) de verdad (#212)', async () => {
    getMock.mockImplementation((endpoint: string) => {
      if (endpoint === '/dashboard/sales-by-hour')
        return Promise.resolve([
          { hour: '10', revenue: 100 },
          { hour: '11', revenue: 140 },
        ]);
      if (endpoint === '/dashboard/sales-kpis') return Promise.resolve({ revenue: 5000 });
      return Promise.resolve([]);
    });

    const spec: GenericSpec = {
      type: 'composite',
      kind: 'panel',
      version: 2,
      endpoint: '',
      title: 'Ventas del día',
      defaultSize: { w: 8, h: 5 },
      recipe: 'heroChart+sideStats',
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
            piece: 'trendArea',
            title: 'Ventas por hora',
            endpoint: '/dashboard/sales-by-hour',
            labelField: 'hour',
            valueField: 'revenue',
          },
        ],
      },
    };

    const { container } = renderWithClient(<GenericPanel spec={spec} />);

    // Composición side-by-side real: hero (gráfica) a un lado, stats (KPI) al otro.
    const split = container.querySelector('.dv-hero-split');
    expect(split).toBeInTheDocument();
    expect(container.querySelector('.dv-hero-split-main')).toBeInTheDocument();
    expect(container.querySelector('.dv-hero-split-side')).toBeInTheDocument();
    // El KPI vive en la columna de stats, no en una KpiRow apilada arriba.
    expect(screen.queryByTestId('dv-kpi-row')).toBeNull();
    expect(screen.getByText('Ventas por hora')).toBeInTheDocument();
    expect(screen.getByText('Facturación')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/5\.?000,00\s?€/)).toBeInTheDocument());
  });
});
