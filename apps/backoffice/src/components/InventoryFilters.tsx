import { Input, Select } from '@simpletpv/ui';

import type { FamilyNode } from '../lib/families.js';
import { flattenTree } from '../lib/family-tree.js';

// S-02 fase B — Filtro COMPARTIDO de Inventario. Una sola caja de búsqueda de
// texto + un selector jerárquico de familia que valen para las tres vistas
// (Catálogo · Familias · Existencias). Sustituye a las cajas de búsqueda propias
// que cada página tenía por separado: el valor vive en URL-state (?q= y ?family=)
// en `InventoryPage` y baja a cada vista como prop CONTROLADA.
//
// El selector de familia se construye con `flattenTree` (sangría por profundidad),
// igual que el selector de arquetipos del Catálogo, para que cualquier nodo del
// árbol —raíz, subfamilia o arquetipo— sea elegible y filtre incluyendo su subárbol.

// Placeholder con los SINÓNIMOS de búsqueda (S-19): el backend ya busca por nombre,
// SKU y código de barras; "referencia"/"existencias" se exponen como términos
// reconocibles para el usuario aunque el campo subyacente sea el mismo `search`.
const SEARCH_PLACEHOLDER = 'Buscar por nombre, SKU, referencia o existencias';

export interface InventoryFiltersProps {
  /** Árbol de familias para poblar el selector jerárquico. */
  families: FamilyNode[];
  /** Texto de búsqueda (controlado). */
  search: string;
  onSearchChange: (value: string) => void;
  /** Id de la familia/arquetipo seleccionada, o '' para «todos» (controlado). */
  familyId: string;
  onFamilyChange: (value: string) => void;
}

export function InventoryFilters({
  families,
  search,
  onSearchChange,
  familyId,
  onFamilyChange,
}: InventoryFiltersProps) {
  const familyOptions = flattenTree(families).map((f) => ({
    value: f.node.id,
    label: `${'– '.repeat(f.depth)}${f.node.name}`,
  }));

  return (
    <div className="inventory-filters sales-filters" data-testid="inventory-filters">
      <span className="search-field">
        <Input
          className="catalog-search"
          placeholder={SEARCH_PLACEHOLDER}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          data-testid="inventory-search"
        />
      </span>
      <Select
        className="catalog-search"
        value={familyId}
        onChange={onFamilyChange}
        ariaLabel="Filtrar por familia"
        data-testid="inventory-family"
        options={[{ value: '', label: 'Todas las familias' }, ...familyOptions]}
      />
    </div>
  );
}
