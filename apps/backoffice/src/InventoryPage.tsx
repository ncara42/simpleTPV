import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';

import { CatalogPage } from './CatalogPage.js';
import { InventoryFilters } from './components/InventoryFilters.js';
import { FamiliesPage } from './FamiliesPage.js';
import { listFamilies } from './lib/families.js';
import { StockPage } from './StockPage.js';

// S-02 fases B-E — Shell unificado de Inventario. Reúne las tres vistas (Catálogo /
// Familias / Existencias) bajo una sola entrada de menú, un FILTRO COMPARTIDO
// (búsqueda + familia) y un control segmentado de vista.
//
// El filtro compartido y la vista activa viven en la URL (`?q=`, `?family=`,
// `?vista=`) para que sean compartibles y sobrevivan al reload (F0c). Los valores se
// pasan como props CONTROLADAS a cada vista: la búsqueda/familia las gobierna este
// shell, no la caja propia de cada página (que se oculta en modo controlado).

type Vista = 'catalogo' | 'familias' | 'existencias';

const VISTAS: ReadonlyArray<{ id: Vista; label: string }> = [
  { id: 'catalogo', label: 'Catálogo' },
  { id: 'familias', label: 'Familias' },
  { id: 'existencias', label: 'Existencias' },
];

interface InventoryPageProps {
  /** Deep-link a Catálogo filtrado por familia (`?family=`). */
  initialFamilyId?: string | null;
  /** Deep-link a Existencias preseleccionando tienda (`?store=`). */
  initialStoreId?: string | null;
  /** Deep-link a Existencias con búsqueda inicial (`?q=`). */
  initialSearch?: string | null;
  /** Atajo del panel de Familias: abre Catálogo filtrado por el nodo. */
  onOpenCatalogFamily: (id: string) => void;
}

export function InventoryPage({ initialStoreId, onOpenCatalogFamily }: InventoryPageProps) {
  const [params, setParams] = useSearchParams();
  const raw = params.get('vista');
  const vista: Vista = raw === 'familias' || raw === 'existencias' ? raw : 'catalogo';

  // Filtro COMPARTIDO en URL-state: `?q=` (búsqueda) y `?family=` (nodo de familia).
  // Fuente única para las tres vistas; los deep-links antiguos (?q=/?family=) ya
  // llegan en la URL, así que no hay que sincronizar estado aparte.
  const search = params.get('q') ?? '';
  const familyId = params.get('family') ?? '';

  // Árbol de familias para el selector jerárquico del filtro compartido.
  const { data: families = [] } = useQuery({
    queryKey: ['families'],
    queryFn: listFamilies,
  });

  // Escribe un parámetro de la URL preservando el resto (vista, store…). Cadena
  // vacía → borra el parámetro (URL limpia). `replace` evita acumular historial al
  // teclear/alternar.
  const setParam = (key: string, value: string): void => {
    const updated = new URLSearchParams(params);
    if (value) updated.set(key, value);
    else updated.delete(key);
    setParams(updated, { replace: true });
  };

  const setSearch = (value: string): void => setParam('q', value);
  const setFamily = (value: string): void => setParam('family', value);
  const selectVista = (next: Vista): void => setParam('vista', next);

  return (
    <div className="inventory-page" data-testid="inventory-page">
      <InventoryFilters
        families={families}
        search={search}
        onSearchChange={setSearch}
        familyId={familyId}
        onFamilyChange={setFamily}
      />
      <div className="inventory-views bo-tabs" role="tablist" aria-label="Vista de inventario">
        {VISTAS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            className={`bo-tab${vista === id ? ' active' : ''}`}
            aria-pressed={vista === id}
            data-testid={`inventory-view-${id}`}
            onClick={() => selectVista(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {vista === 'catalogo' && (
        <CatalogPage
          search={search}
          onSearchChange={setSearch}
          familyFilter={familyId}
          onFamilyFilterChange={setFamily}
        />
      )}
      {vista === 'familias' && (
        <FamiliesPage
          onOpenCatalogFamily={onOpenCatalogFamily}
          search={search}
          onSearchChange={setSearch}
          familyId={familyId}
        />
      )}
      {vista === 'existencias' && (
        <StockPage
          initialStoreId={initialStoreId ?? null}
          search={search}
          onSearchChange={setSearch}
          familyId={familyId}
          onFamilyChange={setFamily}
        />
      )}
    </div>
  );
}
