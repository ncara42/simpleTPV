import { Input } from '@simpletpv/ui';
import { X } from 'lucide-react';

import { ScrollShadowCell } from '../components/ScrollShadowCell.js';
import { useFacetDragSelect } from '../hooks/use-facet-drag-select.js';

// Carril de facetas de Pedidos salientes B2B: búsqueda + facetas (Estado · Periodo ·
// Tarifa). Espejo de `CustomerFacets`/`PriceListFacets`: reutiliza el lenguaje visual
// del carril del Catálogo/Ventas (`.cat-*`). Presentacional puro; el contenedor decide
// la semántica single/multi de cada grupo.
//
// Override del handoff: el buscador, que en la maqueta vivía en la columna del medio,
// pasa aquí (a la columna de filtros) como en el resto de vistas — encabezando el carril.

export interface FacetOption {
  key: string;
  label: string;
  count: number;
  active: boolean;
  /** Tono del punto de color a la izquierda (solo en la faceta Estado). */
  tone?: string;
}

export interface FacetGroupView {
  key: string;
  title: string;
  options: FacetOption[];
}

interface OrderFacetsProps {
  search: string;
  onSearchChange: (value: string) => void;
  groups: FacetGroupView[];
  onToggleFacet: (groupKey: string, optKey: string) => void;
  showClear: boolean;
  clearCount: number;
  onClear: () => void;
}

export function OrderFacets({
  search,
  onSearchChange,
  groups,
  onToggleFacet,
  showClear,
  clearCount,
  onClear,
}: OrderFacetsProps) {
  const drag = useFacetDragSelect();
  return (
    <ScrollShadowCell
      as="aside"
      className="cat-rail"
      aria-label="Filtros de pedidos"
      data-testid="b2b-order-facets"
    >
      <span className="search-field cat-rail-search">
        <Input
          className="catalog-search"
          placeholder="Buscar pedido o cliente…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          data-testid="b2b-orders-search"
        />
      </span>

      {groups.map((group) => (
        <section className="cat-facet" key={group.key}>
          <h3 className="cat-facet-title">{group.title}</h3>
          {group.options.map((opt) => {
            const toggle = () => onToggleFacet(group.key, opt.key);
            return (
              <label
                key={opt.key}
                className={`cat-facet-opt${opt.active ? ' is-checked' : ''}`}
                data-testid={`b2b-order-facet-${group.key}`}
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
                {opt.tone && (
                  <span className="ped-facet-dot" data-status={opt.tone} aria-hidden="true" />
                )}
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
          data-testid="b2b-order-clear"
        >
          <X size={13} aria-hidden="true" />
          Limpiar filtros · {clearCount}
        </button>
      )}
    </ScrollShadowCell>
  );
}
