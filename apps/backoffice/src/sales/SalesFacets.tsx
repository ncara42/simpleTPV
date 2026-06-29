import { Input } from '@simpletpv/ui';
import { X } from 'lucide-react';

import { ScrollShadowCell } from '../components/ScrollShadowCell.js';
import { useFacetDragSelect } from '../hooks/use-facet-drag-select.js';
import type {
  FacetGroup,
  FacetKey,
  SalesFacetState,
  SavedView,
  SavedViewId,
} from './sales-facets.js';

// Carril de facetas del ledger de Ventas: búsqueda + vistas guardadas (estado de
// cobro) + facetas multi-selección (Estado de cobro · Canal · Tienda · Vendedor ·
// Método de pago). Reutiliza el lenguaje visual del carril del Catálogo (`.cat-*`)
// y añade el punto de color de cobro/canal. Componente presentacional puro.

interface SalesFacetsProps {
  search: string;
  onSearchChange: (value: string) => void;
  savedViews: SavedView[];
  view: SavedViewId;
  onView: (view: SavedViewId) => void;
  facetGroups: FacetGroup[];
  facets: SalesFacetState;
  onToggleFacet: (key: FacetKey, optKey: string) => void;
  showClear: boolean;
  onClear: () => void;
}

export function SalesFacets({
  search,
  onSearchChange,
  savedViews,
  view,
  onView,
  facetGroups,
  facets,
  onToggleFacet,
  showClear,
  onClear,
}: SalesFacetsProps) {
  const drag = useFacetDragSelect();
  return (
    // `ScrollShadowCell` envuelve el carril (`.cat-rail` scrollea dentro) y le añade la
    // sombra de scroll inferior + el centinela de fin.
    <ScrollShadowCell
      as="aside"
      className="cat-rail"
      aria-label="Filtros de ventas"
      data-testid="sales-facets"
    >
      <span className="search-field cat-rail-search">
        <Input
          className="catalog-search"
          placeholder="Buscar ticket o cliente…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          data-testid="sales-search"
        />
      </span>

      <section className="cat-facet">
        <h3 className="cat-facet-title">Vistas guardadas</h3>
        {savedViews.map((v) => (
          <button
            key={v.id}
            type="button"
            className={`cat-view${view === v.id ? ' is-active' : ''}`}
            aria-pressed={view === v.id}
            onClick={() => onView(v.id)}
            data-testid={`sales-view-${v.id}`}
          >
            <span className="cat-view-label">{v.label}</span>
            <span className="cat-view-count">{v.count}</span>
          </button>
        ))}
      </section>

      {facetGroups.map((group) => (
        <section className="cat-facet" key={group.key}>
          <h3 className="cat-facet-title">{group.title}</h3>
          {group.options.map((opt) => {
            const checked = (facets[group.key] as ReadonlySet<string>).has(opt.key);
            const toggle = () => onToggleFacet(group.key, opt.key);
            return (
              <label
                key={opt.key}
                className={`cat-facet-opt${checked ? ' is-checked' : ''}`}
                data-testid={`sales-facet-${group.key}`}
                onMouseDown={() => drag.onItemMouseDown(checked, toggle)}
                onMouseEnter={() => drag.onItemMouseEnter(checked, toggle)}
              >
                <input
                  type="checkbox"
                  className="cat-facet-input"
                  checked={checked}
                  onChange={toggle}
                  onClick={drag.onItemClick}
                />
                <span className="cat-check" aria-hidden="true" />
                <span className="cat-facet-label">{opt.label}</span>
                <span className="cat-facet-count">{opt.count}</span>
              </label>
            );
          })}
        </section>
      ))}

      {showClear && (
        <button type="button" className="ventas-clear" onClick={onClear} data-testid="sales-clear">
          <X size={13} aria-hidden="true" />
          Limpiar filtros
        </button>
      )}
    </ScrollShadowCell>
  );
}
