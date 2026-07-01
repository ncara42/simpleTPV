import { usePageHeader } from '@simpletpv/ui';

import { useTableShellHeight } from './lib/useTableShellHeight.js';
import { TransfersSection } from './stock/TransfersSection.js';

// Traspasos entre tiendas: apartado propio del sidebar, separado de Stock.
export function TransfersPage() {
  usePageHeader('Traspasos', 'Movimientos de stock entre tiendas');
  const shellHeight = useTableShellHeight();

  return (
    <section
      className="transfers-page"
      data-testid="transfers-page"
      style={{ height: shellHeight }}
    >
      <TransfersSection />
    </section>
  );
}
