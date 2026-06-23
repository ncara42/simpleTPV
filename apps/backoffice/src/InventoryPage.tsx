import { useSearchParams } from 'react-router-dom';

import { CatalogPage } from './CatalogPage.js';
import { FamiliesPage } from './FamiliesPage.js';
import { StockPage } from './StockPage.js';

// S-02 fase A — Shell unificado de Inventario. Reúne las tres vistas (Catálogo /
// Familias / Existencias) bajo una sola entrada de menú y un control segmentado.
// La vista activa vive en la URL (`?vista=`) para que sea compartible y sobreviva al
// reload, en línea con el resto de filtros de paso (F0c). En esta fase cada segmento
// monta la PÁGINA EXISTENTE tal cual: aquí solo va el shell + el selector, sin tocar
// la lógica interna de las páginas (la extracción de vistas y el filtro compartido
// son fases posteriores de S-02).

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

export function InventoryPage({
  initialFamilyId,
  initialStoreId,
  initialSearch,
  onOpenCatalogFamily,
}: InventoryPageProps) {
  const [params, setParams] = useSearchParams();
  const raw = params.get('vista');
  const vista: Vista = raw === 'familias' || raw === 'existencias' ? raw : 'catalogo';

  // Cambiar de vista preserva el resto de search params (deep-links de paso) y solo
  // fija `vista`. `replace` evita acumular entradas de historial al alternar vistas.
  const selectVista = (next: Vista): void => {
    const updated = new URLSearchParams(params);
    updated.set('vista', next);
    setParams(updated, { replace: true });
  };

  return (
    <div className="inventory-page" data-testid="inventory-page">
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
      {/* `?? null`: con exactOptionalPropertyTypes, las props initial* del shell son
        `string | null | undefined`; las páginas aceptan `string | null`, así que el
        `undefined` (prop ausente) se normaliza a `null` (sin filtro). */}
      {vista === 'catalogo' && <CatalogPage initialFamilyId={initialFamilyId ?? null} />}
      {vista === 'familias' && <FamiliesPage onOpenCatalogFamily={onOpenCatalogFamily} />}
      {vista === 'existencias' && (
        <StockPage initialStoreId={initialStoreId ?? null} initialSearch={initialSearch ?? null} />
      )}
    </div>
  );
}
