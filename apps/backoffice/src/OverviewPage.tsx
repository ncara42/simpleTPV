import { useEffect, useRef } from 'react';

import { DashboardPage } from './DashboardPage.js';
import { usePageHeader } from './lib/pageHeader.js';
import { SalesHistoryPage } from './SalesHistoryPage.js';

// Vista unificada (IT-19 informe §7): el Dashboard arriba y, al bajar, el historial
// de Ventas. Compone ambas páginas SIN tocar su interior (conserva sus data-testid:
// `dashboard` y `sales-table`). La entrada "Ventas" del menú apunta aquí y hace
// scroll a la sección de ventas (scrollTo). El header del contenedor gana sobre el
// de las páginas hijas porque su efecto corre después (bottom-up).
export function OverviewPage({
  scrollTo,
  initialStoreId,
  onNavigate,
}: {
  scrollTo?: 'sales' | null;
  initialStoreId?: string | null;
  // Links de los paneles del dashboard a su page de gestión (I-16).
  onNavigate?: (tab: 'suppliers' | 'stock') => void;
}) {
  usePageHeader('Resumen', 'Dashboard y ventas en una sola vista');
  const topRef = useRef<HTMLDivElement>(null);
  const salesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = scrollTo === 'sales' ? salesRef.current : topRef.current;
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [scrollTo]);

  return (
    <div ref={topRef} data-testid="overview-page">
      <DashboardPage onNavigate={onNavigate} />
      <div ref={salesRef} className="overview-sales" data-testid="overview-sales">
        <SalesHistoryPage initialStoreId={initialStoreId ?? null} />
      </div>
    </div>
  );
}
