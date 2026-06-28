import { Input } from '@simpletpv/ui';
import { X } from 'lucide-react';

import { ScrollShadowCell } from '../components/ScrollShadowCell.js';
import { type FacetDragSelect, useFacetDragSelect } from '../hooks/use-facet-drag-select.js';
import {
  type StoreFacet,
  TRANSFER_VIEWS,
  type TransferView,
  VIEW_LABELS,
} from './transfer-view.js';

// Carril de facetas de Traspasos: búsqueda + vistas guardadas (estados) + origen +
// destino. Reutiliza el lenguaje visual del carril del Catálogo/Existencias (clases
// `.cat-*`). Origen y destino son de selección múltiple (casillas, drag-select):
// sin ninguna marcada = todas. Componente presentacional puro.

interface TransferFacetsProps {
  search: string;
  onSearchChange: (value: string) => void;
  viewCounts: Record<TransferView, number>;
  view: TransferView;
  onView: (view: TransferView) => void;
  origins: ReadonlySet<string>;
  dests: ReadonlySet<string>;
  originFacets: StoreFacet[];
  destFacets: StoreFacet[];
  onToggleOrigin: (storeId: string) => void;
  onToggleDest: (storeId: string) => void;
  showClear: boolean;
  onClear: () => void;
}

export function TransferFacets({
  search,
  onSearchChange,
  viewCounts,
  view,
  onView,
  origins,
  dests,
  originFacets,
  destFacets,
  onToggleOrigin,
  onToggleDest,
  showClear,
  onClear,
}: TransferFacetsProps) {
  const drag = useFacetDragSelect();
  return (
    <ScrollShadowCell
      as="aside"
      className="cat-rail"
      aria-label="Filtros de traspasos"
      data-testid="transfers-facets"
    >
      <span className="search-field cat-rail-search">
        <Input
          className="catalog-search"
          placeholder="Buscar traspaso…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Buscar traspaso"
          data-testid="transfers-search"
        />
      </span>

      <section className="cat-facet">
        <h3 className="cat-facet-title">Vistas guardadas</h3>
        {TRANSFER_VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            className={`cat-view${view === v ? ' is-active' : ''}`}
            aria-pressed={view === v}
            onClick={() => onView(v)}
            data-testid={`transfers-view-${v}`}
          >
            <span className="cat-view-label">{VIEW_LABELS[v]}</span>
            <span className="cat-view-count">{viewCounts[v]}</span>
          </button>
        ))}
      </section>

      {originFacets.length > 0 && (
        <section className="cat-facet">
          <h3 className="cat-facet-title">Origen</h3>
          {originFacets.map((facet) => (
            <FacetOption
              key={facet.id}
              checked={origins.has(facet.id)}
              onToggle={() => onToggleOrigin(facet.id)}
              label={facet.label}
              count={facet.count}
              testId="transfers-origin"
              drag={drag}
            />
          ))}
        </section>
      )}

      {destFacets.length > 0 && (
        <section className="cat-facet">
          <h3 className="cat-facet-title">Destino</h3>
          {destFacets.map((facet) => (
            <FacetOption
              key={facet.id}
              checked={dests.has(facet.id)}
              onToggle={() => onToggleDest(facet.id)}
              label={facet.label}
              count={facet.count}
              testId="transfers-dest"
              drag={drag}
            />
          ))}
        </section>
      )}

      {showClear && (
        <button type="button" className="tr-clear" onClick={onClear} data-testid="transfers-clear">
          <X size={13} aria-hidden="true" />
          Limpiar filtros
        </button>
      )}
    </ScrollShadowCell>
  );
}

interface FacetOptionProps {
  checked: boolean;
  onToggle: () => void;
  label: string;
  count: number;
  testId: string;
  drag: FacetDragSelect;
}

function FacetOption({ checked, onToggle, label, count, testId, drag }: FacetOptionProps) {
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
      <span className="cat-facet-label">{label}</span>
      <span className="cat-facet-count">{count}</span>
    </label>
  );
}
