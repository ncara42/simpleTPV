import { usePageHeader } from '@simpletpv/ui';
import { useState } from 'react';

import { CustomersSection } from './b2b/CustomersSection.js';
import { OrdersSection } from './b2b/OrdersSection.js';
import { PriceListsSection } from './b2b/PriceListsSection.js';
import { usePageNav } from './lib/pageNav.js';

type Section = 'customers' | 'pricelists' | 'orders';

const SECTIONS: readonly Section[] = ['customers', 'pricelists', 'orders'] as const;

/** Valida un valor de URL contra el tipo `Section`; si no casa, cae a 'customers'. */
function resolveInitialSection(value: string | null | undefined): Section {
  return SECTIONS.includes(value as Section) ? (value as Section) : 'customers';
}

interface B2bPageProps {
  /** S-21: sección inicial (deep-link `/b2b?section=pricelists`). Por defecto
   *  'customers'; un valor inválido también cae a 'customers'. */
  initialSection?: string | null;
}

// Clientes B2B (P1-B): lado VENTA del mayorista (clientes, tarifas de venta y
// pedidos salientes), separado de Proveedores (lado compra).
// S-21: `initialSection` permite un deep-link de descubribilidad a la subsección
// Tarifas (`pricelists`) desde el buscador / sidebar, en vez de aterrizar siempre
// en la subtab Clientes por defecto.
export function B2bPage({ initialSection }: B2bPageProps = {}) {
  const [section, setSection] = useState<Section>(() => resolveInitialSection(initialSection));
  usePageHeader('Clientes B2B', 'Clientes, tarifas de venta y pedidos salientes');
  // Las sub-pestañas (Clientes · Tarifas · Pedidos) viven en la columna izquierda de
  // la TopBar (slot pageNav), igual que Catálogo/Familias/Existencias en Inventario.
  // Reutilizan las píldoras de cristal `.inv-nav-tab` del topbar; la acción primaria de
  // cada sección (Nuevo cliente/pedido/tarifa) va al clúster derecho (pageActions).
  usePageNav(
    <nav
      className="inv-nav-tabs"
      role="tablist"
      aria-label="Sección de clientes B2B"
      data-testid="b2b-subtabs"
    >
      <button
        type="button"
        role="tab"
        className={`inv-nav-tab${section === 'customers' ? ' is-active' : ''}`}
        aria-pressed={section === 'customers'}
        onClick={() => setSection('customers')}
        data-testid="b2b-tab-customers"
      >
        Clientes
      </button>
      <button
        type="button"
        role="tab"
        className={`inv-nav-tab${section === 'pricelists' ? ' is-active' : ''}`}
        aria-pressed={section === 'pricelists'}
        onClick={() => setSection('pricelists')}
        data-testid="b2b-tab-pricelists"
      >
        Tarifas
      </button>
      <button
        type="button"
        role="tab"
        className={`inv-nav-tab${section === 'orders' ? ' is-active' : ''}`}
        aria-pressed={section === 'orders'}
        onClick={() => setSection('orders')}
        data-testid="b2b-tab-orders"
      >
        Pedidos salientes
      </button>
    </nav>,
  );
  return (
    <section className="catalog b2b-page" data-testid="b2b-page">
      {section === 'customers' && <CustomersSection />}
      {section === 'pricelists' && <PriceListsSection />}
      {section === 'orders' && <OrdersSection />}
    </section>
  );
}
