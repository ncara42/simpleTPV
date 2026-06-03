import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CashOpenForm } from './CashOpenForm.js';

describe('CashOpenForm', () => {
  it('deshabilita abrir sin importe y lo habilita al introducir uno', () => {
    render(<CashOpenForm onOpen={vi.fn()} pending={false} error={null} />);
    expect(screen.getByTestId('cash-open')).toBeDisabled();
    fireEvent.change(screen.getByTestId('cash-opening-amount'), { target: { value: '100' } });
    expect(screen.getByTestId('cash-open')).toBeEnabled();
  });

  it('invoca onOpen con el importe al enviar', () => {
    const onOpen = vi.fn();
    render(<CashOpenForm onOpen={onOpen} pending={false} error={null} />);
    fireEvent.change(screen.getByTestId('cash-opening-amount'), { target: { value: '120.50' } });
    fireEvent.click(screen.getByTestId('cash-open'));
    expect(onOpen).toHaveBeenCalledWith(120.5);
  });

  it('muestra el error de la mutación', () => {
    render(<CashOpenForm onOpen={vi.fn()} pending={false} error="No se pudo abrir la caja." />);
    expect(screen.getByTestId('cash-error')).toHaveTextContent('No se pudo abrir la caja.');
  });
});
