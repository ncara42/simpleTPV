import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CartSummary } from './CartSummary.js';

const base = {
  discountTotal: 0,
  base: 8.26,
  iva: 1.74,
  total: 10,
  itemCount: 1,
  canCheckout: true,
  cashOpen: true,
  apiHealthy: true,
  error: null,
  onCheckout: vi.fn(),
  onClearDiscounts: vi.fn(),
};

describe('CartSummary', () => {
  it('muestra base, IVA y total y permite cobrar', () => {
    const onCheckout = vi.fn();
    render(<CartSummary {...base} onCheckout={onCheckout} />);
    expect(screen.getByTestId('cart-base')).toHaveTextContent('8,26');
    expect(screen.getByTestId('cart-iva')).toHaveTextContent('1,74');
    expect(screen.getByTestId('cart-total')).toHaveTextContent('10,00');
    fireEvent.click(screen.getByTestId('cart-checkout'));
    expect(onCheckout).toHaveBeenCalledOnce();
  });

  it('avisa de caja cerrada y deshabilita el cobro', () => {
    render(<CartSummary {...base} cashOpen={false} canCheckout={false} />);
    expect(screen.getByTestId('cart-cash-warning')).toBeInTheDocument();
    expect(screen.getByTestId('cart-checkout')).toBeDisabled();
  });

  it('muestra el descuento total cuando lo hay', () => {
    render(<CartSummary {...base} discountTotal={2.5} />);
    expect(screen.getByTestId('cart-discount-total')).toHaveTextContent('2,50');
  });
});
