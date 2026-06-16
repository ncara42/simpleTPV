import { usePageHeader } from '@simpletpv/ui';
import { useState } from 'react';

import { CustomersSection } from './b2b/CustomersSection.js';
import { OrdersSection } from './b2b/OrdersSection.js';
import { PriceListsSection } from './b2b/PriceListsSection.js';

type Section = 'customers' | 'pricelists' | 'orders';

// Clientes B2B (P1-B): lado VENTA del mayorista (clientes, tarifas de venta y
// pedidos salientes), separado de Proveedores (lado compra).
export function B2bPage() {
  const [section, setSection] = useState<Section>('customers');
  usePageHeader('Clientes B2B', 'Clientes, tarifas de venta y pedidos salientes');
  return (
    <section className="catalog b2b-page" data-testid="b2b-page">
      <nav className="bo-tabs" data-testid="b2b-subtabs">
        <button
          className={`bo-tab ${section === 'customers' ? 'active' : ''}`}
          onClick={() => setSection('customers')}
          data-testid="b2b-tab-customers"
        >
          Clientes
        </button>
        <button
          className={`bo-tab ${section === 'pricelists' ? 'active' : ''}`}
          onClick={() => setSection('pricelists')}
          data-testid="b2b-tab-pricelists"
        >
          Tarifas
        </button>
        <button
          className={`bo-tab ${section === 'orders' ? 'active' : ''}`}
          onClick={() => setSection('orders')}
          data-testid="b2b-tab-orders"
        >
          Pedidos salientes
        </button>
      </nav>
      {section === 'customers' && <CustomersSection />}
      {section === 'pricelists' && <PriceListsSection />}
      {section === 'orders' && <OrdersSection />}
    </section>
  );
}
