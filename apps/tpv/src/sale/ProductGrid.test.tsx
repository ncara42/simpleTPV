import type { Product, StockRow } from '@simpletpv/auth';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProductGrid } from './ProductGrid.js';

function product(id: string, name: string, salePrice: string): Product {
  return {
    id,
    name,
    sku: null,
    barcode: null,
    description: null,
    salePrice,
    costPrice: '0',
    taxRate: '21',
    saleUnit: 'unit',
    unitSymbol: 'u',
    familyId: null,
    active: true,
  };
}

function stock(productId: string, quantity: number, level: StockRow['level']): StockRow {
  return { productId, productName: productId, storeId: 's1', quantity, minStock: 1, level };
}

describe('ProductGrid', () => {
  it('muestra el estado de carga', () => {
    render(
      <ProductGrid
        isLoading
        products={[]}
        stockByProduct={new Map()}
        onAdd={vi.fn()}
        onShowStock={vi.fn()}
      />,
    );
    expect(screen.getByText('Cargando…')).toBeInTheDocument();
  });

  it('muestra el vacío sin productos', () => {
    render(
      <ProductGrid
        isLoading={false}
        products={[]}
        stockByProduct={new Map()}
        onAdd={vi.fn()}
        onShowStock={vi.fn()}
      />,
    );
    expect(screen.getByTestId('sale-empty')).toBeInTheDocument();
  });

  it('añade al carrito al pulsar la tarjeta y abre stock al pulsar el badge', () => {
    const onAdd = vi.fn();
    const onShowStock = vi.fn();
    const p = product('p1', 'CBD', '4.50');
    render(
      <ProductGrid
        isLoading={false}
        products={[p]}
        stockByProduct={new Map([['p1', stock('p1', 7, 'green')]])}
        onAdd={onAdd}
        onShowStock={onShowStock}
      />,
    );
    fireEvent.click(screen.getByTestId('prod-card'));
    expect(onAdd).toHaveBeenCalledWith(p);

    fireEvent.click(screen.getByTestId('prod-stock'));
    expect(onShowStock).toHaveBeenCalledWith(p);
    // El click en el badge no debe propagar al añadir de la tarjeta.
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('muestra "0" y atenúa la tarjeta cuando la cantidad es 0, sin bloquearla', () => {
    const onAdd = vi.fn();
    const p = product('p1', 'CBD', '4.50');
    render(
      <ProductGrid
        isLoading={false}
        products={[p]}
        stockByProduct={new Map([['p1', stock('p1', 0, 'red')]])}
        onAdd={onAdd}
        onShowStock={vi.fn()}
      />,
    );
    expect(screen.getByTestId('prod-stock')).toHaveTextContent('0');
    expect(screen.queryByText('Sin stock')).not.toBeInTheDocument();
    const card = screen.getByTestId('prod-card');
    expect(card).toHaveClass('is-out');
    // Atenuada pero NO deshabilitada: la venta nunca se bloquea por falta de stock.
    expect(card).not.toBeDisabled();
    fireEvent.click(card);
    expect(onAdd).toHaveBeenCalledWith(p);
  });

  it('ordena los productos agotados al final', () => {
    render(
      <ProductGrid
        isLoading={false}
        products={[
          product('p1', 'Con stock A', '4.50'),
          product('p2', 'Agotado', '4.50'),
          product('p3', 'Con stock B', '4.50'),
        ]}
        stockByProduct={
          new Map([
            ['p1', stock('p1', 7, 'green')],
            ['p2', stock('p2', 0, 'red')],
            ['p3', stock('p3', 3, 'yellow')],
          ])
        }
        onAdd={vi.fn()}
        onShowStock={vi.fn()}
      />,
    );
    const names = screen
      .getAllByTestId('prod-card')
      .map((card) => card.querySelector('.prod-name')?.textContent);
    expect(names).toEqual(['Con stock A', 'Con stock B', 'Agotado']);
  });

  it('deja en su sitio y sin atenuar un producto sin fila de stock', () => {
    render(
      <ProductGrid
        isLoading={false}
        products={[product('p1', 'Sin fila', '4.50'), product('p2', 'Con stock', '4.50')]}
        stockByProduct={new Map([['p2', stock('p2', 7, 'green')]])}
        onAdd={vi.fn()}
        onShowStock={vi.fn()}
      />,
    );
    const cards = screen.getAllByTestId('prod-card');
    // Orden intacto (sin fila ≠ agotado) y sin atenuar.
    expect(cards[0]).toHaveTextContent('Sin fila');
    expect(cards[0]).not.toHaveClass('is-out');
    expect(cards[0]?.querySelector('.prod-stock')).toHaveTextContent('—');
  });
});
