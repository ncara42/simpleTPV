import { usePageHeader } from '@simpletpv/ui';
import { useState } from 'react';

import { CustomersSection } from './b2b/CustomersSection.js';
import { OrdersSection } from './b2b/OrdersSection.js';
import { PriceListsSection } from './b2b/PriceListsSection.js';

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
  // Las pestañas viven DENTRO de la card de la sección activa (como cabecera del
  // panel), no flotando sobre el lienzo: cada sección las pinta como primer hijo
  // de su `.table-panel`. El estado sigue aquí; solo se delega el render.
  const tabs = (
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
  );
  return (
    <section className="catalog b2b-page" data-testid="b2b-page">
      {section === 'customers' && <CustomersSection tabs={tabs} />}
      {section === 'pricelists' && <PriceListsSection tabs={tabs} />}
      {section === 'orders' && <OrdersSection tabs={tabs} />}
    </section>
  );
}
