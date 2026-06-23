import { usePageHeader } from '@simpletpv/ui';
import { useState } from 'react';

import { OrdersSection as PurchaseOrdersSection } from './purchases/OrdersSection.js';
import { SuggestSection } from './purchases/SuggestSection.js';
import { SupplierPricesSection } from './purchases/SupplierPricesSection.js';
import { SuppliersSection } from './purchases/SuppliersSection.js';

type Section = 'suppliers' | 'prices' | 'orders' | 'suggest';

interface SuppliersPageProps {
  /** S-25: sección inicial (deep-link). Por defecto 'suppliers'. */
  initialSection?: Section | null;
  /** S-25: si la sección inicial es 'prices', sub-vista de tarifas a abrir
   *  ('comparativa' para el acceso directo a la comparativa). Por defecto 'tarifas'. */
  initialPricesView?: 'tarifas' | 'comparativa' | null;
}

// Proveedores (P1-B): lado COMPRA del negocio, separado de Clientes B2B (lado
// venta). Reúne proveedores, tarifas de compra, pedidos de compra y la propuesta.
// S-25: `initialSection`/`initialPricesView` permiten un deep-link de ≤1 clic a la
// comparativa (`/suppliers?vista=comparativa` → sección 'prices', sub-vista 'comparativa').
export function SuppliersPage({ initialSection, initialPricesView }: SuppliersPageProps = {}) {
  const [section, setSection] = useState<Section>(initialSection ?? 'suppliers');
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
      {section === 'prices' && (
        <SupplierPricesSection tabs={tabs} initialView={initialPricesView ?? 'tarifas'} />
      )}
      {section === 'orders' && <PurchaseOrdersSection tabs={tabs} />}
      {section === 'suggest' && <SuggestSection tabs={tabs} />}
    </section>
  );
}
