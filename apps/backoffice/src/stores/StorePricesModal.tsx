import { Button, DataTable, Input } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { CsvDropzone } from '../components/CsvDropzone.js';
import { Modal } from '../components/Modal.js';
import { ProductPicker } from '../components/ProductPicker.js';
import type { Store } from '../lib/admin.js';
import { fmtEur } from '../lib/format.js';
import {
  importStorePricesCsv,
  listStorePrices,
  removeStorePrice,
  setStorePrice,
} from '../lib/store-prices.js';

// Precios retail por tienda (#127 A): tabla de overrides del PVP para una tienda
// concreta + alta/edición/borrado de cada override. Calcado del editor de tarifas
// B2B (PriceListDetail). Sin override para un producto → en esa tienda se vende a su
// PVP; quitar un override lo devuelve al PVP. El precio es ABSOLUTO (no porcentaje).
export function StorePricesModal({ store, onClose }: { store: Store; onClose: () => void }) {
  const qc = useQueryClient();
  const [productId, setProductId] = useState<string | null>(null);
  const [price, setPrice] = useState('');
  const [importOpen, setImportOpen] = useState(false);

  const { data: overrides = [] } = useQuery({
    queryKey: ['store-prices', store.id],
    queryFn: () => listStorePrices(store.id),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['store-prices', store.id] });

  const setMut = useMutation({
    mutationFn: (v: { productId: string; price: number }) =>
      setStorePrice(store.id, v.productId, v.price),
    onSuccess: () => {
      invalidate();
      setProductId(null);
      setPrice('');
    },
  });
  const removeMut = useMutation({
    mutationFn: (pid: string) => removeStorePrice(store.id, pid),
    onSuccess: invalidate,
  });

  // Solo productos que aún no tienen override en esta tienda (para actualizar uno
  // existente se quita y se vuelve a añadir, igual que el editor de tarifas B2B).
  const overridden = new Set(overrides.map((o) => o.productId));
  const excludeIds = Array.from(overridden);

  const canAdd = productId !== null && productId !== '' && price !== '' && Number(price) >= 0;

  return (
    <Modal onClose={onClose} className="modal--form" testId="store-prices-detail">
      <header className="modal-head">
        <h3>Precios · {store.name}</h3>
        <p className="modal-sub">
          Precio de venta por tienda. Sin precio propio, el producto se vende a su PVP.
        </p>
      </header>
      <div className="modal-body">
        <DataTable
          data-testid="store-prices-table"
          rowTestId="store-price-row"
          rows={overrides}
          rowKey={(o) => o.id}
          emptyState={
            <span className="catalog-empty">
              Sin precios propios. Esta tienda vende todo a su PVP.
            </span>
          }
          columns={[
            { key: 'product', header: 'Producto', render: (o) => o.product.name },
            {
              key: 'pvp',
              header: 'PVP',
              render: (o) => <span className="muted">{fmtEur(Number(o.product.salePrice))}</span>,
            },
            { key: 'price', header: 'Precio en tienda', render: (o) => fmtEur(Number(o.price)) },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (o) => (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => removeMut.mutate(o.productId)}
                >
                  Quitar
                </button>
              ),
            },
          ]}
        />

        <section className="form-section">
          <span className="form-section-title">Añadir / actualizar precio</span>
          <div className="b2b-item-form">
            <div data-testid="store-price-product">
              <ProductPicker
                value={productId}
                onChange={setProductId}
                excludeIds={excludeIds}
                placeholder="Selecciona un producto…"
              />
            </div>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="Precio €"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              data-testid="store-price-input"
            />
            <Button
              type="button"
              disabled={!canAdd || setMut.isPending}
              onClick={() => setMut.mutate({ productId: productId!, price: Number(price) })}
              data-testid="store-price-add"
            >
              Añadir
            </Button>
          </div>
        </section>

        <section className="form-section">
          <button
            type="button"
            className="link-btn"
            onClick={() => setImportOpen((o) => !o)}
            aria-expanded={importOpen}
            data-testid="store-price-import-toggle"
          >
            {importOpen ? 'Ocultar importación CSV' : 'Importar precios por CSV'}
          </button>
          {importOpen && (
            <CsvDropzone
              columns={['sku', 'price']}
              example={['SKU-001', '8.50']}
              templateName="plantilla_precios_tienda.csv"
              testId="store-price-csv"
              help={
                <>
                  Columnas: <code>sku,price</code>. Cada fila fija el precio del producto con ese
                  SKU en <strong>{store.name}</strong>.
                </>
              }
              onImport={(csv) => importStorePricesCsv(store.id, csv)}
              onImported={invalidate}
            />
          )}
        </section>
      </div>
      <div className="modal-foot modal-foot-actions">
        <button type="button" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </Modal>
  );
}
