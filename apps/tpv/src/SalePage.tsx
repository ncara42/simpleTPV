import { Alert, Select } from '@simpletpv/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { CartPanel } from './CartPanel.js';
import { api } from './lib/auth.js';
import { beep } from './lib/beep.js';
import { useCart } from './lib/cart.js';
import { currentCashSession } from './lib/cash.js';
import { findByBarcode, listFamilies, type Product, searchProducts } from './lib/catalog.js';
import { eur } from './lib/format.js';
import { useHealthCheck } from './lib/health.js';
import { usePageHeader } from './lib/pageHeader.js';
import { listStores } from './lib/sales.js';
import { getStoreStock, type StockRow } from './lib/stock.js';
import { BARCODE_MIN_LENGTH, useBarcodeScanner } from './lib/useBarcodeScanner.js';
import { useDebounce } from './lib/useDebounce.js';
import { FamilyChips } from './sale/FamilyChips.js';
import { ProductGrid } from './sale/ProductGrid.js';
import { ProductStockModal } from './sale/ProductStockModal.js';

export function SalePage() {
  usePageHeader('Venta', 'Escanea o añade productos al ticket');
  const [search, setSearch] = useState('');
  const [familyId, setFamilyId] = useState<string | null>(null);
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
          <Alert
            variant="success"
            data-testid="sale-success-banner"
            duration={5000}
            onClose={() => setSaleNotice(null)}
            closeLabel="Cerrar confirmación"
          >
            Venta registrada correctamente · <strong>{saleNotice.ticketNumber}</strong> ·{' '}
            {eur(Number(saleNotice.total))} €
          </Alert>
        )}

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

        <FamilyChips families={families} familyId={familyId} setFamilyId={setFamilyId} />

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

        <ProductGrid
          isLoading={isLoading}
          products={products}
          stockByProduct={stockByProduct}
          onAdd={addToCart}
          onShowStock={setStockDetail}
        />
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
