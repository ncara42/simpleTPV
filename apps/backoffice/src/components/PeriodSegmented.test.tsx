import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PERIOD_OPTIONS } from '../lib/period.js';
import { PeriodSegmented } from './PeriodSegmented.js';

describe('PeriodSegmented (S-11)', () => {
  it('renderiza un segmento por periodo con su testid y etiqueta', () => {
    render(<PeriodSegmented value="today" onChange={() => {}} />);

    const group = screen.getByTestId('period-seg');
    expect(group).toBeInTheDocument();
    expect(group).toHaveAttribute('role', 'tablist');
    expect(group).toHaveAttribute('aria-label', 'Periodo');

    for (const { value, label } of PERIOD_OPTIONS) {
      const btn = screen.getByTestId(`period-opt-${value}`);
      expect(btn).toBeInTheDocument();
      expect(btn).toHaveTextContent(label);
    }
  });

  it('marca SOLO el segmento activo con aria-pressed', () => {
    render(<PeriodSegmented value="month" onChange={() => {}} />);

    expect(screen.getByTestId('period-opt-month')).toHaveAttribute('aria-pressed', 'true');
    for (const { value } of PERIOD_OPTIONS) {
      if (value === 'month') continue;
      expect(screen.getByTestId(`period-opt-${value}`)).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('al pulsar un segmento llama onChange con ese periodo', () => {
    const onChange = vi.fn();
    render(<PeriodSegmented value="today" onChange={onChange} />);

    fireEvent.click(screen.getByTestId('period-opt-year'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('year');

    fireEvent.click(screen.getByTestId('period-opt-week'));
    expect(onChange).toHaveBeenLastCalledWith('week');
  });

  it('sin periodo activo (value desconocido) no marca ningún segmento', () => {
    // Caso de Ventas: filtro vacío ('') → ningún segmento activo.
    render(<PeriodSegmented value={'' as never} onChange={() => {}} />);

    for (const { value } of PERIOD_OPTIONS) {
      expect(screen.getByTestId(`period-opt-${value}`)).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('respeta una lista de opciones y etiqueta personalizadas', () => {
    render(
      <PeriodSegmented
        value="week"
        onChange={() => {}}
        label="Rango"
        options={[
          { value: 'week', label: 'Semana' },
          { value: 'month', label: 'Mes' },
        ]}
      />,
    );

    expect(screen.getByTestId('period-seg')).toHaveAttribute('aria-label', 'Rango');
    expect(screen.getByTestId('period-opt-week')).toBeInTheDocument();
    expect(screen.getByTestId('period-opt-month')).toBeInTheDocument();
    expect(screen.queryByTestId('period-opt-today')).not.toBeInTheDocument();
  });
});
