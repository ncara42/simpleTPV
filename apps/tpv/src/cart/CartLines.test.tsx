import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { CartItem } from '../lib/cart.js';
import { CartLines } from './CartLines.js';

function item(over: Partial<CartItem> = {}): CartItem {
  return {
    productId: 'p1',
    name: 'CBD 5%',
    unitPrice: 10,
    qty: 2,
    discountPct: 0,
    discountAmt: 0,
    ...over,
  };
}

const lineNet = (i: CartItem) => i.unitPrice * i.qty - i.discountAmt;

describe('CartLines', () => {
  it('muestra el vacío sin items', () => {
    render(
      <CartLines
        items={[]}
        lineNet={lineNet}
        onSetQty={vi.fn()}
        onEditLineDiscount={vi.fn()}
        onClearLineDiscount={vi.fn()}
      />,
    );
    expect(screen.getByTestId('cart-empty')).toBeInTheDocument();
  });

  it('pinta una línea con su neto y ajusta cantidad', () => {
    const onSetQty = vi.fn();
    render(
      <CartLines
        items={[item()]}
        lineNet={lineNet}
        onSetQty={onSetQty}
        onEditLineDiscount={vi.fn()}
        onClearLineDiscount={vi.fn()}
      />,
    );
    expect(screen.getByTestId('cart-line-total')).toHaveTextContent('20,00');
    fireEvent.click(screen.getByLabelText('Añadir uno'));
    expect(onSetQty).toHaveBeenCalledWith('p1', 3);
    fireEvent.click(screen.getByLabelText('Quitar uno'));
    expect(onSetQty).toHaveBeenCalledWith('p1', 1);
  });

  it('con descuento muestra el badge editable y permite quitarlo', () => {
    const onEdit = vi.fn();
    const onClear = vi.fn();
    render(
      <CartLines
        items={[item({ discountAmt: 5 })]}
        lineNet={lineNet}
        onSetQty={vi.fn()}
        onEditLineDiscount={onEdit}
        onClearLineDiscount={onClear}
      />,
    );
    fireEvent.click(screen.getByTestId('cart-line-discount'));
    expect(onEdit).toHaveBeenCalledWith('p1');
    fireEvent.click(screen.getByTestId('cart-line-discount-clear'));
    expect(onClear).toHaveBeenCalledWith('p1');
  });
});
