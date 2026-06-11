import { useState } from 'react';

import { usePageHeader } from './lib/pageHeader.js';
import { OrdersSection as PurchaseOrdersSection } from './purchases/OrdersSection.js';
import { SuggestSection } from './purchases/SuggestSection.js';
import { SupplierPricesSection } from './purchases/SupplierPricesSection.js';
import { SuppliersSection } from './purchases/SuppliersSection.js';

type Section = 'suppliers' | 'prices' | 'orders' | 'suggest';

// Proveedores (P1-B): lado COMPRA del negocio, separado de Clientes B2B (lado
// venta). Reúne proveedores, tarifas de compra, pedidos de compra y la propuesta.
export function SuppliersPage() {
  const [section, setSection] = useState<Section>('suppliers');
  usePageHeader('Proveedores', 'Proveedores, tarifas de compra, pedidos de compra y propuesta');
  return (
    <section className="catalog" data-testid="suppliers-page">
      <nav className="bo-tabs" data-testid="suppliers-subtabs">
        <button
          className={`bo-tab ${section === 'suppliers' ? 'active' : ''}`}
          onClick={() => setSection('suppliers')}
          data-testid="suppliers-tab-suppliers"
        >
          Proveedores
        </button>
        <button
          className={`bo-tab ${section === 'prices' ? 'active' : ''}`}
          onClick={() => setSection('prices')}
          data-testid="suppliers-tab-prices"
        >
          Tarifas de compra
        </button>
        <button
          className={`bo-tab ${section === 'orders' ? 'active' : ''}`}
          onClick={() => setSection('orders')}
          data-testid="suppliers-tab-orders"
        >
          Pedidos de compra
        </button>
        <button
          className={`bo-tab ${section === 'suggest' ? 'active' : ''}`}
          onClick={() => setSection('suggest')}
          data-testid="suppliers-tab-suggest"
        >
          Propuesta
        </button>
      </nav>
      {section === 'suppliers' && <SuppliersSection />}
      {section === 'prices' && <SupplierPricesSection />}
      {section === 'orders' && <PurchaseOrdersSection />}
      {section === 'suggest' && <SuggestSection />}
    </section>
  );
}
