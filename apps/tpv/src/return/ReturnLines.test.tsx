import type { Sale } from '@simpletpv/auth';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const lines = [
  { id: 'l1', name: 'CBD 5%', qty: 3 },
  { id: 'l2', name: 'Aceite', qty: 1 },
] as unknown as Sale['lines'];

describe('ReturnLines', () => {
  it('pinta una fila por línea con vendido/devuelto/disponible', async () => {
    const { ReturnLines } = await import('./ReturnLines.js');
    render(
      <ReturnLines lines={lines} qtys={{}} returned={new Map([['l1', 1]])} onSetQty={vi.fn()} />,
    );
    expect(screen.getAllByTestId('return-line')).toHaveLength(2);
    // l1: vendido 3, devuelto 1 → disponible 2.
    expect(screen.getAllByTestId('return-line')[0]).toHaveTextContent('Disponible: 2');
  });

  it('llama onSetQty con el máximo disponible al sumar', async () => {
    const { ReturnLines } = await import('./ReturnLines.js');
    const onSetQty = vi.fn();
    render(<ReturnLines lines={lines} qtys={{}} returned={new Map()} onSetQty={onSetQty} />);
    fireEvent.click(screen.getAllByLabelText('Añadir uno')[0]!);
    // l1 sin devoluciones → max 3; suma desde 0 → 1, capado a max 3.
    expect(onSetQty).toHaveBeenCalledWith('l1', 1, 3);
  });
});
