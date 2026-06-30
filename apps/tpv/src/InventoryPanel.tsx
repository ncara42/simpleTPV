import { DataTable, usePageHeader } from '@simpletpv/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ClipboardList, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useAuthStore } from './lib/auth.js';
import { type Product, searchProducts } from './lib/catalog.js';
import { confirmInventoryCount, getStoreStock } from './lib/stock.js';
import { useDebounce } from './lib/useDebounce.js';

export function InventoryPanel({ storeId }: { storeId: string | null }) {
  usePageHeader('Inventario', 'Conteo rápido por nombre o código');
  const [search, setSearch] = useState('');
  const [reason, setReason] = useState('Recuento TPV');
  const [counts, setCounts] = useState<Record<string, { product: Product; qty: number }>>({});
  const debounced = useDebounce(search, 200);
  const role = useAuthStore((s) => s.getRole());
  const canConfirm = role === 'ADMIN' || role === 'MANAGER';

  const products = useQuery({
    queryKey: ['inventory-products', debounced],
    queryFn: () => searchProducts(debounced, null),
    enabled: debounced.trim().length > 0,
  });

  const stock = useQuery({
    queryKey: ['store-stock', storeId],
    queryFn: () => getStoreStock(storeId as string),
    enabled: storeId !== null,
  });
  const stockByProduct = useMemo(
    () => new Map((stock.data ?? []).map((row) => [row.productId, row.quantity])),
    [stock.data],
  );

  const confirm = useMutation({
    mutationFn: () =>
      confirmInventoryCount({
        storeId: storeId as string,
        reason,
        lines: Object.values(counts).map((c) => ({
          productId: c.product.id,
          countedQuantity: c.qty,
        })),
      }),
    onSuccess: () => setCounts({}),
  });

  function add(product: Product, delta = 1) {
    setCounts((prev) => ({
      ...prev,
      [product.id]: {
        product,
        qty: Math.max(0, (prev[product.id]?.qty ?? 0) + delta),
      },
    }));
    setSearch('');
  }

  function resolveSearch() {
    const exact =
      products.data?.find((p) => p.barcode === search.trim()) ??
      products.data?.find((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()));
    if (exact) add(exact);
  }

  const rows = Object.values(counts);

  return (
    <div className="inventory-view" data-testid="inventory-view">
      <div className="sale-search-wrap">
        <Search size={16} />
        <input
          className="sale-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && resolveSearch()}
          placeholder="Escanea o busca producto..."
          data-testid="inventory-search"
          autoFocus
        />
        <button type="button" className="scan-btn" onClick={resolveSearch}>
          Añadir
        </button>
      </div>

      {products.data && search.trim() && (
        <div className="inventory-results" data-testid="inventory-results">
          {products.data.slice(0, 8).map((p) => (
            <button key={p.id} onClick={() => add(p)} data-testid="inventory-result">
              {p.name}
            </button>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="inventory-empty" data-testid="inventory-lines">
          <span className="inventory-empty-icon" aria-hidden="true">
            <ClipboardList size={22} />
          </span>
          <p className="inventory-empty-title">Empieza el conteo</p>
          <p className="inventory-empty-text">
            Escanea o busca un producto para añadirlo al recuento de esta tienda.
          </p>
        </div>
      ) : (
        <DataTable<{ product: Product; qty: number }>
          data-testid="inventory-lines"
          rowTestId="inventory-line"
          rows={rows}
          rowKey={(r) => r.product.id}
          columns={[
            {
              key: 'product',
              header: 'Producto',
              render: (r) => (
                <span className="inventory-name">
                  <strong>{r.product.name}</strong>
                  <small>Actual: {stockByProduct.get(r.product.id) ?? '-'}</small>
                </span>
              ),
            },
            {
              key: 'qty',
              header: 'Cantidad',
              align: 'right',
              render: (r) => (
                <div className="inventory-stepper">
                  <button
                    type="button"
                    aria-label={`Restar ${r.product.name}`}
                    onClick={() => add(r.product, -1)}
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={0}
                    value={r.qty}
                    onChange={(e) => add(r.product, Number(e.target.value) - r.qty)}
                    data-testid="inventory-qty"
                  />
                  <button
                    type="button"
                    aria-label={`Sumar ${r.product.name}`}
                    onClick={() => add(r.product, 1)}
                  >
                    +
                  </button>
                </div>
              ),
            },
          ]}
        />
      )}

      <div className="inventory-actions">
        <label className="inventory-reason">
          <span>Motivo del ajuste</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            data-testid="inventory-reason"
          />
        </label>
        <button
          type="button"
          className="inventory-confirm"
          disabled={
            !canConfirm || rows.length === 0 || reason.trim().length === 0 || confirm.isPending
          }
          onClick={() => confirm.mutate()}
          data-testid="inventory-confirm"
        >
          {canConfirm ? 'Confirmar inventario' : 'Solo responsables pueden confirmar'}
        </button>
      </div>
    </div>
  );
}
