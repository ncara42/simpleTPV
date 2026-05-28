import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { CartPanel } from './CartPanel.js';
import { useCart } from './lib/cart.js';
import { findByBarcode, listFamilies, type Product, searchProducts } from './lib/catalog.js';
import { listStores } from './lib/sales.js';
import { useBarcodeScanner } from './lib/useBarcodeScanner.js';
import { useDebounce } from './lib/useDebounce.js';

export function SalePage() {
  const [search, setSearch] = useState('');
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [scanned, setScanned] = useState<{ product: Product | null; code: string } | null>(null);
  const debouncedSearch = useDebounce(search, 200);

  const addToCart = useCart((s) => s.addItem);
  const { data: stores = [] } = useQuery({ queryKey: ['stores'], queryFn: listStores });
  const [storeId, setStoreId] = useState<string | null>(null);
  const activeStore = storeId ?? stores[0]?.id ?? null;

  const { data: families = [] } = useQuery({
    queryKey: ['families'],
    queryFn: listFamilies,
  });

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['sale-products', debouncedSearch, familyId],
    queryFn: () => searchProducts(debouncedSearch, familyId),
  });

  // Escáner USB: al leer un código, busca el producto, lo destaca y lo añade al carrito.
  useBarcodeScanner((code) => {
    void findByBarcode(code).then((product) => {
      setScanned({ product, code });
      if (product) addToCart(product);
    });
  });

  return (
    <div className="sale-layout">
      <div className="sale">
        {stores.length > 1 && (
          <div className="sale-store-row">
            <label>
              Tienda:{' '}
              <select
                value={activeStore ?? ''}
                onChange={(e) => setStoreId(e.target.value)}
                data-testid="store-select"
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

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
          {families.map((f) => (
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

        {scanned && (
          <div className="scan-banner" data-testid="scan-banner" onClick={() => setScanned(null)}>
            {scanned.product ? (
              <span>
                Escaneado: <strong>{scanned.product.name}</strong> ·{' '}
                {Number(scanned.product.salePrice).toFixed(2)} €
              </span>
            ) : (
              <span className="scan-miss">
                Código <strong>{scanned.code}</strong> sin producto asociado
              </span>
            )}
            <button className="scan-close" aria-label="Cerrar">
              ×
            </button>
          </div>
        )}

        {isLoading ? (
          <p className="sale-empty">Cargando…</p>
        ) : products.length === 0 ? (
          <p className="sale-empty" data-testid="sale-empty">
            Sin resultados.
          </p>
        ) : (
          <div className="sale-grid" data-testid="sale-grid">
            {products.map((p: Product) => (
              <button
                key={p.id}
                className="prod-card"
                data-testid="prod-card"
                onClick={() => addToCart(p)}
              >
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
      <CartPanel storeId={activeStore} />
    </div>
  );
}
