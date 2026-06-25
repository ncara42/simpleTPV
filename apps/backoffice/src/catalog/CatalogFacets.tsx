import type { Rotation } from '@simpletpv/auth';
import { Input } from '@simpletpv/ui';

import {
  ALL_ROTATIONS,
  ALL_STATES,
  type CatalogFilters,
  type FacetCounts,
  type SavedView,
  type StockState,
} from './facets.js';

// Carril de facetas del Catálogo: búsqueda + vistas guardadas + familia + estado de
// stock + rotación. Componente presentacional puro: recibe recuentos, la selección
// actual y los manejadores; no calcula nada.

const VIEW_LABELS: Record<SavedView, string> = {
  all: 'Todo el catálogo',
  low: 'Bajo mínimo',
  out: 'Sin stock',
  lowMargin: 'Margen < 50%',
};
const VIEW_ORDER: readonly SavedView[] = ['all', 'low', 'out', 'lowMargin'];

const STATE_LABELS: Record<StockState, string> = {
  ok: 'En stock',
  low: 'Stock bajo',
  out: 'Sin stock',
};
const STATE_COLORS: Record<StockState, string> = {
  ok: 'var(--ui-success)',
  low: 'var(--ui-warning)',
  out: 'var(--ui-danger)',
};
const ROTATION_LABELS: Record<Rotation, string> = { alta: 'Alta', media: 'Media', baja: 'Baja' };

interface CatalogFacetsProps {
  facets: FacetCounts;
  filters: CatalogFilters;
  onView: (view: SavedView) => void;
  onToggleFamily: (familyId: string) => void;
  onToggleState: (state: StockState) => void;
  onToggleRotation: (rotation: Rotation) => void;
  search: string;
  onSearchChange: (value: string) => void;
}

export function CatalogFacets({
  facets,
  filters,
  onView,
  onToggleFamily,
  onToggleState,
  onToggleRotation,
  search,
  onSearchChange,
}: CatalogFacetsProps) {
  return (
    <aside className="cat-rail" aria-label="Filtros del catálogo" data-testid="catalog-facets">
      <span className="search-field cat-rail-search">
        <Input
          className="catalog-search"
          placeholder="Buscar producto…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          data-testid="inventory-search"
        />
      </span>

      <section className="cat-facet">
        <h3 className="cat-facet-title">Vistas guardadas</h3>
        {VIEW_ORDER.map((view) => (
          <button
            key={view}
            type="button"
            className={`cat-view${filters.view === view ? ' is-active' : ''}`}
            aria-pressed={filters.view === view}
            onClick={() => onView(view)}
            data-testid={`catalog-view-${view}`}
          >
            <span className="cat-view-label">{VIEW_LABELS[view]}</span>
            <span className="cat-view-count">{facets.views[view]}</span>
          </button>
        ))}
      </section>

      {facets.families.length > 0 && (
        <section className="cat-facet">
          <h3 className="cat-facet-title">Familia</h3>
          {facets.families.map(({ family, count }) => (
            <FacetOption
              key={family.id}
              checked={filters.families.has(family.id)}
              onToggle={() => onToggleFamily(family.id)}
              label={family.name}
              labelColor={family.color ?? undefined}
              count={count}
            />
          ))}
        </section>
      )}

      <section className="cat-facet">
        <h3 className="cat-facet-title">Estado de stock</h3>
        {ALL_STATES.map((state) => (
          <FacetOption
            key={state}
            checked={filters.states.has(state)}
            onToggle={() => onToggleState(state)}
            label={STATE_LABELS[state]}
            labelColor={STATE_COLORS[state]}
            count={facets.states[state]}
          />
        ))}
      </section>

      <section className="cat-facet">
        <h3 className="cat-facet-title">Rotación</h3>
        {ALL_ROTATIONS.map((rotation) => (
          <FacetOption
            key={rotation}
            checked={filters.rotations.has(rotation)}
            onToggle={() => onToggleRotation(rotation)}
            label={ROTATION_LABELS[rotation]}
            count={facets.rotations[rotation]}
          />
        ))}
      </section>
    </aside>
  );
}

interface FacetOptionProps {
  checked: boolean;
  onToggle: () => void;
  label: string;
  labelColor?: string;
  count: number;
}

function FacetOption({ checked, onToggle, label, labelColor, count }: FacetOptionProps) {
  return (
    <label className={`cat-facet-opt${checked ? ' is-checked' : ''}`}>
      <input type="checkbox" className="cat-facet-input" checked={checked} onChange={onToggle} />
      <span className="cat-check" aria-hidden="true" />
      <span
        className="cat-facet-label"
        style={labelColor ? { color: labelColor, fontWeight: 550 } : undefined}
      >
        {label}
      </span>
      <span className="cat-facet-count">{count}</span>
    </label>
  );
}
