import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Chart, type ChartBar } from './Chart.js';

const data: ChartBar[] = [
  { label: 'Centro', value: 200, compareValue: 150, tipExtra: '+33 %' },
  { label: 'Norte', value: 80 },
];

describe('Chart', () => {
  it('pinta una columna por dato SIN cifra dentro de la barra (U-01)', () => {
    const { container } = render(
      <Chart data={data} formatValue={(n) => `${n} €`} showGrid={false} data-testid="bars" />,
    );
    expect(screen.getAllByTestId('ui-chart-group')).toHaveLength(2);
    expect(screen.getByText('Centro')).toBeInTheDocument();
    // El valor no se pinta en reposo: solo vive en el tooltip y el aria.
    expect(screen.queryByText('200 €')).not.toBeInTheDocument();
    expect(container.querySelector('.ui-chart-bar-text')).toBeNull();
  });

  it('añade la barra de comparación cuando hay compareValue', () => {
    const { container } = render(<Chart data={data} formatValue={(n) => `${n} €`} />);
    // Centro: valor + comparación = 2 barras; Norte: solo valor = 1 barra → 3.
    expect(container.querySelectorAll('.ui-chart-bar')).toHaveLength(3);
    expect(container.querySelector('.ui-chart-bar-compare')).not.toBeNull();
  });

  it('hover sobre una columna materializa el tooltip con valor, comparación y extra', () => {
    render(<Chart data={data} formatValue={(n) => `${n} €`} showGrid={false} />);
    const [centro] = screen.getAllByTestId('ui-chart-group');
    fireEvent.mouseEnter(centro!);
    expect(screen.getByText('200 €')).toBeInTheDocument();
    expect(screen.getByText('150 €')).toBeInTheDocument();
    expect(screen.getByText('+33 %')).toBeInTheDocument();
    fireEvent.mouseLeave(centro!);
    expect(screen.queryByText('200 €')).not.toBeInTheDocument();
  });

  it('focus también muestra el tooltip (accesible por teclado)', () => {
    render(<Chart data={data} formatValue={(n) => `${n} €`} />);
    const norte = screen.getAllByTestId('ui-chart-group')[1]!;
    fireEvent.focus(norte);
    expect(screen.getByText('80 €')).toBeInTheDocument();
    fireEvent.blur(norte);
    expect(screen.queryByText('80 €')).not.toBeInTheDocument();
  });

  it('la selección es solo semántica: no existe clase de atenuación (U-01)', () => {
    const { container } = render(<Chart data={data} selected="Centro" />);
    expect(container.querySelector('.has-selection')).toBeNull();
    expect(container.querySelector('.is-selected')).toBeNull();
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

  it('kind="line" dibuja polyline + puntos y conserva el tooltip al hover (U-02)', () => {
    const { container } = render(
      <Chart data={data} kind="line" formatValue={(n) => `${n} €`} showGrid={false} />,
    );
    expect(container.querySelector('.ui-chart-line-path')).not.toBeNull();
    expect(container.querySelector('.ui-chart-line-path-compare')).not.toBeNull();
    // 2 datos → 2 puntos de valor + 1 de comparación (solo Centro la tiene).
    expect(container.querySelectorAll('.ui-chart-dot')).toHaveLength(3);
    expect(screen.queryByText('200 €')).not.toBeInTheDocument();
    const [centro] = screen.getAllByTestId('ui-chart-group');
    fireEvent.mouseEnter(centro!);
    expect(screen.getByText('200 €')).toBeInTheDocument();
    expect(screen.getByText('+33 %')).toBeInTheDocument();
    expect(screen.getByText('Centro')).toBeInTheDocument(); // label bajo el lienzo
  });

  it('con showGrid dibuja líneas de referencia y etiquetas de eje con pasos redondos', () => {
    const { container } = render(<Chart data={data} formatValue={(n) => `${n} €`} />);
    // niceTicks(200) → 0,50,100,150,200; cada marca es una línea con su etiqueta.
    expect(container.querySelectorAll('.ui-chart-grid-line').length).toBeGreaterThanOrEqual(4);
    const axes = Array.from(container.querySelectorAll('.ui-chart-axis')).map((n) => n.textContent);
    expect(axes).toContain('200 €');
    expect(axes).toContain('100 €');
  });

  it('expone el conjunto con ariaLabel y cada columna lleva el valor en su aria', () => {
    render(<Chart data={data} ariaLabel="Ventas por tienda" formatValue={(n) => `${n} €`} />);
    expect(screen.getByRole('group', { name: 'Ventas por tienda' })).toBeInTheDocument();
    expect(screen.getByLabelText('Centro: 200 € · 150 € · +33 %')).toBeInTheDocument();
  });
});
