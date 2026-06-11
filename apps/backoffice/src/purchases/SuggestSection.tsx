import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { listStores } from '../lib/admin.js';
import {
  createPurchaseOrder,
  listSuppliers,
  type SuggestionRow,
  suggestPurchase,
} from '../lib/purchases.js';

export function SuggestSection() {
  const qc = useQueryClient();
  const { data: stores = [] } = useQuery({ queryKey: ['stores'], queryFn: listStores });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: listSuppliers });
  const [storeId, setStoreId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [rows, setRows] = useState<SuggestionRow[]>([]);
  const [qty, setQty] = useState<Record<string, string>>({});

  const suggestMut = useMutation({
    mutationFn: suggestPurchase,
    onSuccess: (data) => {
      setRows(data);
      setQty(Object.fromEntries(data.map((r) => [r.productId, String(r.cantidadSugerida)])));
    },
  });
  const createMut = useMutation({
    mutationFn: createPurchaseOrder,
    onSuccess: () => {
      setRows([]);
      void qc.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });

  return (
    <>
      <header className="catalog-head">
        <h2>Generar propuesta de pedido</h2>
        <div className="catalog-actions">
          <select
            className="catalog-search"
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            data-testid="suggest-store"
          >
            <option value="">Tienda…</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            className="catalog-search"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            data-testid="suggest-supplier"
          >
            <option value="">Proveedor…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-primary"
            disabled={!storeId || suggestMut.isPending}
            onClick={() => suggestMut.mutate({ storeId })}
            data-testid="suggest-generate"
          >
            Generar
          </button>
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="catalog-empty" data-testid="suggest-empty">
          {suggestMut.isSuccess
            ? 'No hay nada que reponer.'
            : 'Genera una propuesta para una tienda.'}
        </p>
      ) : (
        <>
          <table className="catalog-table" data-testid="suggest-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Stock</th>
                <th>Mín</th>
                <th>Venta media/día</th>
                <th>Cobertura</th>
                <th>Pedir</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.productId} data-testid="suggest-row">
                  <td>{r.productName}</td>
                  <td>{r.stockActual}</td>
                  <td className="muted">{r.minStock}</td>
                  <td className="muted">{r.ventaMediaDiaria}</td>
                  <td className="muted">
                    {r.coberturaDias != null ? `${r.coberturaDias} d` : '—'}
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      value={qty[r.productId] ?? ''}
                      onChange={(e) => setQty({ ...qty, [r.productId]: e.target.value })}
                      data-testid="suggest-qty"
                      style={{ width: '5rem' }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="modal-foot">
            <button
              type="button"
              className="btn-primary"
              disabled={!supplierId || createMut.isPending}
              onClick={() =>
                createMut.mutate({
                  supplierId,
                  storeId,
                  lines: rows
                    .filter((r) => Number(qty[r.productId] ?? 0) > 0)
                    .map((r) => ({
                      productId: r.productId,
                      quantityOrdered: Number(qty[r.productId]),
                    })),
                })
              }
              data-testid="suggest-create-order"
            >
              Crear pedido (selecciona proveedor)
            </button>
          </div>
        </>
      )}
    </>
  );
}
