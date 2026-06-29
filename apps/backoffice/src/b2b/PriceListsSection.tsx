import { Button, Input } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { sileo } from 'sileo';

import { useConfirm } from '../components/ConfirmProvider.js';
import { Modal } from '../components/Modal.js';
import { ProductPicker } from '../components/ProductPicker.js';
import {
  createPriceList,
  customerLedger,
  deletePriceList,
  getPriceList,
  listCustomers,
  listPriceLists,
  type PriceListDetail as PriceListDetailDto,
  removePriceListItem,
  setPriceListItem,
  updatePriceList,
} from '../lib/b2b.js';
import { formErrorMessage } from '../lib/form-error.js';
import { usePageActions } from '../lib/pageActions.js';
import {
  activeFacetCount,
  activeSavedView,
  applySavedView,
  type AsignFilter,
  EMPTY_FACETS,
  type EstadoFilter,
  filterPriceLists,
  mergePriceLists,
  type PriceListFacetState,
  type PriceListTipo,
  type PriceListView,
  type SavedViewId,
  searchBase,
} from './pricelist-facets.js';
import { PriceListDetail, type PriceListDetailCustomer } from './PriceListDetail.js';
import { type FacetGroupView, PriceListFacets } from './PriceListFacets.js';
import { PriceListList } from './PriceListList.js';

/** Formulario de alta/edición de la tarifa (nombre + activa). */
interface TariffForm {
  id?: string;
  name: string;
  active: boolean;
}

/** Formulario de fijar/editar el precio de un producto en la tarifa. */
interface ItemForm {
  /** Producto fijado (modo edición); `null` mientras se elige (modo alta). */
  productId: string | null;
  /** Nombre del producto en edición, para mostrarlo bloqueado. */
  productName: string | null;
  price: string;
}

