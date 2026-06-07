import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Chart, type ChartBar } from './Chart.js';

const data: ChartBar[] = [
  { label: 'Centro', value: 200, compareValue: 150 },
  { label: 'Norte', value: 80 },
];

describe('Chart', () => {
  it('pinta una columna por dato con su cifra formateada', () => {
    render(<Chart data={data} formatValue={(n) => `${n} €`} data-testid="bars" />);
    expect(screen.getAllByTestId('ui-chart-group')).toHaveLength(2);
    expect(screen.getByText('200 €')).toBeInTheDocument();
    expect(screen.getByText('Centro')).toBeInTheDocument();
  });

  it('añade la barra de comparación cuando hay compareValue', () => {
    const { container } = render(<Chart data={data} formatValue={(n) => `${n} €`} />);
    // Centro: valor + comparación = 2 barras; Norte: solo valor = 1 barra → 3.
    expect(container.querySelectorAll('.ui-chart-bar')).toHaveLength(3);
    expect(container.querySelector('.ui-chart-bar-compare')).not.toBeNull();
    expect(screen.getByText('150 €')).toBeInTheDocument();
  });

  it('atenúa el resto cuando hay selección', () => {
    const { container } = render(<Chart data={data} selected="Centro" />);
    expect(container.querySelector('.ui-chart.has-selection')).not.toBeNull();
    const selected = container.querySelector('.ui-chart-group.is-selected')!;
    expect(selected.textContent).toContain('Centro');
  });

  it('con onSelect cada columna es un botón que emite su label', () => {
    const onSelect = vi.fn();
    render(<Chart data={data} selected="Centro" onSelect={onSelect} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true'); // Centro seleccionado
    fireEvent.click(buttons[1]!);
    expect(onSelect).toHaveBeenCalledWith('Norte');
  });

  it('expone el conjunto con ariaLabel', () => {
    render(<Chart data={data} ariaLabel="Ventas por tienda" />);
    expect(screen.getByRole('group', { name: 'Ventas por tienda' })).toBeInTheDocument();
  });
});
