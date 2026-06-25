import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { CatalogPage } from './CatalogPage.js';
import { FamiliesPage } from './FamiliesPage.js';
import { listFamilies } from './lib/families.js';
import { usePageNav } from './lib/pageNav.js';
import { listProducts } from './lib/products.js';
import { StockPage } from './StockPage.js';

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

  const search = params.get('q') ?? '';
  const familyId = params.get('family') ?? '';

  // Host (hermano del card) donde el Catálogo portaliza su barra de selección: al estar FUERA
  // de .inv-card, su aparición reduce la altura del card (flex) en vez de vivir dentro de él.
  const [selBarHost, setSelBarHost] = useState<HTMLDivElement | null>(null);

  const { data: families = [] } = useQuery({
    queryKey: ['families'],
    queryFn: listFamilies,
  });

  const { data: allProducts = [] } = useQuery({
    queryKey: ['products', ''],
    queryFn: () => listProducts(),
  });

  // Silencia la advertencia de variable no usada — se mantiene para el subtítulo
  // que FamiliesPage/StockPage pueden necesitar en el futuro.
  void allProducts;
  void families;

  const setParam = (key: string, value: string): void => {
    const updated = new URLSearchParams(params);
    if (value) updated.set(key, value);
    else updated.delete(key);
    setParams(updated, { replace: true });
  };

  const setSearch = (value: string): void => setParam('q', value);
  const setFamily = (value: string): void => setParam('family', value);
  const selectVista = (next: Vista): void => setParam('vista', next);

  // Inyecta las pestañas en la columna izquierda de la TopBar.
  usePageNav(
    <div className="inv-nav-tabs" role="tablist" aria-label="Vista de inventario">
      {VISTAS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          role="tab"
          className={`inv-nav-tab${vista === id ? ' is-active' : ''}`}
          aria-pressed={vista === id}
          data-testid={`inventory-view-${id}`}
          onClick={() => selectVista(id)}
        >
          {label}
        </button>
      ))}
    </div>,
  );

  return (
    <div className="inventory-page" data-testid="inventory-page">
      <div className="inv-card">
        <div className={`inv-card-body inv-card-body--${vista}`}>
          {vista === 'catalogo' && (
            <CatalogPage
              search={search}
              onSearchChange={setSearch}
              familyFilter={familyId}
              onFamilyFilterChange={setFamily}
              selectionBarHost={selBarHost}
            />
          )}
          {vista === 'familias' && (
            <FamiliesPage
              onOpenCatalogFamily={onOpenCatalogFamily}
              search={search}
              onSearchChange={setSearch}
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
      </div>
      {/* Hermano del card (FUERA de .inv-card): destino del portal de la barra de selección del
          Catálogo. Vacío en Familias/Existencias. Su contenido (el slot) empuja al card al crecer. */}
      <div className="inv-selbar-host" ref={setSelBarHost} />
    </div>
  );
}
