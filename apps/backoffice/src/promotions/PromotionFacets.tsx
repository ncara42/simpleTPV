import { Input } from '@simpletpv/ui';
import { X } from 'lucide-react';

import { ScrollShadowCell } from '../components/ScrollShadowCell.js';
import { useFacetDragSelect } from '../hooks/use-facet-drag-select.js';
import type { PromoFacetGroupKey, PromoSavedViewId } from './promo-facets.js';

// Carril de facetas de Promociones: búsqueda + vistas guardadas + facetas
// (Estado · Condición · Descuento). Reutiliza el lenguaje visual del carril del
// Catálogo/Ventas/Clientes (`.cat-*`). Presentacional puro: el contenedor decide la
// semántica multi de cada grupo y los recuentos.

export interface PromoFacetOption {
  key: string;
  label: string;
  count: number;
  active: boolean;
}

export interface PromoFacetGroupView {
  key: PromoFacetGroupKey;
  title: string;
  options: PromoFacetOption[];
}

interface SavedView {
  id: PromoSavedViewId;
  label: string;
  count: number;
  active: boolean;
}

interface PromotionFacetsProps {
  search: string;
  onSearchChange: (value: string) => void;
  savedViews: SavedView[];
  onSavedView: (id: PromoSavedViewId) => void;
  groups: PromoFacetGroupView[];
  onToggleFacet: (groupKey: PromoFacetGroupKey, optKey: string) => void;
  showClear: boolean;
  clearCount: number;
  onClear: () => void;
}

export function PromotionFacets({
  search,
  onSearchChange,
  savedViews,
  onSavedView,
  groups,
  onToggleFacet,
  showClear,
  clearCount,
  onClear,
}: PromotionFacetsProps) {
  const drag = useFacetDragSelect();
  return (
    <ScrollShadowCell
      as="aside"
      className="cat-rail"
      aria-label="Filtros de promociones"
      data-testid="promo-facets"
    >
      <span className="search-field cat-rail-search">
        <Input
          className="catalog-search"
          placeholder="Buscar promoción…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          data-testid="promo-search"
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
            data-testid={`promo-view-${v.id}`}
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
                data-testid={`promo-facet-${group.key}`}
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
        <button type="button" className="ventas-clear" onClick={onClear} data-testid="promo-clear">
          <X size={13} aria-hidden="true" />
          Limpiar filtros · {clearCount}
        </button>
      )}
    </ScrollShadowCell>
  );
}
