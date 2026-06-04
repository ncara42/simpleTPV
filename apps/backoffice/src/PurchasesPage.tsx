import { useState } from 'react';

import { usePageHeader } from './lib/pageHeader.js';
import { OrdersSection } from './purchases/OrdersSection.js';
import { SuggestSection } from './purchases/SuggestSection.js';
import { SuppliersSection } from './purchases/SuppliersSection.js';

type Section = 'orders' | 'suppliers' | 'suggest';

export function PurchasesPage() {
  const [section, setSection] = useState<Section>('orders');
  usePageHeader('Compras', 'Propuestas y pedidos a proveedor');
  return (
    <section className="catalog" data-testid="purchases-page">
      <nav className="bo-tabs" data-testid="purchases-subtabs">
        <button
          className={`bo-tab ${section === 'orders' ? 'active' : ''}`}
          onClick={() => setSection('orders')}
          data-testid="purchases-tab-orders"
        >
          Pedidos
        </button>
        <button
          className={`bo-tab ${section === 'suppliers' ? 'active' : ''}`}
          onClick={() => setSection('suppliers')}
          data-testid="purchases-tab-suppliers"
        >
          Proveedores
        </button>
        <button
          className={`bo-tab ${section === 'suggest' ? 'active' : ''}`}
          onClick={() => setSection('suggest')}
          data-testid="purchases-tab-suggest"
        >
          Propuesta
        </button>
      </nav>
      {section === 'orders' && <OrdersSection />}
      {section === 'suppliers' && <SuppliersSection />}
      {section === 'suggest' && <SuggestSection />}
    </section>
  );
}
