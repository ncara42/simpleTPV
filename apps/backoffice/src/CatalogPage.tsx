import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  DEMO_FAMILIES,
  DEMO_PRODUCT_STOCK,
  familyPathLabel,
  findFamily,
  stockLevel,
} from './demo/demoData.js';
import {
  createProduct,
  deleteProduct,
  listProducts,
  type Product,
  type ProductInput,
  updateProduct,
} from './lib/products.js';

interface FormState {
  id?: string;
  name: string;
  salePrice: number;
  sku: string | null;
  barcode: string | null;
  costPrice: number;
  taxRate: number;
  familyId: string | null; // familia raíz seleccionada
  subfamilyId: string | null; // subfamilia seleccionada (opcional, dentro de la familia)
}

const EMPTY: FormState = {
  name: '',
  salePrice: 0,
  sku: '',
  barcode: '',
  costPrice: 0,
  taxRate: 21,
  familyId: null,
  subfamilyId: null,
};

export function CatalogPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<FormState | null>(null);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', search],
    queryFn: () => listProducts(search),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['products'] });

  const saveMut = useMutation({
    mutationFn: (f: FormState) => {
      const payload: ProductInput = {
        name: f.name,
        salePrice: Number(f.salePrice),
        sku: f.sku || null,
        barcode: f.barcode || null,
        costPrice: Number(f.costPrice ?? 0),
        taxRate: Number(f.taxRate ?? 21),
        // La familia efectiva del producto es la subfamilia si se eligió; si no, la familia raíz.
        familyId: f.subfamilyId ?? f.familyId,
      };
      return f.id ? updateProduct(f.id, payload) : createProduct(payload);
    },
    onSuccess: () => {
      setForm(null);
      invalidate();
    },
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteProduct(id),
    onSuccess: invalidate,
  });

  const openEdit = (p: Product): void => {
    const { family, sub } = findFamily(p.familyId);
    setForm({
      id: p.id,
      name: p.name,
      salePrice: Number(p.salePrice),
      sku: p.sku,
      barcode: p.barcode,
      costPrice: Number(p.costPrice),
      taxRate: Number(p.taxRate),
      familyId: family?.id ?? null,
      subfamilyId: sub?.id ?? null,
    });
  };

  // Subfamilias disponibles para la familia raíz elegida (selector dependiente).
  const subfamilies = form?.familyId
    ? (DEMO_FAMILIES.find((fam) => fam.id === form.familyId)?.children ?? [])
    : [];

  return (
    <section className="catalog">
      <header className="catalog-head">
        <div>
          <h2>Catálogo</h2>
          <p className="catalog-sub" data-testid="catalog-count">
            {products.length} productos activos
          </p>
        </div>
        <div className="catalog-actions">
          <input
            className="catalog-search"
            placeholder="Buscar por nombre, SKU o código…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="catalog-search"
          />
          <button
            className="btn-primary"
            onClick={() => setForm({ ...EMPTY })}
            data-testid="new-product"
          >
            Nuevo producto
          </button>
        </div>
      </header>

      {isLoading ? (
        <p className="catalog-empty">Cargando…</p>
      ) : products.length === 0 ? (
        <p className="catalog-empty" data-testid="catalog-empty">
          Sin productos. Crea el primero.
        </p>
      ) : (
        <table className="catalog-table" data-testid="catalog-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Familia</th>
              <th>SKU</th>
              <th>Precio</th>
              <th>IVA</th>
              <th>Stock</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {products.map((p: Product) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td className="muted" data-testid="catalog-family">
                  {familyPathLabel(p.familyId)}
                </td>
                <td className="muted">{p.sku ?? '—'}</td>
                <td>{Number(p.salePrice).toFixed(2).replace('.', ',')} €</td>
                <td className="muted">{Number(p.taxRate).toFixed(0)}%</td>
                <td>
                  {(() => {
                    const qty = DEMO_PRODUCT_STOCK[p.id] ?? 0;
                    return (
                      <span
                        className={`stock-tag stock-${stockLevel(qty)}`}
                        data-testid="catalog-stock"
                      >
                        {qty}
                      </span>
                    );
                  })()}
                </td>
                <td className="row-actions">
                  <button onClick={() => openEdit(p)}>Editar</button>
                  <button className="danger" onClick={() => delMut.mutate(p.id)}>
                    Borrar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {form && (
        <div className="modal-backdrop" onClick={() => setForm(null)}>
          <form
            className="modal modal--form"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              saveMut.mutate(form);
            }}
            data-testid="product-form"
          >
            <h3>{form.id ? 'Editar producto' : 'Nuevo producto'}</h3>
            <label>
              Nombre
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                data-testid="form-name"
              />
            </label>
            <div className="modal-row">
              <label>
                Familia
                <select
                  value={form.familyId ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, familyId: e.target.value || null, subfamilyId: null })
                  }
                  data-testid="form-family"
                >
                  <option value="">— Sin familia —</option>
                  {DEMO_FAMILIES.map((fam) => (
                    <option key={fam.id} value={fam.id}>
                      {fam.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Subfamilia
                <select
                  value={form.subfamilyId ?? ''}
                  disabled={subfamilies.length === 0}
                  onChange={(e) => setForm({ ...form, subfamilyId: e.target.value || null })}
                  data-testid="form-subfamily"
                >
                  <option value="">
                    {subfamilies.length === 0 ? '— Sin subfamilias —' : '— Toda la familia —'}
                  </option>
                  {subfamilies.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="modal-row">
              <label>
                Precio venta (€)
                <input
                  type="number"
                  step="0.01"
                  required
                  value={form.salePrice}
                  onChange={(e) => setForm({ ...form, salePrice: Number(e.target.value) })}
                  data-testid="form-price"
                />
              </label>
              <label>
                IVA (%)
                <input
                  type="number"
                  step="1"
                  value={form.taxRate}
                  onChange={(e) => setForm({ ...form, taxRate: Number(e.target.value) })}
                />
              </label>
            </div>
            <div className="modal-row">
              <label>
                SKU
                <input
                  value={form.sku ?? ''}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                />
              </label>
              <label>
                Código de barras
                <input
                  value={form.barcode ?? ''}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                />
              </label>
            </div>
            {saveMut.isError && <p className="form-error">No se pudo guardar.</p>}
            <div className="modal-foot">
              <button type="button" onClick={() => setForm(null)}>
                Cancelar
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={saveMut.isPending}
                data-testid="form-save"
              >
                {saveMut.isPending ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
