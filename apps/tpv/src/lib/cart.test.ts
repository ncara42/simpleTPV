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

  it('aplica descuento por línea y recalcula neto/subtotal/total', () => {
    useCart.getState().addItem(product); // 12.50
    useCart.getState().setQty('p1', 2); // bruto 25
    useCart.getState().setLineDiscount('p1', 10); // -2.50 → neto 22.50
    const item = useCart.getState().items[0]!;
    expect(useCart.getState().lineNet(item)).toBeCloseTo(22.5, 2);
    expect(useCart.getState().subtotal()).toBeCloseTo(22.5, 2);
    expect(useCart.getState().discountTotal()).toBeCloseTo(2.5, 2);
    expect(useCart.getState().total()).toBeCloseTo(22.5, 2);
  });

  it('descuento de ticket por porcentaje', () => {
    useCart.getState().addItem(product);
    useCart.getState().setQty('p1', 8); // 100
    useCart.getState().setTicketDiscount({ pct: 25 });
    expect(useCart.getState().subtotal()).toBeCloseTo(100, 2);
    expect(useCart.getState().ticketDiscount()).toBeCloseTo(25, 2);
    expect(useCart.getState().total()).toBeCloseTo(75, 2);
  });

  it('descuento de ticket por importe con precedencia sobre el %', () => {
    useCart.getState().addItem(product);
    useCart.getState().setQty('p1', 8); // 100
    useCart.getState().setTicketDiscount({ pct: 50 });
    useCart.getState().setTicketDiscount({ amt: 10 });
    expect(useCart.getState().ticketDiscount()).toBeCloseTo(10, 2);
    expect(useCart.getState().total()).toBeCloseTo(90, 2);
  });

  it('capa el importe de ticket al subtotal', () => {
    useCart.getState().addItem(product); // 12.50
    useCart.getState().setTicketDiscount({ amt: 999 });
    expect(useCart.getState().ticketDiscount()).toBeCloseTo(12.5, 2);
    expect(useCart.getState().total()).toBeCloseTo(0, 2);
  });

  it('combina descuento de línea y de ticket (coincide con el servidor)', () => {
    useCart.getState().addItem(product); // 12.50
    useCart.getState().setQty('p1', 8); // 100
    useCart.getState().setLineDiscount('p1', 10); // neto 90
    useCart.getState().setTicketDiscount({ pct: 10 }); // 10% de 90 = 9
    expect(useCart.getState().subtotal()).toBeCloseTo(90, 2);
    expect(useCart.getState().discountTotal()).toBeCloseTo(19, 2); // 10 + 9
    expect(useCart.getState().total()).toBeCloseTo(81, 2);
  });

  it('clear resetea también los descuentos de ticket', () => {
    useCart.getState().addItem(product);
    useCart.getState().setTicketDiscount({ pct: 30 });
    useCart.getState().clear();
    expect(useCart.getState().ticketDiscountPct).toBe(0);
    expect(useCart.getState().ticketDiscountAmt).toBe(0);
  });
});
