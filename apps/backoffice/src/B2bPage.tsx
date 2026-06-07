import { useState } from 'react';

import { CustomersSection } from './b2b/CustomersSection.js';
import { OrdersSection } from './b2b/OrdersSection.js';
import { PriceListsSection } from './b2b/PriceListsSection.js';
import { usePageHeader } from './lib/pageHeader.js';

type Section = 'customers' | 'pricelists' | 'orders';

// B2B mayorista saliente (IT-17): clientes, tarifas y pedidos en una sola vista
// con sub-pestañas (mismo patrón que Compras).
export function B2bPage() {
  const [section, setSection] = useState<Section>('customers');
  usePageHeader('Mayorista', 'Clientes, tarifas y pedidos salientes (ventas a clientes B2B)');
  return (
    <section className="catalog" data-testid="b2b-page">
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
