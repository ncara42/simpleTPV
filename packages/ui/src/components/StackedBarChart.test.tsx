import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StackedBarChart, type StackedBarDatum, type StackedSegment } from './StackedBarChart.js';

const segments: StackedSegment[] = [
  { key: 'food', label: 'Comida' },
  { key: 'drink', label: 'Bebida' },
];

const data: StackedBarDatum[] = [
  { label: 'Centro', values: { food: 120, drink: 80 } },
  { label: 'Norte', values: { food: 60, drink: 40 } },
];

const eur = (n: number): string => `${n} €`;

describe('StackedBarChart', () => {
  it('pinta una columna por dato y un segmento por serie con valor', () => {
    render(<StackedBarChart data={data} segments={segments} formatValue={eur} />);
    expect(screen.getAllByTestId('ui-chart-group')).toHaveLength(2);
    // 2 columnas × 2 series = 4 segmentos.
    expect(screen.getAllByTestId('ui-chart-seg')).toHaveLength(4);
    expect(screen.getByText('Centro')).toBeInTheDocument();
  });

  it('muestra la leyenda con cada serie', () => {
    render(<StackedBarChart data={data} segments={segments} formatValue={eur} />);
    expect(screen.getByText('Comida')).toBeInTheDocument();
    expect(screen.getByText('Bebida')).toBeInTheDocument();
  });

  it('hover desglosa la columna por serie y muestra el total', () => {
    render(<StackedBarChart data={data} segments={segments} formatValue={eur} showGrid={false} />);
    const [centro] = screen.getAllByTestId('ui-chart-group');
    fireEvent.mouseEnter(centro!);
    expect(screen.getByText('120 €')).toBeInTheDocument();
    expect(screen.getByText('80 €')).toBeInTheDocument();
    expect(screen.getByText('Total 200 €')).toBeInTheDocument();
    fireEvent.mouseLeave(centro!);
    expect(screen.queryByText('Total 200 €')).not.toBeInTheDocument();
  });

  it('omite el segmento de una serie con valor 0', () => {
    const sparse: StackedBarDatum[] = [{ label: 'Sur', values: { food: 50, drink: 0 } }];
    render(<StackedBarChart data={sparse} segments={segments} formatValue={eur} />);
    expect(screen.getAllByTestId('ui-chart-seg')).toHaveLength(1);
  });

  it('expone el conjunto con ariaLabel y el desglose en el aria de cada columna', () => {
    render(
      <StackedBarChart
        data={data}
        segments={segments}
        formatValue={eur}
        ariaLabel="Ventas por tienda y categoría"
      />,
    );
    expect(
      screen.getByRole('group', { name: 'Ventas por tienda y categoría' }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Centro: Comida 120 € · Bebida 80 € · Total 200 €'),
    ).toBeInTheDocument();
  });
});
