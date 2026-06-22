import { Button, DataTable, Input, Select } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { listStores } from '../lib/admin.js';
import {
  createPurchaseOrder,
  listSuppliers,
  type SuggestionRow,
  suggestPurchase,
} from '../lib/purchases.js';

export function SuggestSection({ tabs }: { tabs?: ReactNode }) {
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
      <DataTable
        data-testid="suggest-table"
        rowTestId="suggest-row"
        rows={rows}
        rowKey={(r) => r.productId}
        header={tabs}
        toolbar={
          <div className="users-toolbar">
            <div className="sales-filters">
              <Select
                className="catalog-search"
                value={storeId}
                onChange={setStoreId}
                ariaLabel="Tienda"
                options={[
                  { value: '', label: 'Tienda…' },
                  ...stores.map((s) => ({ value: s.id, label: s.name })),
                ]}
                data-testid="suggest-store"
              />
              <Select
                className="catalog-search"
                value={supplierId}
                onChange={setSupplierId}
                ariaLabel="Proveedor"
                options={[
                  { value: '', label: 'Proveedor…' },
                  ...suppliers.map((s) => ({ value: s.id, label: s.name })),
                ]}
                data-testid="suggest-supplier"
              />
            </div>
            <div className="ui-dt-toolbar-actions">
              <Button
                type="button"
                disabled={!storeId || suggestMut.isPending}
                onClick={() => suggestMut.mutate({ storeId })}
                data-testid="suggest-generate"
                icon={<Sparkles size={16} aria-hidden="true" />}
              >
                Generar
              </Button>
            </div>
          </div>
        }
        emptyState={
          <span className="catalog-empty" data-testid="suggest-empty">
            {suggestMut.isSuccess
              ? 'No hay nada que reponer.'
              : 'Genera una propuesta para una tienda.'}
          </span>
        }
        columns={[
          { key: 'product', header: 'Producto', render: (r) => r.productName },
          { key: 'stock', header: 'Stock', render: (r) => r.stockActual },
          { key: 'min', header: 'Mín', render: (r) => <span className="muted">{r.minStock}</span> },
          {
            key: 'avg',
            header: 'Venta media/día',
            render: (r) => <span className="muted">{r.ventaMediaDiaria}</span>,
          },
          {
            key: 'coverage',
            header: 'Cobertura',
            render: (r) => (
              <span className="muted">
                {r.coberturaDias != null ? `${r.coberturaDias} d` : '—'}
              </span>
            ),
          },
          {
            key: 'order',
            header: 'Pedir',
            render: (r) => (
              <Input
                type="number"
                min={0}
                value={qty[r.productId] ?? ''}
                onChange={(e) => setQty({ ...qty, [r.productId]: e.target.value })}
                data-testid="suggest-qty"
                style={{ width: '5rem' }}
              />
            ),
          },
        ]}
      />
      {rows.length > 0 && (
        <div className="modal-foot">
          <Button
            type="button"
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
          </Button>
        </div>
      )}
    </>
  );
}
