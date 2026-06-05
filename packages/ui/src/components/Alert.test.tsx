import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Alert } from './Alert.js';

describe('Alert', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the message with the success variant by default', () => {
    render(<Alert data-testid="t">Venta registrada</Alert>);
    const el = screen.getByTestId('t');
    expect(el).toHaveClass('ui-alert', 'ui-alert--success');
    expect(el).toHaveTextContent('Venta registrada');
  });

  it('applies the requested variant', () => {
    render(
      <Alert data-testid="t" variant="danger">
        Error
      </Alert>,
    );
    expect(screen.getByTestId('t')).toHaveClass('ui-alert--danger');
  });

  it('shows a close button only when onClose is provided and calls it on click', () => {
    const { rerender } = render(<Alert data-testid="t">Sin botón</Alert>);
    expect(screen.queryByRole('button')).toBeNull();

    const onClose = vi.fn();
    rerender(
      <Alert data-testid="t" onClose={onClose} closeLabel="Cerrar" closeTestId="close">
        Con botón
      </Alert>,
    );
    fireEvent.click(screen.getByTestId('close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('auto-dismisses after the given duration', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(
      <Alert onClose={onClose} duration={5000}>
        Auto
      </Alert>,
    );
    expect(onClose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not auto-dismiss without a duration', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<Alert onClose={onClose}>Persistente</Alert>);
    vi.advanceTimersByTime(60000);
    expect(onClose).not.toHaveBeenCalled();
  });
});
