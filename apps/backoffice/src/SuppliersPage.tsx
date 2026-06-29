import { usePageHeader } from '@simpletpv/ui';
import { useState } from 'react';

import { usePageNav } from './lib/pageNav.js';
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

  // Subnavegación como las views de Inventario/B2B: cada sección es un botón independiente
  // (`.inv-nav-tab`) inyectado en la columna IZQUIERDA de la TopBar, no una píldora-contenedor
  // dentro de la card. Cada sección pinta solo su contenido (sin banda de pestañas propia).
  usePageNav(
    <div
      className="inv-nav-tabs"
      role="tablist"
      aria-label="Sección de proveedores"
      data-testid="suppliers-subtabs"
    >
      <button
        type="button"
        role="tab"
        className={`inv-nav-tab${section === 'suppliers' ? ' is-active' : ''}`}
        aria-pressed={section === 'suppliers'}
        onClick={() => setSection('suppliers')}
        data-testid="suppliers-tab-suppliers"
      >
        Proveedores
      </button>
      <button
        type="button"
        role="tab"
        className={`inv-nav-tab${section === 'prices' ? ' is-active' : ''}`}
        aria-pressed={section === 'prices'}
        onClick={() => setSection('prices')}
        data-testid="suppliers-tab-prices"
      >
        Tarifas de compra
      </button>
      <button
        type="button"
        role="tab"
        className={`inv-nav-tab${section === 'orders' ? ' is-active' : ''}`}
        aria-pressed={section === 'orders'}
        onClick={() => setSection('orders')}
        data-testid="suppliers-tab-orders"
      >
        Pedidos de compra
      </button>
      <button
        type="button"
        role="tab"
        className={`inv-nav-tab${section === 'suggest' ? ' is-active' : ''}`}
        aria-pressed={section === 'suggest'}
        onClick={() => setSection('suggest')}
        data-testid="suppliers-tab-suggest"
      >
        Propuesta
      </button>
    </div>,
  );

  return (
    <section className="catalog" data-testid="suppliers-page">
      {section === 'suppliers' && <SuppliersSection />}
      {section === 'prices' && (
        <SupplierPricesSection initialView={initialPricesView ?? 'tarifas'} />
      )}
      {section === 'orders' && <PurchaseOrdersSection />}
      {section === 'suggest' && <SuggestSection />}
    </section>
  );
}
