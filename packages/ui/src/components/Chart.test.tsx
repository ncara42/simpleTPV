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

  it('barValues rotula cada barra con su valor (visible sin hover) y colapsa el eje', () => {
    const { container } = render(
      <Chart data={data} formatValue={(n) => `${n} €`} showGrid={false} barValues />,
    );
    // Cifras visibles en reposo (no hace falta pasar el ratón).
    expect(screen.getByText('200 €')).toBeInTheDocument();
    expect(screen.getByText('150 €')).toBeInTheDocument();
    expect(screen.getByText('80 €')).toBeInTheDocument();
    // Una etiqueta por barra: Centro (valor+compare) + Norte (valor) = 3.
    expect(container.querySelectorAll('.ui-chart-bar-tag-text')).toHaveLength(3);
    // Sin eje Y → canal izquierdo colapsado.
    expect(container.querySelector('.ui-chart-no-axis')).not.toBeNull();
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
    // "Centro" aparece bajo el lienzo y, al hacer hover, también como título del
    // tooltip → dos coincidencias.
    expect(screen.getAllByText('Centro').length).toBeGreaterThanOrEqual(1);
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

  // B-01: con muchos buckets (serie temporal de Ventas) las etiquetas se amontonaban
  // y el gráfico crecía sin límite. Se rotula 1 de cada N manteniendo siempre la última;
  // la contención de ancho es CSS, pero el throttling es lógica DOM verificable aquí.
  it('B-01: con >30 datos rotula 1 de cada 2 etiquetas y siempre la última', () => {
    const many: ChartBar[] = Array.from({ length: 40 }, (_, i) => ({ label: `D${i}`, value: 100 }));
    const { container } = render(
      <Chart data={many} formatValue={(n) => `${n}`} showGrid={false} />,
    );
    // Se mantiene UNA celda por dato (preserva la alineación de columnas)…
    expect(container.querySelectorAll('.ui-chart-name-cell')).toHaveLength(40);
    // …pero solo se rotula 1 de cada 2 (20) + la última (idx 39, impar) = 21.
    expect(container.querySelectorAll('.ui-chart-name')).toHaveLength(21);
    expect(screen.getByText('D39')).toBeInTheDocument(); // la última SIEMPRE
    expect(screen.queryByText('D37')).not.toBeInTheDocument(); // una intermedia impar, oculta
  });

  it('B-01: con ≤30 datos rotula todas las etiquetas (no-op para los widgets del dashboard)', () => {
    const few: ChartBar[] = Array.from({ length: 12 }, (_, i) => ({ label: `M${i}`, value: 50 }));
    const { container } = render(<Chart data={few} formatValue={(n) => `${n}`} showGrid={false} />);
    expect(container.querySelectorAll('.ui-chart-name')).toHaveLength(12);
  });
});
