import type { Rotation, Store } from '@simpletpv/auth';
import { Input } from '@simpletpv/ui';

import { type FacetDragSelect, useFacetDragSelect } from '../hooks/use-facet-drag-select.js';
import {
  ALL_ROTATIONS,
  EX_VIEWS,
  type ExFacetCounts,
  type ExFilters,
  type ExView,
  familyColorVar,
  ROTATION_LABELS,
  type Scope,
  VIEW_LABELS,
} from './existences.js';

// Carril de facetas de Existencias: búsqueda + vistas guardadas + tienda (ámbito) +
// familia + rotación. Reutiliza el lenguaje visual del carril del Catálogo (clases
// `.cat-*`). La sección Tienda es de selección múltiple (casillas, como Familia/Rotación):
// sin ninguna marcada = todas las tiendas; varias = stock sumado de las elegidas.
// Componente presentacional puro: recibe recuentos y manejadores.

interface ExistencesFacetsProps {
  search: string;
  onSearchChange: (value: string) => void;
  facets: ExFacetCounts;
  filters: ExFilters;
  scope: Scope;
  stores: Store[];
  onView: (view: ExView) => void;
  onToggleStore: (storeId: string) => void;
  onToggleFamily: (familyId: string) => void;
  onToggleRotation: (rotation: Rotation) => void;
}

export function ExistencesFacets({
  search,
  onSearchChange,
  facets,
  filters,
  scope,
  stores,
  onView,
  onToggleStore,
  onToggleFamily,
  onToggleRotation,
}: ExistencesFacetsProps) {
  const drag = useFacetDragSelect();
  return (
    <aside className="cat-rail" aria-label="Filtros de existencias" data-testid="existences-facets">
      <span className="search-field cat-rail-search">
        <Input
          className="catalog-search"
          placeholder="Buscar producto…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          data-testid="existences-search"
        />
      </span>

      <section className="cat-facet">
        <h3 className="cat-facet-title">Vistas guardadas</h3>
        {EX_VIEWS.map((view) => (
          <button
            key={view}
            type="button"
            className={`cat-view${filters.view === view ? ' is-active' : ''}`}
            aria-pressed={filters.view === view}
            onClick={() => onView(view)}
            data-testid={`existences-view-${view}`}
          >
            <span className="cat-view-label">{VIEW_LABELS[view]}</span>
            <span className="cat-view-count">{facets.views[view]}</span>
          </button>
        ))}
      </section>

      <section className="cat-facet">
        <h3 className="cat-facet-title">Tienda</h3>
        {stores.map((store) => (
          <FacetOption
            key={store.id}
            checked={scope.has(store.id)}
            onToggle={() => onToggleStore(store.id)}
            label={store.name}
            testId="existences-store"
            drag={drag}
          />
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
              color={familyColorVar(family.id)}
              count={count}
              drag={drag}
            />
          ))}
        </section>
      )}

      <section className="cat-facet">
        <h3 className="cat-facet-title">Rotación</h3>
        {ALL_ROTATIONS.map((rotation) => (
          <FacetOption
            key={rotation}
            checked={filters.rotations.has(rotation)}
            onToggle={() => onToggleRotation(rotation)}
            label={ROTATION_LABELS[rotation]}
            count={facets.rotations[rotation]}
            testId={`stock-rotation-${rotation}`}
            drag={drag}
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
  color?: string;
  count?: number;
  testId?: string;
  drag: FacetDragSelect;
}

function FacetOption({ checked, onToggle, label, color, count, testId, drag }: FacetOptionProps) {
  return (
    <label
      className={`cat-facet-opt${checked ? ' is-checked' : ''}`}
      data-testid={testId}
      onMouseDown={() => drag.onItemMouseDown(checked, onToggle)}
      onMouseEnter={() => drag.onItemMouseEnter(checked, onToggle)}
    >
      <input
        type="checkbox"
        className="cat-facet-input"
        checked={checked}
        onChange={onToggle}
        onClick={drag.onItemClick}
      />
      <span className="cat-check" aria-hidden="true" />
      <span className="cat-facet-label" style={color ? { color } : undefined}>
        {label}
      </span>
      {count !== undefined && <span className="cat-facet-count">{count}</span>}
    </label>
  );
}