export function PriceListsSection() {
  const qc = useQueryClient();
  const confirm = useConfirm();

  const [facets, setFacets] = useState<PriceListFacetState>(EMPTY_FACETS);
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tariffForm, setTariffForm] = useState<TariffForm | null>(null);
  const [itemForm, setItemForm] = useState<ItemForm | null>(null);

  const { data: priceLists = [] } = useQuery({
    queryKey: ['b2b-pricelists'],
    queryFn: listPriceLists,
  });
  const { data: customers = [] } = useQuery({
    queryKey: ['b2b-customers'],
    queryFn: listCustomers,
  });
  const { data: ledger = [] } = useQuery({
    queryKey: ['b2b-customer-ledger'],
    queryFn: customerLedger,
  });

  // Detalles de TODAS las tarifas: el descuento/tipo y la tabla de precios se derivan
  // de los items, que `listPriceLists` no incluye. Es una pantalla de administración
  // con pocas tarifas, así que un fan-out de detalles es asumible. La key incluye los
  // ids para reconsultar al crear/duplicar/borrar.
  const idsKey = priceLists
    .map((p) => p.id)
    .sort()
    .join(',');
  const { data: details = [], isFetching: detailsLoading } = useQuery({
    queryKey: ['b2b-pricelist-details', idsKey],
    queryFn: () => Promise.all(priceLists.map((p) => getPriceList(p.id))),
    enabled: priceLists.length > 0,
  });

  const detailsById = useMemo(() => {
    const map = new Map<string, PriceListDetailDto>();
    for (const d of details) if (d) map.set(d.id, d);
    return map;
  }, [details]);

  const views = useMemo(
    () => mergePriceLists(priceLists, detailsById, customers, ledger),
    [priceLists, detailsById, customers, ledger],
  );

  const invalidateLists = () => {
    void qc.invalidateQueries({ queryKey: ['b2b-pricelists'] });
    void qc.invalidateQueries({ queryKey: ['b2b-pricelist-details'] });
  };
  const invalidateAll = () => {
    invalidateLists();
    void qc.invalidateQueries({ queryKey: ['b2b-customers'] });
  };

  // ── Mutaciones ───────────────────────────────────────────────────────────────
  const saveTariffMut = useMutation({
    mutationFn: (f: TariffForm) =>
      f.id
        ? updatePriceList(f.id, { name: f.name.trim(), active: f.active })
        : createPriceList(f.name.trim()),
    onSuccess: (saved, f) => {
      invalidateLists();
      setTariffForm(null);
      setSelectedId(saved.id);
      sileo.success({ title: f.id ? 'Tarifa actualizada' : 'Tarifa creada' });
    },
    onError: (e) => sileo.error({ title: formErrorMessage(e, 'No se pudo guardar la tarifa') }),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => deletePriceList(id),
    onSuccess: (_data, id) => {
      invalidateAll();
      if (selectedId === id) setSelectedId(null);
      sileo.success({ title: 'Tarifa eliminada' });
    },
    onError: (e) => sileo.error({ title: formErrorMessage(e, 'No se pudo eliminar la tarifa') }),
  });

  // Duplicar usa solo endpoints existentes: crea la tarifa y copia sus precios uno a uno.
  const duplicateMut = useMutation({
    mutationFn: async (src: PriceListView) => {
      const created = await createPriceList(`${src.name} (copia)`);
      for (const it of src.items) {
        await setPriceListItem(created.id, it.productId, Number(it.price));
      }
      return created;
    },
    onSuccess: (created) => {
      invalidateLists();
      setSelectedId(created.id);
      sileo.success({ title: 'Tarifa duplicada' });
    },
    onError: (e) => sileo.error({ title: formErrorMessage(e, 'No se pudo duplicar la tarifa') }),
  });

  const setItemMut = useMutation({
    mutationFn: (v: { listId: string; productId: string; price: number }) =>
      setPriceListItem(v.listId, v.productId, v.price),
    onSuccess: () => {
      invalidateLists();
      setItemForm(null);
      sileo.success({ title: 'Precio guardado' });
    },
    onError: (e) => sileo.error({ title: formErrorMessage(e, 'No se pudo guardar el precio') }),
  });

  const removeItemMut = useMutation({
    mutationFn: (v: { listId: string; productId: string }) =>
      removePriceListItem(v.listId, v.productId),
    onSuccess: () => {
      invalidateLists();
      sileo.success({ title: 'Producto quitado de la tarifa' });
    },
    onError: (e) => sileo.error({ title: formErrorMessage(e, 'No se pudo quitar el producto') }),
  });

  // ── Lista filtrada + selección ─────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const rows = filterPriceLists(views, facets);
    const dir = sortAsc ? 1 : -1;
    return rows
      .slice()
      .sort((a, b) => (a.billed12m - b.billed12m) * dir || a.name.localeCompare(b.name));
  }, [views, facets, sortAsc]);

  const selected = useMemo(() => {
    if (selectedId) {
      const found = views.find((t) => t.id === selectedId);
      if (found) return found;
    }
    return filtered[0] ?? null;
  }, [selectedId, views, filtered]);

  const detailCustomers: PriceListDetailCustomer[] = useMemo(() => {
    if (!selected) return [];
    const billed = new Map(ledger.map((l) => [l.customerId, Number(l.billed12m)]));
    return customers
      .filter((c) => c.priceListId === selected.id)
      .map((c) => ({
        id: c.id,
        name: c.name,
        subtitle: c.nif ?? c.email ?? c.address ?? '—',
        billed12m: billed.get(c.id) ?? 0,
        active: c.active,
      }))
      .sort((a, b) => b.billed12m - a.billed12m);
  }, [selected, customers, ledger]);

  // ── Facetas + vistas guardadas ───────────────────────────────────────────────
  const base = useMemo(() => searchBase(views, facets.search), [views, facets.search]);
  const cnt = (pred: (t: PriceListView) => boolean) => base.filter(pred).length;

  const groups: FacetGroupView[] = [
    {
      key: 'estado',
      title: 'Estado',
      options: [
        { key: 'all', label: 'Todas', count: base.length, active: facets.estado === 'all' },
        {
          key: 'active',
          label: 'Activas',
          count: cnt((t) => t.active),
          active: facets.estado === 'active',
        },
        {
          key: 'inactive',
          label: 'Inactivas',
          count: cnt((t) => !t.active),
          active: facets.estado === 'inactive',
        },
      ],
    },
    {
      key: 'tipo',
      title: 'Tipo',
      options: [
        {
          key: 'base',
          label: 'Base',
          count: cnt((t) => t.tipo === 'base'),
          active: facets.tipos.has('base'),
        },
        {
          key: 'descuento',
          label: 'Descuento',
          count: cnt((t) => t.tipo === 'descuento'),
          active: facets.tipos.has('descuento'),
        },
      ],
    },
    {
      key: 'asignacion',
      title: 'Asignación',
      options: [
        { key: 'all', label: 'Todas', count: base.length, active: facets.asignacion === 'all' },
        {
          key: 'con',
          label: 'Con clientes',
          count: cnt((t) => t.customerCount > 0),
          active: facets.asignacion === 'con',
        },
        {
          key: 'sin',
          label: 'Sin clientes',
          count: cnt((t) => t.customerCount === 0),
          active: facets.asignacion === 'sin',
        },
      ],
    },
  ];

  const activeView = activeSavedView(facets);
  const savedViews = [
    { id: 'all' as SavedViewId, label: 'Todas', count: views.length },
    {
      id: 'activas' as SavedViewId,
      label: 'Activas',
      count: views.filter((t) => t.active).length,
    },
    {
      id: 'conclientes' as SavedViewId,
      label: 'Con clientes',
      count: views.filter((t) => t.customerCount > 0).length,
    },
    {
      id: 'sinclientes' as SavedViewId,
      label: 'Sin clientes',
      count: views.filter((t) => t.customerCount === 0).length,
    },
    {
      id: 'inactivas' as SavedViewId,
      label: 'Inactivas',
      count: views.filter((t) => !t.active).length,
    },
  ].map((v) => ({ ...v, active: activeView === v.id }));

  const toggleFacet = (groupKey: string, optKey: string) => {
    setFacets((f) => {
      if (groupKey === 'estado') {
        return { ...f, estado: f.estado === optKey ? 'all' : (optKey as EstadoFilter) };
      }
      if (groupKey === 'asignacion') {
        return { ...f, asignacion: f.asignacion === optKey ? 'all' : (optKey as AsignFilter) };
      }
      const next = new Set(f.tipos);
      const tipo = optKey as PriceListTipo;
      if (next.has(tipo)) next.delete(tipo);
      else next.add(tipo);
      return { ...f, tipos: next };
    });
  };

  const clearFilters = () =>
    setFacets((f) => ({ ...EMPTY_FACETS, search: f.search, tipos: new Set() }));

  // ── Acción primaria en la TopBar (igual que Clientes/Catálogo/Ventas) ──────────
  usePageActions(
    <Button
      onClick={() => setTariffForm({ name: '', active: true })}
      data-testid="b2b-new-pricelist"
      icon={<Plus size={16} aria-hidden="true" />}
    >
      Nueva tarifa
    </Button>,
  );

  const excludeIds = selected ? selected.items.map((it) => it.productId) : [];
  const hasFilters = activeFacetCount(facets) > 0 || facets.search.trim() !== '';
  const itemPrice = itemForm?.price ?? '';
  const canSaveItem =
    itemForm !== null &&
    itemForm.productId !== null &&
    itemForm.productId !== '' &&
    itemPrice !== '' &&
    Number(itemPrice) >= 0;

  return (
    <div className="b2b-pricelists-page">
      <div className="cust-card">
        <div className="pl-layout">
          <PriceListFacets
            search={facets.search}
            onSearchChange={(v) => setFacets((f) => ({ ...f, search: v }))}
            savedViews={savedViews}
            onSavedView={(id) => setFacets(applySavedView(id))}
            groups={groups}
            onToggleFacet={toggleFacet}
            showClear={activeFacetCount(facets) > 0}
            clearCount={activeFacetCount(facets)}
            onClear={clearFilters}
          />
          <PriceListList
            rows={filtered}
            total={views.length}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
            sortAsc={sortAsc}
            onToggleSort={() => setSortAsc((s) => !s)}
            hasFilters={hasFilters}
            onClearFilters={clearFilters}
          />
          <PriceListDetail
            priceList={selected}
            customers={detailCustomers}
            detailLoading={detailsLoading}
            onEdit={(t) => setTariffForm({ id: t.id, name: t.name, active: t.active })}
            onDuplicate={(t) => duplicateMut.mutate(t)}
            onDelete={async (t) => {
              const ok = await confirm({
                title: 'Eliminar tarifa',
                message: `¿Eliminar la tarifa "${t.name}"? Los clientes que la usen quedarán sin tarifa.`,
                confirmLabel: 'Eliminar',
                danger: true,
              });
              if (ok) removeMut.mutate(t.id);
            }}
            onAddProduct={() => setItemForm({ productId: null, productName: null, price: '' })}
            onEditItem={(productId, productName, price) =>
              setItemForm({ productId, productName, price: String(price) })
            }
            onRemoveItem={async (productId, name) => {
              if (!selected) return;
              const ok = await confirm({
                title: 'Quitar producto',
                message: `¿Quitar "${name}" de la tarifa "${selected.name}"?`,
                confirmLabel: 'Quitar',
                danger: true,
              });
              if (ok) removeItemMut.mutate({ listId: selected.id, productId });
            }}
          />
        </div>
      </div>

      {tariffForm && (
        <Modal
          onClose={() => setTariffForm(null)}
          className="modal--form"
          testId="b2b-pricelist-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (tariffForm.name.trim()) saveTariffMut.mutate(tariffForm);
          }}
        >
          <header className="modal-head">
            <h3>{tariffForm.id ? 'Editar tarifa' : 'Nueva tarifa'}</h3>
          </header>
          <div className="modal-body">
            <section className="form-section">
              <label>
                Nombre
                <Input
                  required
                  autoFocus
                  placeholder="Mayorista, distribuidor…"
                  value={tariffForm.name}
                  onChange={(e) => setTariffForm({ ...tariffForm, name: e.target.value })}
                  data-testid="b2b-pricelist-name"
                />
              </label>
            </section>
          </div>
          {saveTariffMut.isError && (
            <p className="form-error">
              {formErrorMessage(saveTariffMut.error, 'No se pudo guardar.')}
            </p>
          )}
          <div className="modal-foot modal-foot--split">
            {tariffForm.id ? (
              <div className="pl-form-left">
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={tariffForm.active}
                    onChange={(e) => setTariffForm({ ...tariffForm, active: e.target.checked })}
                  />
                  <span className="switch-track">
                    <span className="switch-thumb" />
                  </span>
                  <span className="switch-text">Tarifa activa</span>
                </label>
                <button
                  type="button"
                  className="pl-del-link"
                  data-testid="b2b-pricelist-delete"
                  onClick={async () => {
                    const id = tariffForm.id;
                    if (!id) return;
                    const ok = await confirm({
                      title: 'Eliminar tarifa',
                      message: `¿Eliminar la tarifa "${tariffForm.name}"? Los clientes que la usen quedarán sin tarifa.`,
                      confirmLabel: 'Eliminar',
                      danger: true,
                    });
                    if (ok) {
                      setTariffForm(null);
                      removeMut.mutate(id);
                    }
                  }}
                >
                  Eliminar tarifa
                </button>
              </div>
            ) : (
              <span />
            )}
            <div className="modal-foot-actions">
              <button type="button" onClick={() => setTariffForm(null)}>
                Cancelar
              </button>
              <Button
                type="submit"
                disabled={!tariffForm.name.trim() || saveTariffMut.isPending}
                data-testid="b2b-pricelist-save"
              >
                {saveTariffMut.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {itemForm && selected && (
        <Modal
          onClose={() => setItemForm(null)}
          className="modal--form"
          testId="b2b-pricelist-item-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSaveItem) {
              setItemMut.mutate({
                listId: selected.id,
                productId: itemForm.productId!,
                price: Number(itemForm.price),
              });
            }
          }}
        >
          <header className="modal-head">
            <h3>{itemForm.productName ? 'Editar precio' : 'Añadir producto'}</h3>
          </header>
          <div className="modal-body">
            <section className="form-section">
              {itemForm.productName ? (
                <label>
                  Producto
                  <Input value={itemForm.productName} disabled readOnly />
                </label>
              ) : (
                <div data-testid="b2b-pricelist-item-product">
                  <ProductPicker
                    value={itemForm.productId}
                    onChange={(id) => setItemForm({ ...itemForm, productId: id })}
                    excludeIds={excludeIds}
                    placeholder="Selecciona un producto…"
                  />
                </div>
              )}
              <label>
                Precio (€)
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  autoFocus={!!itemForm.productName}
                  placeholder="0,00"
                  value={itemForm.price}
                  onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })}
                  data-testid="b2b-pricelist-item-price"
                />
              </label>
            </section>
          </div>
          {setItemMut.isError && (
            <p className="form-error">
              {formErrorMessage(setItemMut.error, 'No se pudo guardar el precio.')}
            </p>
          )}
          <div className="modal-foot modal-foot-actions">
            <button type="button" onClick={() => setItemForm(null)}>
              Cancelar
            </button>
            <Button
              type="submit"
              disabled={!canSaveItem || setItemMut.isPending}
              data-testid="b2b-pricelist-item-save"
            >
              {setItemMut.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
