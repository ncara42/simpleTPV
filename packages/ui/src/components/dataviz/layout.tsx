import type { ReactNode } from 'react';

import { cn } from '../../lib/cn.js';
import { SectionHeader } from './atoms.js';

// Componentes de LAYOUT del DSL v2 (#204): contenedores cuyo grid-template deriva de ENUMS
// (recipe/columns/density), no de px/span del agente. El diseño se garantiza por construcción.

// Contenedor de panel a medida: cabecera opcional + región de slots. Reemplaza el wrapper
// .generic-composite. La densidad ajusta el gutter/padding (compacto vs cómodo).
export interface PanelShellProps {
  title?: string;
  density?: 'compact' | 'comfortable';
  children: ReactNode;
}
export function PanelShell({ title, density = 'comfortable', children }: PanelShellProps) {
  return (
    <section className={cn('dv-panel', `dv-panel--${density}`)}>
      {title ? <SectionHeader title={title} /> : null}
      <div className="dv-panel-body">{children}</div>
    </section>
  );
}

// Fila de 1-4 KPIs con wrap responsive. Las columnas salen del ENUM, no de span. Cada hijo es un
// KpiTile (o su wrapper de datos).
export interface KpiRowProps {
  columns?: 1 | 2 | 3 | 4;
  children: ReactNode;
}
export function KpiRow({ columns = 3, children }: KpiRowProps) {
  return (
    <div className={cn('dv-kpi-row', `dv-kpi-row--${columns}`)} data-testid="dv-kpi-row">
      {children}
    </div>
  );
}

// Rejilla de 1-2 gráficas por fila con alturas horneadas. `emphasis='hero'` da más alto a la
// primera (para heroChart+sideStats). Columnas del ENUM, no de span/gap.
export interface ChartGridProps {
  columns?: 1 | 2;
  emphasis?: 'hero' | 'normal';
  children: ReactNode;
}
export function ChartGrid({ columns = 1, emphasis = 'normal', children }: ChartGridProps) {
  return (
    <div
      className={cn(
        'dv-chart-grid',
        `dv-chart-grid--${columns}`,
        emphasis === 'hero' && 'dv-chart-grid--hero',
      )}
      data-testid="dv-chart-grid"
    >
      {children}
    </div>
  );
}
