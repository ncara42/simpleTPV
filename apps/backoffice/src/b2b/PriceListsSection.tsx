import { Button, DataTable, Input } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { sileo } from 'sileo';

import { useConfirm } from '../components/ConfirmProvider.js';
import { Modal } from '../components/Modal.js';
import { ProductPicker } from '../components/ProductPicker.js';
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
import { formErrorMessage } from '../lib/form-error.js';
import { usePageActions } from '../lib/pageActions.js';

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
  const [productId, setProductId] = useState<string | null>(null);
  const [price, setPrice] = useState('');

  const { data: detail } = useQuery({
    queryKey: ['b2b-pricelist', priceList.id],
    queryFn: () => getPriceList(priceList.id),
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
      setProductId(null);
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
  const excludeIds = Array.from(inList);

  const canAdd = productId !== null && productId !== '' && price !== '' && Number(price) >= 0;

  return (
    <Modal onClose={onClose} className="modal--form" testId="b2b-pricelist-detail">
      <header className="modal-head">
        <h3>Tarifa · {priceList.name}</h3>
      </header>
      <div className="modal-body">
        <DataTable
          rowTestId="b2b-pricelist-item"
          rows={items}
          rowKey={(it) => it.id}
          emptyState={<span className="catalog-empty">Sin precios. Añade el primero abajo.</span>}
          columns={[
            {
              key: 'product',
              header: 'Producto',
              render: (it) => it.product?.name ?? it.productId,
            },
            {
              key: 'pvp',
              header: 'PVP',
              render: (it) => (
                <span className="muted">{it.product ? eur(it.product.salePrice) : '—'}</span>
              ),
            },
            { key: 'price', header: 'Precio mayorista', render: (it) => eur(it.price) },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (it) => (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => removeItemMut.mutate(it.productId)}
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
            <div data-testid="b2b-item-product">
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
              data-testid="b2b-item-price"
            />
            <Button
              type="button"
              disabled={!canAdd || setItemMut.isPending}
              onClick={() => setItemMut.mutate({ productId: productId!, price: Number(price) })}
              data-testid="b2b-item-add"
            >
              Añadir
            </Button>
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
      sileo.success({ title: 'Tarifa creada' });
    },
    onError: (e) => sileo.error({ title: formErrorMessage(e, 'No se pudo crear la tarifa') }),
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => deletePriceList(id),
    onSuccess: () => {
      invalidate();
      sileo.success({ title: 'Tarifa eliminada' });
    },
    onError: (e) => sileo.error({ title: formErrorMessage(e, 'No se pudo eliminar la tarifa') }),
  });

  // El «Nueva tarifa» vive en el clúster derecho de la TopBar (pageActions), junto a las
  // sub-pestañas de B2bPage; el recuento queda en la cabecera del panel.
  usePageActions(
    <Button
      onClick={() => setCreating(true)}
      data-testid="b2b-new-pricelist"
      icon={<Plus size={16} aria-hidden="true" />}
    >
      Nueva tarifa
    </Button>,
  );

  return (
    <div className="table-panel" data-testid="b2b-pricelists">
      <div className="dt-header-row dt-header-row--bare">
        <SectionToolbar>
          <span className="muted">
            {priceLists.length} tarifa{priceLists.length !== 1 ? 's' : ''}
          </span>
        </SectionToolbar>
      </div>

      <DataTable
        data-testid="b2b-pricelists-table"
        rowTestId="b2b-pricelist-row"
        rows={priceLists}
        rowKey={(p) => p.id}
        loading={isLoading}
        emptyState={<span className="catalog-empty">Aún no hay tarifas. Crea la primera.</span>}
        columns={[
          { key: 'name', header: 'Nombre', render: (p) => p.name },
          {
            key: 'items',
            header: 'Precios',
            render: (p) => <span className="muted">{p.itemCount}</span>,
          },
          {
            key: 'customers',
            header: 'Clientes',
            render: (p) => <span className="muted">{p.customerCount}</span>,
          },
          {
            key: 'status',
            header: 'Estado',
            render: (p) => <span className="role-badge">{p.active ? 'Activa' : 'Inactiva'}</span>,
          },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (p) => (
              <>
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
              </>
            ),
          },
        ]}
      />

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
                <Input
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
            <Button type="submit" disabled={!newName.trim() || createMut.isPending}>
              Crear
            </Button>
          </div>
        </Modal>
      )}

      {detailOf && <PriceListDetail priceList={detailOf} onClose={() => setDetailOf(null)} />}
    </div>
  );
}
