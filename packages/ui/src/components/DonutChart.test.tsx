import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DonutChart, type DonutSlice } from './DonutChart.js';

const data: DonutSlice[] = [
  { label: 'Bebidas', value: 300 },
  { label: 'Snacks', value: 100 },
];

const eur = (n: number): string => `${n} €`;

describe('DonutChart', () => {
  it('pinta un segmento por porción y una fila de leyenda con valor y porcentaje', () => {
    render(<DonutChart data={data} formatValue={eur} />);
    expect(screen.getAllByTestId('ui-donut-seg')).toHaveLength(2);
    expect(screen.getByText('Bebidas')).toBeInTheDocument();
    expect(screen.getByText('300 €')).toBeInTheDocument();
    // 300/400 = 75 % (sin decimales por ser ≥ 10).
    expect(screen.getByText('75 %')).toBeInTheDocument();
    expect(screen.getByText('25 %')).toBeInTheDocument();
  });

  it('muestra el total en el centro en reposo', () => {
    render(<DonutChart data={data} formatValue={eur} centerLabel="Total" />);
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('400 €')).toBeInTheDocument();
  });

  it('al pasar el ratón por una fila, el centro muestra esa categoría', () => {
    const { container } = render(<DonutChart data={data} formatValue={eur} />);
    const centerLabel = container.querySelector('.ui-donut-center-label')!;
    const centerValue = container.querySelector('.ui-donut-center-value')!;
    expect(centerLabel).toHaveTextContent('Total');
    expect(centerValue).toHaveTextContent('400 €');
    fireEvent.mouseEnter(screen.getByText('Snacks'));
    // El centro pasa a la categoría señalada.
    expect(centerLabel).toHaveTextContent('Snacks');
    expect(centerValue).toHaveTextContent('100 €');
  });

  it('estado vacío cuando no hay datos (o suma 0)', () => {
    render(<DonutChart data={[]} formatValue={eur} />);
    expect(screen.queryAllByTestId('ui-donut-seg')).toHaveLength(0);
    expect(screen.getByText('Sin datos en el periodo.')).toBeInTheDocument();
  });

  it('expone el conjunto con ariaLabel', () => {
    render(<DonutChart data={data} formatValue={eur} ariaLabel="Ventas por familia" />);
    expect(screen.getByRole('group', { name: 'Ventas por familia' })).toBeInTheDocument();
  });

  it('con onSelect cada fila de la leyenda es un botón que emite su label', () => {
    const onSelect = vi.fn();
    render(<DonutChart data={data} formatValue={eur} onSelect={onSelect} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]!);
    expect(onSelect).toHaveBeenCalledWith('Snacks');
  });
});
