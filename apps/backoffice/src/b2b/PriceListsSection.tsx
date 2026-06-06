import { Select } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useConfirm } from '../components/ConfirmProvider.js';
import { Modal } from '../components/Modal.js';
import { SectionToolbar } from '../components/SectionToolbar.js';
import {
  createPriceList,
  deletePriceList,
  getPriceList,
  listPriceLists,
  type PriceListSummary,
  removePriceListItem,
  setPriceListItem,
} from '../lib/b2b.js';
import { listProducts } from '../lib/products.js';

function eur(n: number | string): string {
  return `${Number(n).toFixed(2)} €`;
}

// Detalle de una tarifa: precios por producto + alta/edición/borrado de cada precio.
function PriceListDetail({
  priceList,
  onClose,
}: {
  priceList: PriceListSummary;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [productId, setProductId] = useState('');
  const [price, setPrice] = useState('');

  const { data: detail } = useQuery({
    queryKey: ['b2b-pricelist', priceList.id],
    queryFn: () => getPriceList(priceList.id),
  });
  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => listProducts(),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['b2b-pricelist', priceList.id] });
    void qc.invalidateQueries({ queryKey: ['b2b-pricelists'] });
  };

  const setItemMut = useMutation({
    mutationFn: (v: { productId: string; price: number }) =>
      setPriceListItem(priceList.id, v.productId, v.price),
    onSuccess: () => {
      invalidate();
      setProductId('');
      setPrice('');
    },
  });
  const removeItemMut = useMutation({
    mutationFn: (pid: string) => removePriceListItem(priceList.id, pid),
    onSuccess: invalidate,
  });

  const items = detail?.items ?? [];
  // Solo productos que aún no están en la tarifa.
  const inList = new Set(items.map((it) => it.productId));
  const productOptions = [
    { value: '', label: 'Selecciona un producto…' },
    ...products.filter((p) => !inList.has(p.id)).map((p) => ({ value: p.id, label: p.name })),
  ];

  const canAdd = productId !== '' && price !== '' && Number(price) >= 0;

  return (
    <Modal onClose={onClose} className="modal--form" testId="b2b-pricelist-detail">
      <header className="modal-head">
        <h3>Tarifa · {priceList.name}</h3>
      </header>
      <div className="modal-body">
        {items.length === 0 ? (
          <p className="catalog-empty">Sin precios. Añade el primero abajo.</p>
        ) : (
          <table className="catalog-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>PVP</th>
                <th>Precio mayorista</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} data-testid="b2b-pricelist-item">
                  <td>{it.product?.name ?? it.productId}</td>
                  <td className="muted">{it.product ? eur(it.product.salePrice) : '—'}</td>
                  <td>{eur(it.price)}</td>
                  <td>
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => removeItemMut.mutate(it.productId)}
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <section className="form-section">
          <span className="form-section-title">Añadir / actualizar precio</span>
          <div className="b2b-item-form">
            <Select
              value={productId}
              onChange={setProductId}
              ariaLabel="Producto"
              options={productOptions}
              data-testid="b2b-item-product"
            />
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Precio €"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              data-testid="b2b-item-price"
            />
            <button
              type="button"
              className="btn-primary"
              disabled={!canAdd || setItemMut.isPending}
              onClick={() => setItemMut.mutate({ productId, price: Number(price) })}
              data-testid="b2b-item-add"
            >
              Añadir
            </button>
          </div>
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

export function PriceListsSection() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [detailOf, setDetailOf] = useState<PriceListSummary | null>(null);

  const { data: priceLists = [], isLoading } = useQuery({
    queryKey: ['b2b-pricelists'],
    queryFn: listPriceLists,
  });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['b2b-pricelists'] });

  const createMut = useMutation({
    mutationFn: (name: string) => createPriceList(name),
    onSuccess: () => {
      invalidate();
      setCreating(false);
      setNewName('');
    },
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => deletePriceList(id),
    onSuccess: invalidate,
  });

  return (
    <div className="table-panel" data-testid="b2b-pricelists">
      <SectionToolbar
        actionLabel="Nueva tarifa"
        onAction={() => setCreating(true)}
        actionTestId="b2b-new-pricelist"
      >
        <span className="muted">
          {priceLists.length} tarifa{priceLists.length !== 1 ? 's' : ''}
        </span>
      </SectionToolbar>

      {isLoading ? (
        <p className="catalog-empty">Cargando…</p>
      ) : priceLists.length === 0 ? (
        <p className="catalog-empty">Aún no hay tarifas. Crea la primera.</p>
      ) : (
        <table className="catalog-table" data-testid="b2b-pricelists-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Precios</th>
              <th>Clientes</th>
              <th>Estado</th>
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {priceLists.map((p) => (
              <tr key={p.id} data-testid="b2b-pricelist-row">
                <td>{p.name}</td>
                <td className="muted">{p.itemCount}</td>
                <td className="muted">{p.customerCount}</td>
                <td>
                  <span className="role-badge">{p.active ? 'Activa' : 'Inactiva'}</span>
                </td>
                <td>
                  <button type="button" className="link-btn" onClick={() => setDetailOf(p)}>
                    Precios
                  </button>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={async () => {
                      const ok = await confirm({
                        title: 'Eliminar tarifa',
                        message: `¿Eliminar la tarifa "${p.name}"? Los clientes que la usen quedarán sin tarifa.`,
                        confirmLabel: 'Eliminar',
                        danger: true,
                      });
                      if (ok) removeMut.mutate(p.id);
                    }}
                  >
                    Borrar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {creating && (
        <Modal
          onClose={() => setCreating(false)}
          className="modal--form"
          testId="b2b-pricelist-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (newName.trim()) createMut.mutate(newName.trim());
          }}
        >
          <header className="modal-head">
            <h3>Nueva tarifa</h3>
          </header>
          <div className="modal-body">
            <section className="form-section">
              <label>
                Nombre
                <input
                  required
                  autoFocus
                  placeholder="Mayorista, distribuidor…"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  data-testid="b2b-pricelist-name"
                />
              </label>
            </section>
          </div>
          <div className="modal-foot modal-foot-actions">
            <button type="button" onClick={() => setCreating(false)}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={!newName.trim() || createMut.isPending}
            >
              Crear
            </button>
          </div>
        </Modal>
      )}

      {detailOf && <PriceListDetail priceList={detailOf} onClose={() => setDetailOf(null)} />}
    </div>
  );
}
