import type { GenericSpec } from '../../lib/dashboard-layout.js';
import { GenericChart } from './GenericChart.js';
import { GenericComposite } from './GenericComposite.js';
import { GenericInsight } from './GenericInsight.js';
import { GenericKpi } from './GenericKpi.js';
import { GenericPanel } from './GenericPanel.js';
import { GenericTable } from './GenericTable.js';

interface GenericWidgetProps {
  spec: GenericSpec;
}

// Despacha un widget genérico al componente correcto. El DSL v2 (#204) usa `kind:'panel'` →
// GenericPanel (tiene PRIORIDAD sobre `type`, que queda en 'composite' por compat); el resto
// despacha por `spec.type`. Es el punto de entrada que usa el registry para los `gen:<uuid>`.
export function GenericWidget({ spec }: GenericWidgetProps) {
  if (spec.kind === 'panel') return <GenericPanel spec={spec} />;
  switch (spec.type) {
    case 'table':
      return <GenericTable spec={spec} />;
    case 'kpi':
      return <GenericKpi spec={spec} />;
    case 'insight':
      return <GenericInsight spec={spec} />;
    case 'bar':
    case 'line':
    case 'area':
    case 'stacked':
    case 'pie':
    case 'donut':
      return <GenericChart spec={spec} />;
    case 'composite':
      return <GenericComposite spec={spec} />;
    default:
      return null;
  }
}
