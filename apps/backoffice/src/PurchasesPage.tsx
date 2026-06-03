import { useState } from 'react';

import { OrdersSection } from './purchases/OrdersSection.js';
import { SuggestSection } from './purchases/SuggestSection.js';
import { SuppliersSection } from './purchases/SuppliersSection.js';

type Section = 'orders' | 'suppliers' | 'suggest';

export function PurchasesPage() {
  const [section, setSection] = useState<Section>('orders');
  return (
    <section className="catalog" data-testid="purchases-page">
      <header className="catalog-head">
        <div>
          <h2>Compras</h2>
          <p className="catalog-sub">Propuestas y pedidos a proveedor</p>
        </div>
      </header>
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
