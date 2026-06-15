import { usePageHeader } from '@simpletpv/ui';

import { TransfersSection } from './stock/TransfersSection.js';

// Traspasos entre tiendas: apartado propio del sidebar, separado de Stock.
export function TransfersPage() {
  usePageHeader('Traspasos', 'Movimientos de stock entre tiendas');

  return (
    <section className="catalog" data-testid="transfers-page">
      <TransfersSection />
    </section>
  );
}
