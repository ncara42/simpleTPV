import { Input } from '@simpletpv/ui';
import { X } from 'lucide-react';

import { ScrollShadowCell } from '../components/ScrollShadowCell.js';
import { useFacetDragSelect } from '../hooks/use-facet-drag-select.js';
import type { SavedViewId } from './pricelist-facets.js';

// Carril de facetas de Tarifas B2B: búsqueda + vistas guardadas + facetas
// (Estado · Tipo · Asignación). Espejo de `CustomerFacets`: reutiliza el lenguaje
// visual del carril del Catálogo/Ventas (`.cat-*`). Presentacional puro; el
// contenedor decide la semántica single/multi de cada grupo.
//
// La observación del handoff («el buscador vive en la columna de filtros, no en la
// del medio») se materializa aquí: el `Input` de búsqueda encabeza el carril.

export interface FacetOption {
  key: string;
  label: string;
  count: number;
  active: boolean;
}

export interface FacetGroupView {
  key: string;
  title: string;
  options: FacetOption[];
}

interface SavedView {
  id: SavedViewId;
  label: string;
  count: number;
  active: boolean;
}

interface PriceListFacetsProps {
  search: string;
  onSearchChange: (value: string) => void;
  savedViews: SavedView[];
  onSavedView: (id: SavedViewId) => void;
  groups: FacetGroupView[];
  onToggleFacet: (groupKey: string, optKey: string) => void;
  showClear: boolean;
  clearCount: number;
  onClear: () => void;
}

export function PriceListFacets({
  search,
  onSearchChange,
  savedViews,
  onSavedView,
  groups,
  onToggleFacet,
  showClear,
  clearCount,
  onClear,
}: PriceListFacetsProps) {
  const drag = useFacetDragSelect();
  return (
    <ScrollShadowCell
      as="aside"
      className="cat-rail"
      aria-label="Filtros de tarifas"
      data-testid="b2b-pricelist-facets"
    >
      <span className="search-field cat-rail-search">
        <Input
          className="catalog-search"
          placeholder="Buscar tarifa…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          data-testid="b2b-pricelists-search"
        />
      </span>

      <section className="cat-facet">
        <h3 className="cat-facet-title">Vistas guardadas</h3>
        {savedViews.map((v) => (
          <button
            key={v.id}
            type="button"
            className={`cat-view${v.active ? ' is-active' : ''}`}
            aria-pressed={v.active}
            onClick={() => onSavedView(v.id)}
            data-testid={`b2b-pricelist-view-${v.id}`}
          >
            <span className="cat-view-label">{v.label}</span>
            <span className="cat-view-count">{v.count}</span>
          </button>
        ))}
      </section>

      {groups.map((group) => (
        <section className="cat-facet" key={group.key}>
          <h3 className="cat-facet-title">{group.title}</h3>
          {group.options.map((opt) => {
            const toggle = () => onToggleFacet(group.key, opt.key);
            return (
              <label
                key={opt.key}
                className={`cat-facet-opt${opt.active ? ' is-checked' : ''}`}
                data-testid={`b2b-pricelist-facet-${group.key}`}
                onMouseDown={() => drag.onItemMouseDown(opt.active, toggle)}
                onMouseEnter={() => drag.onItemMouseEnter(opt.active, toggle)}
              >
                <input
                  type="checkbox"
                  className="cat-facet-input"
                  checked={opt.active}
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
        <button
          type="button"
          className="ventas-clear"
          onClick={onClear}
          data-testid="b2b-pricelist-clear"
        >
          <X size={13} aria-hidden="true" />
          Limpiar filtros · {clearCount}
        </button>
      )}
    </ScrollShadowCell>
  );
}
