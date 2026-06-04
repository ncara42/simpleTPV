import { Select } from '@simpletpv/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { CartPanel } from './CartPanel.js';
import { CashPanel } from './CashPanel.js';
import { DEMO_FAMILY_COUNTS, DEMO_TOTAL_COUNT } from './demo/demoData.js';
import { api } from './lib/auth.js';
import { beep } from './lib/beep.js';
import { useCart } from './lib/cart.js';
import { currentCashSession } from './lib/cash.js';
import {
  type FamilyNode,
  findByBarcode,
  listFamilies,
  type Product,
  searchProducts,
} from './lib/catalog.js';
import { eur } from './lib/format.js';
import { useHealthCheck } from './lib/health.js';
import { listStores } from './lib/sales.js';
import { getProductStock, getStoreStock, type StockRow } from './lib/stock.js';
import { BARCODE_MIN_LENGTH, useBarcodeScanner } from './lib/useBarcodeScanner.js';
import { useDebounce } from './lib/useDebounce.js';

export function SalePage() {
  const [search, setSearch] = useState('');
  const [familyId, setFamilyId] = useState<string | null>(null);
  // Navegación en dos pasos: si está dentro de una familia con subfamilias,
  // `parentFamily` es esa familia y los chips muestran sus subfamilias.
  const [parentFamily, setParentFamily] = useState<FamilyNode | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [scanned, setScanned] = useState<{ product: Product | null; code: string } | null>(null);
  const [stockDetail, setStockDetail] = useState<Product | null>(null);
  const [saleNotice, setSaleNotice] = useState<{ ticketNumber: string; total: string } | null>(
    null,
  );
  const debouncedSearch = useDebounce(search, 200);
  const qc = useQueryClient();

  // Health-check (#34): si la API no responde, el cobro se bloquea y se muestra
  // un banner de estado degradado. Se suma al bloqueo por caja cerrada.
  const apiHealthy = useHealthCheck();

  const addToCart = useCart((s) => s.addItem);
  const { data: stores = [] } = useQuery({ queryKey: ['stores'], queryFn: listStores });
  const [storeId, setStoreId] = useState<string | null>(null);
  const activeStore = storeId ?? stores[0]?.id ?? null;

  // Estado de la caja de la tienda activa. Misma queryKey que CashPanel, así
  // react-query deduplica la petición y ambos comparten el resultado. Caja
  // obligatoria: si no hay sesión OPEN, el CartPanel bloquea el cobro.
  const { data: cashSession } = useQuery({
    queryKey: ['cash-session', activeStore],
    queryFn: () => currentCashSession(activeStore as string),
    enabled: activeStore !== null,
  });
  const cashOpen = cashSession != null;

  const { data: families = [] } = useQuery({
    queryKey: ['families'],
    queryFn: listFamilies,
  });

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['sale-products', debouncedSearch, familyId],
    queryFn: () => searchProducts(debouncedSearch, familyId),
  });

  // Contadores de los chips (modo demo): el total y el número por familia son
  // fijos para calcar el mockup (DEMO_TOTAL_COUNT / DEMO_FAMILY_COUNTS).

  // Stock de la tienda activa: para mostrar la cantidad/nivel en cada tarjeta.
  const { data: stockRows = [] } = useQuery({
    queryKey: ['store-stock', activeStore],
    queryFn: () => getStoreStock(activeStore as string),
    enabled: activeStore !== null,
  });
  const stockByProduct = useMemo(() => {
    const map = new Map<string, StockRow>();
    for (const row of stockRows) {
      map.set(row.productId, row);
    }
    return map;
  }, [stockRows]);

  // Stock vivo (#34): el SSE actualiza el stock visible al escuchar stock.changed
  // de la tienda activa. Invalida la query de stock para refrescar las tarjetas.
  useEffect(() => {
    const unsubscribe = api.subscribeEvents((event) => {
      if (event.type === 'stock.changed' && event.data.storeId === activeStore) {
        void qc.invalidateQueries({ queryKey: ['store-stock', activeStore] });
      }
    });
    return unsubscribe;
  }, [qc, activeStore]);

  // Atajo F3: enfoca el buscador para teclear o escanear un código. Replica el
  // botón "Escanear · F3" del buscador (el escáner USB físico se escucha aparte).
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'F3') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Resuelve un código escaneado: destaca el resultado, añade al carrito si hay
  // producto y emite un beep (ok/error). Lo comparten el escáner USB (listener
  // global) y el Enter del buscador.
  function onScanResolved(product: Product | null, code: string): void {
    setScanned({ product, code });
    if (product) addToCart(product);
    beep(product ? 'ok' : 'error');
  }

  // Escáner USB físico: solo actúa cuando el foco NO está en un campo editable.
  // Con el buscador enfocado (por defecto), lo gestiona onSearchKeyDown.
  useBarcodeScanner((code) => {
    void findByBarcode(code).then((product) => onScanResolved(product, code));
  });

  // Enter en el buscador: intenta resolver el texto como código de barras. Si hay
  // producto, lo añade y limpia el campo (campo único dual: código + texto). Si no
  // hay producto y parece un código (solo dígitos), avisa; un término de texto
  // normal no dispara aviso (la búsqueda ya filtra el grid).
  function onSearchKeyDown(e: ReactKeyboardEvent<HTMLInputElement>): void {
    if (e.key !== 'Enter') return;
    const code = search.trim();
    if (code.length < BARCODE_MIN_LENGTH) return;
    e.preventDefault();
    void findByBarcode(code).then((product) => {
      if (product) {
        onScanResolved(product, code);
        setSearch('');
      } else if (/^\d+$/.test(code)) {
        onScanResolved(null, code);
      }
    });
  }

  return (
    <div className="sale-layout">
      <div className="sale">
        {stores.length > 1 && (
          <div className="sale-store-row">
            <label>
              Tienda:{' '}
              <Select
                value={activeStore ?? ''}
                onChange={setStoreId}
                options={stores.map((s) => ({
                  value: s.id,
                  label: `${s.code} · ${s.name}`,
                }))}
                ariaLabel="Tienda"
                data-testid="store-select"
              />
            </label>
          </div>
        )}

        {!apiHealthy && (
          <div className="api-banner-error" data-testid="api-degraded">
            <span>
              <strong>Conexión con el servidor degradada.</strong> El cobro está bloqueado hasta
              recuperar la conexión.
            </span>
          </div>
        )}

        {saleNotice && (
          <div className="sale-success-banner" data-testid="sale-success-banner">
            <span className="sale-success-mark">✓</span>
            <span>
              Venta registrada correctamente · <strong>{saleNotice.ticketNumber}</strong> ·{' '}
              {eur(Number(saleNotice.total))} €
            </span>
            <button
              type="button"
              className="sale-success-close"
              onClick={() => setSaleNotice(null)}
              aria-label="Cerrar confirmación"
            >
              ×
            </button>
          </div>
        )}

        <CashPanel storeId={activeStore} />

        <div className="sale-search-row">
          <div className="sale-search-wrap">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              ref={searchRef}
              className="sale-search"
              placeholder="Buscar producto por nombre o SKU…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={onSearchKeyDown}
              data-testid="sale-search"
              autoFocus
            />
            <button
              type="button"
              className="scan-btn"
              onClick={() => searchRef.current?.focus()}
              data-testid="scan-btn"
              title="Escanear un código de barras (F3)"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
                <path d="M7 8v8M10.5 8v8M14 8v8M17 8v8" strokeWidth="1.6" />
              </svg>
              Escanear <span className="kbd">F3</span>
            </button>
          </div>
        </div>

        <div className="sale-families" data-testid="sale-families">
          {parentFamily ? (
            <>
              {/* Dentro de una familia: volver + "Todo · Familia" + subfamilias. */}
              <button
                type="button"
                className="fam-chip fam-back"
                onClick={() => {
                  setParentFamily(null);
                  setFamilyId(null);
                }}
                data-testid="fam-back"
              >
                ‹ Volver
              </button>
              <button
                className={`fam-chip ${familyId === parentFamily.id ? 'active' : ''}`}
                onClick={() => setFamilyId(parentFamily.id)}
                data-testid="fam-chip-parent"
              >
                <span
                  className="chip-dot"
                  style={{ background: parentFamily.color ?? 'var(--ui-text-soft)' }}
                />
                Todo · {parentFamily.name}{' '}
                <span className="chip-count">{DEMO_FAMILY_COUNTS[parentFamily.id] ?? 0}</span>
              </button>
              {parentFamily.children.map((s) => (
                <button
                  key={s.id}
                  className={`fam-chip ${familyId === s.id ? 'active' : ''}`}
                  onClick={() => setFamilyId(s.id)}
                  data-testid="fam-chip"
                >
                  <span
                    className="chip-dot"
                    style={{ background: s.color ?? 'var(--ui-text-soft)' }}
                  />
                  {s.name} <span className="chip-count">{DEMO_FAMILY_COUNTS[s.id] ?? 0}</span>
                </button>
              ))}
            </>
          ) : (
            <>
              <button
                className={`fam-chip ${familyId === null ? 'active' : ''}`}
                onClick={() => {
                  setFamilyId(null);
                  setParentFamily(null);
                }}
                data-testid="fam-chip-all"
              >
                Todas <span className="chip-count">{DEMO_TOTAL_COUNT}</span>
              </button>
              {families.map((f) => (
                <button
                  key={f.id}
                  className={`fam-chip ${familyId === f.id ? 'active' : ''}`}
                  // Familia con subfamilias → entra en ella; familia hoja → filtra directo.
                  onClick={() => {
                    setFamilyId(f.id);
                    setParentFamily(f.children.length > 0 ? f : null);
                  }}
                  data-testid="fam-chip"
                >
                  <span
                    className="chip-dot"
                    style={{ background: f.color ?? 'var(--ui-text-soft)' }}
                  />
                  {f.name}
                  {f.children.length > 0 && <span className="fam-chevron"> ›</span>}{' '}
                  <span className="chip-count">{DEMO_FAMILY_COUNTS[f.id] ?? 0}</span>
                </button>
              ))}
            </>
          )}
        </div>

        {scanned && (
          <div className="scan-banner" data-testid="scan-banner" onClick={() => setScanned(null)}>
            {scanned.product ? (
              <span>
                Escaneado: <strong>{scanned.product.name}</strong> ·{' '}
                {eur(Number(scanned.product.salePrice))} €
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
            {products.map((p: Product) => {
              const stock = stockByProduct.get(p.id);
              return (
                <button
                  key={p.id}
                  className="prod-card"
                  data-testid="prod-card"
                  onClick={() => addToCart(p)}
                >
                  <span className="prod-name">{p.name}</span>
                  <span className="prod-meta">
                    <span className="prod-price">{eur(Number(p.salePrice))} €</span>
                    {/* Stock vivo (#34): cantidad + semáforo. Click abre el detalle
                        sin añadir al carrito (stopPropagation). */}
                    {stock ? (
                      stock.quantity === 0 ? (
                        <span className="prod-stock sold-out" data-testid="prod-stock">
                          Agotado
                        </span>
                      ) : (
                        <span
                          className={`prod-stock stock-${stock.level}`}
                          data-testid="prod-stock"
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            setStockDetail(p);
                          }}
                          title="Ver stock por tienda"
                        >
                          {stock.quantity}
                        </span>
                      )
                    ) : (
                      <span className="prod-stock neutral" data-testid="prod-stock">
                        —
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <CartPanel
        storeId={activeStore}
        cashOpen={cashOpen}
        apiHealthy={apiHealthy}
        onSaleConfirmed={setSaleNotice}
      />
      {stockDetail && (
        <ProductStockModal product={stockDetail} onClose={() => setStockDetail(null)} />
      )}
    </div>
  );
}

// Modal de consulta de stock de un producto en todas las tiendas (#34). Se abre
// desde la tarjeta de producto sin salir de la venta.
function ProductStockModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['product-stock', product.id],
    queryFn: () => getProductStock(product.id),
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} data-testid="product-stock-modal">
        <h3>Stock · {product.name}</h3>
        {isLoading ? (
          <p className="sale-empty">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="sale-empty" data-testid="product-stock-empty">
            Sin stock registrado.
          </p>
        ) : (
          <ul className="prod-stock-list">
            {rows.map((r) => (
              <li key={r.storeId} data-testid="product-stock-row">
                <span className={`stock-dot stock-${r.level}`} /> {r.storeName}:{' '}
                <strong>{r.quantity}</strong> <span className="muted">(mín {r.minStock})</span>
              </li>
            ))}
          </ul>
        )}
        <div className="modal-foot">
          <button type="button" onClick={onClose} data-testid="product-stock-close">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
