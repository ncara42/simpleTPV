import { Select } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { CsvDropzone } from '../components/CsvDropzone.js';
import { Modal } from '../components/Modal.js';
import { listFamilies } from '../lib/families.js';
import { flattenTree } from '../lib/family-tree.js';
import { formErrorMessage } from '../lib/form-error.js';
import { fmtEur } from '../lib/format.js';
import { listProducts } from '../lib/products.js';
import { listSuppliers } from '../lib/purchases.js';
import {
  compareSupplierPrices,
  deleteSupplierPrice,
  importSupplierPricesCsv,
  listSupplierPrices,
  upsertSupplierPrice,
} from '../lib/supplier-prices.js';

// Tarifas de compra por proveedor (P1-B): alta/edición de precio por producto,
// import CSV por SKU y comparativa de precios entre proveedores por arquetipo.
export function SupplierPricesSection() {
  const qc = useQueryClient();
  const [view, setView] = useState<'tarifas' | 'comparativa'>('tarifas');
  const [supplierId, setSupplierId] = useState('');
  const [familyId, setFamilyId] = useState('');
  const [importing, setImporting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addProduct, setAddProduct] = useState('');
  const [addPrice, setAddPrice] = useState('');

  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: listSuppliers });
  const { data: families = [] } = useQuery({ queryKey: ['families'], queryFn: listFamilies });
  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => listProducts(),
  });
  const { data: prices = [] } = useQuery({
    queryKey: ['supplier-prices', supplierId || null],
    queryFn: () => listSupplierPrices(supplierId || undefined),
  });
  const { data: comparison = [] } = useQuery({
    queryKey: ['supplier-comparison', familyId || null],
    queryFn: () => compareSupplierPrices(familyId || undefined),
    enabled: view === 'comparativa',
  });

  const invalidate = (): void => {
    void qc.invalidateQueries({ queryKey: ['supplier-prices'] });
    void qc.invalidateQueries({ queryKey: ['supplier-comparison'] });
  };

  const upsertMut = useMutation({
    mutationFn: upsertSupplierPrice,
    onSuccess: () => {
      setAdding(false);
      setAddProduct('');
      setAddPrice('');
      invalidate();
    },
  });
  const deleteMut = useMutation({ mutationFn: deleteSupplierPrice, onSuccess: invalidate });

  const supplierName = (id: string): string => suppliers.find((s) => s.id === id)?.name ?? '—';

  return (
    <div className="table-panel">
      <div className="table-toolbar">
        <nav className="bo-tabs" data-testid="sp-view-tabs">
          <button
            className={`bo-tab ${view === 'tarifas' ? 'active' : ''}`}
            onClick={() => setView('tarifas')}
            data-testid="sp-view-tarifas"
          >
            Tarifas por proveedor
          </button>
          <button
            className={`bo-tab ${view === 'comparativa' ? 'active' : ''}`}
            onClick={() => setView('comparativa')}
            data-testid="sp-view-comparativa"
          >
            Comparativa
          </button>
        </nav>
        {view === 'tarifas' ? (
          <div className="sales-filters">
            <Select
              className="catalog-search"
              value={supplierId}
              onChange={setSupplierId}
              ariaLabel="Proveedor"
              data-testid="sp-supplier"
              options={[
                { value: '', label: 'Todos los proveedores' },
                ...suppliers.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
            <button
              type="button"
              className="users-sel-btn"
              disabled={!supplierId}
              title={supplierId ? undefined : 'Elige un proveedor para importar su tarifa'}
              onClick={() => setImporting(true)}
              data-testid="sp-import"
            >
              Importar CSV
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!supplierId}
              onClick={() => setAdding(true)}
              data-testid="sp-add"
            >
              Añadir tarifa
            </button>
          </div>
        ) : (
          <div className="sales-filters">
            <Select
              className="catalog-search"
              value={familyId}
              onChange={setFamilyId}
              ariaLabel="Arquetipo"
              data-testid="sp-family"
              options={[
                { value: '', label: 'Todos los arquetipos' },
                // Solo nodos ARQUETIPO: la comparativa agrupa productos casi
                // idénticos; filtrar por una familia raíz no casa con el árbol
                // canónico (los comparables cuelgan de arquetipos hoja).
                ...flattenTree(families)
                  .filter((f) => f.node.isArchetype)
                  .map((f) => ({ value: f.node.id, label: f.node.name })),
              ]}
            />
          </div>
        )}
      </div>

      {view === 'tarifas' ? (
        prices.length === 0 ? (
          <p className="catalog-empty" data-testid="sp-empty">
            Sin tarifas. Añade una o impórtalas por CSV.
          </p>
        ) : (
          <table className="catalog-table" data-testid="sp-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>SKU</th>
                {!supplierId && <th>Proveedor</th>}
                <th>Precio compra</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {prices.map((p) => (
                <tr key={p.id} data-testid="sp-row">
                  <td>{p.productName}</td>
                  <td className="muted">{p.sku ?? '—'}</td>
                  {!supplierId && <td className="muted">{p.supplierName}</td>}
                  <td>{fmtEur(p.price)}</td>
                  <td>
                    <button
                      type="button"
                      className="link-btn danger"
                      onClick={() => deleteMut.mutate(p.id)}
                      data-testid="sp-delete"
                    >
                      Borrar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : comparison.length === 0 ? (
        <p className="catalog-empty" data-testid="sp-comparison-empty">
          Sin tarifas que comparar para este arquetipo.
        </p>
      ) : (
        <table className="catalog-table" data-testid="sp-comparison-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Precios por proveedor</th>
              <th>Mejor</th>
            </tr>
          </thead>
          <tbody>
            {comparison.map((row) => (
              <tr key={row.productId} data-testid="sp-comparison-row">
                <td>{row.productName}</td>
                <td>
                  <span className="sp-price-chips">
                    {row.prices.map((pr) => (
                      <span
                        key={pr.supplierId}
                        className={`sp-price-chip${row.best?.supplierId === pr.supplierId ? ' is-best' : ''}`}
                      >
                        {pr.supplierName}: {fmtEur(pr.price)}
                      </span>
                    ))}
                  </span>
                </td>
                <td>
                  {row.best ? (
                    <strong className="sp-best">
                      {supplierName(row.best.supplierId)} · {fmtEur(row.best.price)}
                    </strong>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {adding && (
        <Modal
          onClose={() => setAdding(false)}
          className="modal--form"
          testId="sp-add-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!supplierId || !addProduct || !addPrice) return;
            upsertMut.mutate({
              supplierId,
              productId: addProduct,
              price: Number(addPrice),
            });
          }}
        >
          <h3>Añadir tarifa · {supplierName(supplierId)}</h3>
          <label>
            Producto
            <Select
              value={addProduct}
              onChange={setAddProduct}
              ariaLabel="Producto"
              data-testid="sp-add-product"
              options={[
                { value: '', label: 'Selecciona…' },
                ...products.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          </label>
          <label>
            Precio de compra (€)
            <input
              type="number"
              min={0}
              step="0.01"
              required
              value={addPrice}
              onChange={(e) => setAddPrice(e.target.value)}
              data-testid="sp-add-price"
            />
          </label>
          {upsertMut.isError && (
            <p className="form-error">
              {formErrorMessage(upsertMut.error, 'No se pudo guardar la tarifa.')}
            </p>
          )}
          <div className="modal-foot">
            <button type="button" onClick={() => setAdding(false)}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={!addProduct || !addPrice || upsertMut.isPending}
              data-testid="sp-add-save"
            >
              Guardar
            </button>
          </div>
        </Modal>
      )}

      {importing && (
        <Modal
          onClose={() => setImporting(false)}
          className="modal--form"
          testId="sp-import-modal"
          ariaLabel="Importar tarifa desde CSV"
        >
          <h3>Importar tarifa · {supplierName(supplierId)}</h3>
          <CsvDropzone
            columns={['sku', 'price']}
            example={['SKU-001', '3.50']}
            templateName="plantilla_tarifa_proveedor.csv"
            testId="sp-csv"
            help={
              <>
                Columnas: <code>sku,price</code>. Cada fila fija el precio de compra del producto
                con ese SKU para <strong>{supplierName(supplierId)}</strong>.
              </>
            }
            onImport={(csv) => importSupplierPricesCsv(supplierId, csv)}
            onImported={invalidate}
          />
          <div className="modal-foot">
            <button type="button" onClick={() => setImporting(false)}>
              Cerrar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
