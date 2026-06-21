import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ComparisonBars, DataGrid, ShareDonut, StockAlertList, TrendLine } from './index.js';

describe('ComparisonBars / TrendLine', () => {
  it('pinta título y una gráfica con los datos', () => {
    const { container } = render(
      <ComparisonBars
        title="Ventas por vendedor"
        items={[
          { label: 'A', value: 10 },
          { label: 'B', value: 30 },
        ]}
        format="eur"
      />,
    );
    expect(screen.getByText('Ventas por vendedor')).toBeInTheDocument();
    expect(container.querySelector('.ui-chart')).toBeInTheDocument();
  });

  it('lista vacía → estado vacío', () => {
    render(<ComparisonBars title="X" items={[]} />);
    expect(screen.getByText('Sin datos.')).toBeInTheDocument();
  });

  it('TrendLine renderiza una gráfica de línea', () => {
    const { container } = render(
      <TrendLine title="Por hora" items={[{ label: '10h', value: 5 }]} />,
    );
    expect(container.querySelector('.ui-chart')).toBeInTheDocument();
  });
});

describe('ShareDonut (guardia ≤6 categorías)', () => {
  it('con ≤6 categorías pinta un donut', () => {
    const { container } = render(
      <ShareDonut
        title="Por familia"
        items={[
          { label: 'A', value: 60 },
          { label: 'B', value: 40 },
        ]}
      />,
    );
    expect(container.querySelector('.ui-pie')).toBeInTheDocument();
    expect(container.querySelector('.dv-rank')).toBeNull();
  });

  it('con >6 categorías degrada a ranking de barras', () => {
    const items = Array.from({ length: 9 }, (_, i) => ({ label: `F${i}`, value: 9 - i }));
    const { container } = render(<ShareDonut title="Por familia" items={items} />);
    expect(container.querySelector('.dv-rank')).toBeInTheDocument();
    expect(container.querySelector('.ui-pie')).toBeNull();
  });
});

describe('DataGrid', () => {
  it('formatea columnas numéricas y pinta cabeceras legibles', () => {
    const { container } = render(
      <DataGrid
        title="Top productos"
        columns={[
          { key: 'name', header: 'Producto' },
          { key: 'total', header: 'Ventas', format: 'eur' },
        ]}
        rows={[{ name: 'Café', total: 84560.5 }]}
      />,
    );
    // El contenido puede repartirse en varias celdas/nodos: comprobamos el texto completo.
    const text = container.textContent ?? '';
    expect(text).toContain('Producto');
    expect(text).toContain('Café');
    // Solo los dígitos (eur agrupa a partir de 5 dígitos y usa NBSP antes de €).
    expect(text).toMatch(/84\.560,50/);
  });

  it('sin filas → estado vacío', () => {
    render(<DataGrid columns={[{ key: 'a', header: 'A' }]} rows={[]} />);
    expect(screen.getByText('Sin datos.')).toBeInTheDocument();
  });
});

describe('StockAlertList', () => {
  it('pinta filas con estado y cantidad/umbral', () => {
    const { container } = render(
      <StockAlertList
        title="Roturas"
        items={[
          {
            name: 'Aceite CBD',
            detail: 'Tienda Centro',
            quantity: 0,
            threshold: 5,
            tone: 'danger',
            status: 'Agotado',
          },
        ]}
      />,
    );
    expect(screen.getByText('Aceite CBD')).toBeInTheDocument();
    expect(screen.getByText('Tienda Centro')).toBeInTheDocument();
    expect(container.querySelector('.dv-status-pill--danger')).toBeInTheDocument();
  });

  it('lista vacía → estado vacío', () => {
    render(<StockAlertList items={[]} />);
    expect(screen.getByText('Sin datos.')).toBeInTheDocument();
  });
});
