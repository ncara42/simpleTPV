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

  it('marca "Agotado" cuando la cantidad es 0', () => {
    render(
      <ProductGrid
        isLoading={false}
        products={[product('p1', 'CBD', '4.50')]}
        stockByProduct={new Map([['p1', stock('p1', 0, 'red')]])}
        onAdd={vi.fn()}
        onShowStock={vi.fn()}
      />,
    );
    expect(screen.getByTestId('prod-stock')).toHaveTextContent('Agotado');
  });
});
