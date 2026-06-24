import { Frame, LayoutGrid } from 'lucide-react';

import { useDashboardStore } from '../lib/dashboard-store.js';

export type DashboardMode = 'grid' | 'free';

// Conmutador de modo del dashboard (esquina superior derecha): CUADRÍCULA (bloques en rejilla
// responsive con scroll vertical) ↔ LIENZO LIBRE (colocación a píxel, dibujo). Ambos modos comparten
// el mismo conjunto de widgets; este toggle solo cambia cómo se disponen y persiste en `layout.mode`.
//
// Se renderiza en el SHELL (App.tsx), no dentro de `.dashboard--free`: ahí su z-index quedaría
// atrapado bajo el clúster de búsqueda full-width de la topbar (que crea su propio contexto de
// apilado). A nivel de shell compite con la barra del lienzo (z-index alto) y queda clicable. Es
// auto-contenido: lee/escribe el modo directamente del store (visible en ambos modos).
export function DashboardModeToggle() {
  const mode: DashboardMode = useDashboardStore((s) =>
    s.layout.mode === 'grid' ? 'grid' : 'free',
  );
  const setMode = (next: DashboardMode): void => {
    const s = useDashboardStore.getState();
    s.setLayout({ ...s.layout, mode: next });
  };

  return (
    <div
      className="dashboard-mode-toggle"
      role="group"
      aria-label="Modo del dashboard"
      data-testid="dashboard-mode-toggle"
    >
      <button
        type="button"
        className={`dashboard-mode-btn${mode === 'grid' ? ' is-active' : ''}`}
        data-testid="dashboard-mode-grid"
        aria-pressed={mode === 'grid'}
        aria-label="Cuadrícula"
        title="Cuadrícula · los bloques se ordenan en rejilla"
        onClick={() => setMode('grid')}
      >
        <LayoutGrid size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={`dashboard-mode-btn${mode === 'free' ? ' is-active' : ''}`}
        data-testid="dashboard-mode-free"
        aria-pressed={mode === 'free'}
        aria-label="Lienzo libre"
        title="Lienzo libre · coloca y dibuja a mano"
        onClick={() => setMode('free')}
      >
        <Frame size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
