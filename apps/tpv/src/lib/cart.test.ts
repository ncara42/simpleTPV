import { beforeEach, describe, expect, it } from 'vitest';

import { useCart } from './cart.js';

const product = { id: 'p1', name: 'Flor CBD', salePrice: '12.50' };

describe('useCart', () => {
  beforeEach(() => {
    useCart.getState().clear();
  });

  it('añade un producto con qty 1 y vuelve a sumarlo si ya está', () => {
    useCart.getState().addItem(product);
    useCart.getState().addItem(product);
    const items = useCart.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0]!.qty).toBe(2);
  });

  it('calcula subtotal y total', () => {
    useCart.getState().addItem(product);
    useCart.getState().setQty('p1', 3);
    expect(useCart.getState().subtotal()).toBeCloseTo(37.5, 2);
    expect(useCart.getState().total()).toBeCloseTo(37.5, 2);
  });

  it('setQty <= 0 elimina la línea', () => {
    useCart.getState().addItem(product);
    useCart.getState().setQty('p1', 0);
    expect(useCart.getState().items).toHaveLength(0);
  });

  it('removeItem quita la línea', () => {
    useCart.getState().addItem(product);
    useCart.getState().removeItem('p1');
    expect(useCart.getState().items).toHaveLength(0);
  });
});
