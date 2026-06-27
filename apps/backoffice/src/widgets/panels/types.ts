import type { DashboardPeriod } from '../../lib/dashboard.js';

// Props comunes de todo widget de panel del rediseño: el periodo activo del dashboard y la tienda
// seleccionada (undefined = todas). Cada widget consulta SUS datos al montarse (solo se monta cuando
// está en el lienzo), reutilizando las mismas queryKeys que DashboardPage para compartir caché.
export interface PanelProps {
  period: DashboardPeriod;
  store?: string | undefined;
}
