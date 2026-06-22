import { usePageHeader } from '@simpletpv/ui';
import { useState } from 'react';

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
  // Las pestañas viven DENTRO de la card de la sección activa (cabecera del panel),
  // no flotando sobre el lienzo. El estado sigue aquí; cada sección las pinta en su
  // card (slot `header` del DataTable o primer hijo de su `.table-panel`).
  const tabs = (
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
  );
  return (
    <section className="catalog" data-testid="suppliers-page">
      {section === 'suppliers' && <SuppliersSection tabs={tabs} />}
      {section === 'prices' && <SupplierPricesSection tabs={tabs} />}
      {section === 'orders' && <PurchaseOrdersSection tabs={tabs} />}
      {section === 'suggest' && <SuggestSection tabs={tabs} />}
    </section>
  );
}
