import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

// S-21: smoke test del orquestador Clientes B2B (deep-link a subsección). Mockeamos
// las tres secciones por componentes ligeros que solo declaran sus testids: así el
// test verifica la LÓGICA de selección de subtab de `B2bPage` (lo que cambió S-21),
// sin arrastrar red, providers ni el CRUD real de cada sección.
vi.mock('./b2b/CustomersSection.js', () => ({
  CustomersSection: ({ tabs }: { tabs: ReactNode }) => (
    <div data-testid="customers-section">{tabs}</div>
  ),
}));
vi.mock('./b2b/PriceListsSection.js', () => ({
  PriceListsSection: ({ tabs }: { tabs: ReactNode }) => (
    <div data-testid="pricelists-section">{tabs}</div>
  ),
}));
vi.mock('./b2b/OrdersSection.js', () => ({
  OrdersSection: ({ tabs }: { tabs: ReactNode }) => <div data-testid="orders-section">{tabs}</div>,
}));

import { B2bPage } from './B2bPage.js';

describe('B2bPage — deep-link a subsección (S-21)', () => {
  it('sin initialSection arranca en Clientes (defecto)', () => {
    render(<B2bPage />);
    expect(screen.getByTestId('customers-section')).toBeInTheDocument();
    expect(screen.queryByTestId('pricelists-section')).not.toBeInTheDocument();
    expect(screen.getByTestId('b2b-tab-customers')).toHaveClass('active');
  });

  it("con initialSection='pricelists' arranca mostrando Tarifas (PriceListsSection)", () => {
    render(<B2bPage initialSection="pricelists" />);
    // La subtab Tarifas está activa y su panel es el renderizado (no Clientes).
    expect(screen.getByTestId('pricelists-section')).toBeInTheDocument();
    expect(screen.queryByTestId('customers-section')).not.toBeInTheDocument();
    expect(screen.getByTestId('b2b-tab-pricelists')).toHaveClass('active');
    expect(screen.getByTestId('b2b-tab-customers')).not.toHaveClass('active');
  });

  it("con initialSection='orders' arranca en Pedidos salientes", () => {
    render(<B2bPage initialSection="orders" />);
    expect(screen.getByTestId('orders-section')).toBeInTheDocument();
    expect(screen.getByTestId('b2b-tab-orders')).toHaveClass('active');
  });

  it('un initialSection inválido cae a Clientes (validación contra el tipo Section)', () => {
    render(<B2bPage initialSection="no-existe" />);
    expect(screen.getByTestId('customers-section')).toBeInTheDocument();
    expect(screen.getByTestId('b2b-tab-customers')).toHaveClass('active');
  });

  it('null/undefined también caen a Clientes', () => {
    render(<B2bPage initialSection={null} />);
    expect(screen.getByTestId('customers-section')).toBeInTheDocument();
    expect(screen.getByTestId('b2b-tab-customers')).toHaveClass('active');
  });

  it('las subtabs siguen siendo conmutables tras el deep-link (no quedan congeladas)', () => {
    render(<B2bPage initialSection="pricelists" />);
    expect(screen.getByTestId('pricelists-section')).toBeInTheDocument();
    // El deep-link solo fija el ESTADO INICIAL; la interacción sigue viva.
    fireEvent.click(screen.getByTestId('b2b-tab-customers'));
    expect(screen.getByTestId('customers-section')).toBeInTheDocument();
    expect(screen.queryByTestId('pricelists-section')).not.toBeInTheDocument();
  });
});
