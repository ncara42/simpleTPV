import { Check, Search, X } from 'lucide-react';

import type {
  LeadKey,
  SavedView,
  StatusKey,
  SupplierFacetCounts,
  SupplierFilters,
} from './suppliers-view.js';

// Carril de facetas de Proveedores: búsqueda + vistas guardadas + estado + lead time.
// Componente presentacional puro (espejo de CatalogFacets): recibe recuentos, la
// selección actual y los manejadores; no calcula nada.

const VIEW_ORDER: readonly SavedView[] = ['all', 'open', 'noOrders', 'inactive'];
const VIEW_LABELS: Record<SavedView, string> = {
  all: 'Todos los proveedores',
  open: 'Con pedidos abiertos',
  noOrders: 'Sin pedidos',
  inactive: 'Inactivos',
};

const STATUS_ORDER: readonly StatusKey[] = ['active', 'inactive'];
const STATUS_LABELS: Record<StatusKey, string> = { active: 'Activo', inactive: 'Inactivo' };

const LEAD_ORDER: readonly LeadKey[] = ['fast', 'mid', 'slow'];
const LEAD_LABELS: Record<LeadKey, string> = {
  fast: 'Rápido · ≤ 3 días',
  mid: 'Medio · 4–7 días',
  slow: 'Lento · > 7 días',
};

interface SupplierFacetsProps {
  search: string;
  onSearchChange: (value: string) => void;
  filters: SupplierFilters;
  facets: SupplierFacetCounts;
  onView: (view: SavedView) => void;
  onToggleStatus: (status: StatusKey) => void;
  onToggleLead: (lead: LeadKey) => void;
  activeFilterCount: number;
  onClear: () => void;
}

export function SupplierFacets({
  search,
  onSearchChange,
  filters,
  facets,
  onView,
  onToggleStatus,
  onToggleLead,
  activeFilterCount,
  onClear,
}: SupplierFacetsProps) {
  return (
    <aside className="sup-rail" aria-label="Filtros de proveedores" data-testid="supplier-facets">
      <span className="sup-rail-search">
        <Search size={17} aria-hidden="true" />
        <input
          className="sup-rail-input"
          placeholder="Buscar proveedor…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          data-testid="supplier-search"
        />
      </span>

      <section className="sup-facet">
        <h3 className="sup-facet-title">Vistas guardadas</h3>
        {VIEW_ORDER.map((view) => (
          <button
            key={view}
            type="button"
            className={`sup-view${filters.view === view ? ' is-active' : ''}`}
            aria-pressed={filters.view === view}
            onClick={() => onView(view)}
            data-testid={`supplier-view-${view}`}
          >
            <span className="sup-view-label">{VIEW_LABELS[view]}</span>
            <span className="sup-view-count">{facets.views[view]}</span>
          </button>
        ))}
      </section>

      <section className="sup-facet">
        <h3 className="sup-facet-title">Estado</h3>
        {STATUS_ORDER.map((status) => (
          <FacetOption
            key={status}
            checked={filters.status.has(status)}
            onToggle={() => onToggleStatus(status)}
            label={STATUS_LABELS[status]}
            count={facets.status[status]}
          />
        ))}
      </section>

      <section className="sup-facet">
        <h3 className="sup-facet-title">Lead time</h3>
        {LEAD_ORDER.map((lead) => (
          <FacetOption
            key={lead}
            checked={filters.lead.has(lead)}
            onToggle={() => onToggleLead(lead)}
            label={LEAD_LABELS[lead]}
            count={facets.lead[lead]}
          />
        ))}
      </section>

      {activeFilterCount > 0 && (
        <button type="button" className="sup-clear" onClick={onClear} data-testid="supplier-clear">
          <X size={13} aria-hidden="true" />
          Limpiar filtros · {activeFilterCount}
        </button>
      )}
    </aside>
  );
}

interface FacetOptionProps {
  checked: boolean;
  onToggle: () => void;
  label: string;
  count: number;
}

function FacetOption({ checked, onToggle, label, count }: FacetOptionProps) {
  return (
    <button
      type="button"
      className={`sup-facet-opt${checked ? ' is-checked' : ''}`}
      aria-pressed={checked}
      onClick={onToggle}
    >
      <span className="sup-check" aria-hidden="true">
        {checked && <Check size={14} strokeWidth={3} />}
      </span>
      <span className="sup-facet-label">{label}</span>
      <span className="sup-facet-count">{count}</span>
    </button>
  );
}
