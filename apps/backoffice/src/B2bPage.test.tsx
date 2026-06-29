import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

// S-21: smoke test del orquestador Clientes B2B (deep-link a subsección). Mockeamos
// las tres secciones por componentes ligeros que solo declaran sus testids: así el
// test verifica la LÓGICA de selección de subtab de `B2bPage` (lo que cambió S-21),
// sin arrastrar red, providers ni el CRUD real de cada sección. Las secciones ya no
// reciben las pestañas por prop: `B2bPage` las inyecta en la TopBar vía `usePageNav`,
// así que aquí montamos un outlet que pinta ese valor para poder consultarlas.
vi.mock('./b2b/CustomersSection.js', () => ({
  CustomersSection: () => <div data-testid="customers-section" />,
}));
vi.mock('./b2b/PriceListsSection.js', () => ({
  PriceListsSection: () => <div data-testid="pricelists-section" />,
}));
vi.mock('./b2b/OrdersSection.js', () => ({
  OrdersSection: () => <div data-testid="orders-section" />,
}));

import { B2bPage } from './B2bPage.js';
import { PageNavProvider, usePageNavValue } from './lib/pageNav.js';

// Pinta en el DOM lo que `B2bPage` registra en el slot pageNav (las sub-pestañas), que
// en la app real vive en la columna izquierda de la TopBar.
function PageNavOutlet(): ReactNode {
  return <>{usePageNavValue()}</>;
}

function renderB2b(ui: ReactNode) {
  return render(
    <PageNavProvider>
      <PageNavOutlet />
      {ui}
    </PageNavProvider>,
  );
}

describe('B2bPage — deep-link a subsección (S-21)', () => {
  it('sin initialSection arranca en Clientes (defecto)', () => {
    renderB2b(<B2bPage />);
    expect(screen.getByTestId('customers-section')).toBeInTheDocument();
    expect(screen.queryByTestId('pricelists-section')).not.toBeInTheDocument();
    expect(screen.getByTestId('b2b-tab-customers')).toHaveClass('is-active');
  });

  it("con initialSection='pricelists' arranca mostrando Tarifas (PriceListsSection)", () => {
    renderB2b(<B2bPage initialSection="pricelists" />);
    // La subtab Tarifas está activa y su panel es el renderizado (no Clientes).
    expect(screen.getByTestId('pricelists-section')).toBeInTheDocument();
    expect(screen.queryByTestId('customers-section')).not.toBeInTheDocument();
    expect(screen.getByTestId('b2b-tab-pricelists')).toHaveClass('is-active');
    expect(screen.getByTestId('b2b-tab-customers')).not.toHaveClass('is-active');
  });

  it("con initialSection='orders' arranca en Pedidos salientes", () => {
    renderB2b(<B2bPage initialSection="orders" />);
    expect(screen.getByTestId('orders-section')).toBeInTheDocument();
    expect(screen.getByTestId('b2b-tab-orders')).toHaveClass('is-active');
  });

  it('un initialSection inválido cae a Clientes (validación contra el tipo Section)', () => {
    renderB2b(<B2bPage initialSection="no-existe" />);
    expect(screen.getByTestId('customers-section')).toBeInTheDocument();
    expect(screen.getByTestId('b2b-tab-customers')).toHaveClass('is-active');
  });

  it('null/undefined también caen a Clientes', () => {
    renderB2b(<B2bPage initialSection={null} />);
    expect(screen.getByTestId('customers-section')).toBeInTheDocument();
    expect(screen.getByTestId('b2b-tab-customers')).toHaveClass('is-active');
  });

  it('las subtabs siguen siendo conmutables tras el deep-link (no quedan congeladas)', () => {
    renderB2b(<B2bPage initialSection="pricelists" />);
    expect(screen.getByTestId('pricelists-section')).toBeInTheDocument();
    // El deep-link solo fija el ESTADO INICIAL; la interacción sigue viva.
    fireEvent.click(screen.getByTestId('b2b-tab-customers'));
    expect(screen.getByTestId('customers-section')).toBeInTheDocument();
    expect(screen.queryByTestId('pricelists-section')).not.toBeInTheDocument();
  });
});
