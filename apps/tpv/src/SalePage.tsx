import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { type FamilyNode, listFamilies, type Product, searchProducts } from './lib/catalog.js';
import { useDebounce } from './lib/useDebounce.js';

function flattenRoots(tree: FamilyNode[]): FamilyNode[] {
  // Para la barra del TPV mostramos las familias raíz (botones de primer nivel).
  return tree;
}

export function SalePage() {
  const [search, setSearch] = useState('');
  const [familyId, setFamilyId] = useState<string | null>(null);
  const debouncedSearch = useDebounce(search, 200);

  const { data: families = [] } = useQuery({
    queryKey: ['families'],
    queryFn: listFamilies,
  });

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['sale-products', debouncedSearch, familyId],
    queryFn: () => searchProducts(debouncedSearch, familyId),
  });

  const roots = flattenRoots(families);

  return (
    <div className="sale">
      <div className="sale-search-row">
        <input
          className="sale-search"
          placeholder="Buscar producto…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="sale-search"
          autoFocus
        />
      </div>

      <div className="sale-families" data-testid="sale-families">
        <button
          className={`fam-chip ${familyId === null ? 'active' : ''}`}
          onClick={() => setFamilyId(null)}
          data-testid="fam-chip-all"
        >
          Todas
        </button>
        {roots.map((f) => (
          <button
            key={f.id}
            className={`fam-chip ${familyId === f.id ? 'active' : ''}`}
            style={f.color ? { borderColor: f.color } : undefined}
            onClick={() => setFamilyId(f.id)}
            data-testid="fam-chip"
          >
            {f.name}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="sale-empty">Cargando…</p>
      ) : products.length === 0 ? (
        <p className="sale-empty" data-testid="sale-empty">
          Sin resultados.
        </p>
      ) : (
        <div className="sale-grid" data-testid="sale-grid">
          {products.map((p: Product) => (
            <button key={p.id} className="prod-card" data-testid="prod-card">
              <span className="prod-name">{p.name}</span>
              <span className="prod-meta">
                <span className="prod-price">{Number(p.salePrice).toFixed(2)} €</span>
                {/* Stock placeholder hasta el módulo de stock (Semana 3) */}
                <span className="prod-stock neutral">—</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
