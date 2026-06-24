import { Plus } from 'lucide-react';
import { useState } from 'react';

import { availableWidgetIds, useDashboardStore } from '../lib/dashboard-store.js';
import { getWidgetLabel } from '../widgets/registry.js';
import { WidgetPalette } from './WidgetPalette.js';

// Botón «+» del clúster derecho del topbar (mismo acabado que la campana) para añadir un widget al
// dashboard. Sustituye a la tira «Añadir widget» que vivía DENTRO del modo cuadrícula. Auto-contenido
// como DashboardModeToggle: lee el catálogo disponible y el alta directamente del store, y sirve para
// ambos modos (el alta escribe en el lienzo libre, fuente común de cuadrícula y lienzo).
export function DashboardAddWidget() {
  const [open, setOpen] = useState(false);
  const layout = useDashboardStore((s) => s.layout);
  const addWidget = useDashboardStore((s) => s.addWidget);
  const available = availableWidgetIds(layout);

  return (
    <>
      <button
        type="button"
        className={`topbar-icon-btn${open ? ' is-active' : ''}`}
        onClick={() => setOpen(true)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Añadir widget"
        title="Añadir widget"
        data-testid="topbar-add-widget"
      >
        <Plus size={18} aria-hidden="true" />
      </button>
      {open && (
        <WidgetPalette
          variant="topbar"
          items={available}
          label={getWidgetLabel}
          onPick={(id) => {
            addWidget(id);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
