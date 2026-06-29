import { Button, Input, Select } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Plus, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { sileo } from 'sileo';

import { useConfirm } from '../components/ConfirmProvider.js';
import { CsvDropzone } from '../components/CsvDropzone.js';
import { Modal } from '../components/Modal.js';
import {
  collectWholesaleOrder,
  createCustomer,
  type Customer,
  type CustomerInput,
  customerLedger,
  deleteCustomer,
  listCustomers,
  listPriceLists,
  listWholesaleOrders,
  updateCustomer,
} from '../lib/b2b.js';
import { exportRowsToCsv, importRowsViaCreate } from '../lib/csv.js';
import { formErrorMessage } from '../lib/form-error.js';
import { usePageActions } from '../lib/pageActions.js';
import {
  activeFacetCount,
  activeSavedView,
  applySavedView,
  type CustomerFacetState,
  type CustomerView,
  daysAgo,
  EMPTY_FACETS,
  type EstadoFilter,
  type FechaFilter,
  filterCustomers,
  mergeCustomers,
  paymentTermsLabel,
  type SaldoFilter,
  type SavedViewId,
  searchBase,
} from './customer-facets.js';
import { CustomerDetail } from './CustomerDetail.js';
import { CustomerFacets, type FacetGroupView } from './CustomerFacets.js';
import { CustomerList } from './CustomerList.js';

// Segmentos sugeridos para el formulario (chips). El modelo acepta cualquier
// etiqueta libre; estas son las habituales en el negocio mayorista.
const SEGMENT_OPTIONS = [
  'VIP',
  'HORECA',
  'Farmacia',
  'Retail',
  'Distribuidor',
  'Nuevo',
  'Riesgo',
] as const;

// Opciones de forma de pago (días de crédito). '' = contado.
const PAYMENT_TERM_OPTIONS = [
  { value: '', label: 'Contado' },
  { value: '15', label: '15 días' },
  { value: '30', label: '30 días' },
  { value: '60', label: '60 días' },
  { value: '90', label: '90 días' },
];

interface Form {
  id?: string;
  name: string;
  nif: string;
  email: string;
  phone: string;
  address: string;
  priceListId: string;
  tags: string[];
  paymentTerms: string;
  salesRep: string;
  creditLimit: string;
  active: boolean;
}

const EMPTY: Form = {
  name: '',
  nif: '',
  email: '',
  phone: '',
  address: '',
  priceListId: '',
  tags: [],
  paymentTerms: '',
  salesRep: '',
  creditLimit: '',
  active: true,
};

function toForm(c: Customer): Form {
  return {
    id: c.id,
    name: c.name,
    nif: c.nif ?? '',
    email: c.email ?? '',
    phone: c.phone ?? '',
    address: c.address ?? '',
    priceListId: c.priceListId ?? '',
    tags: c.tags ?? [],
    paymentTerms: c.paymentTerms === null ? '' : String(c.paymentTerms),
    salesRep: c.salesRep ?? '',
    creditLimit: c.creditLimit ?? '',
    active: c.active,
  };
}

function toInput(f: Form): CustomerInput {
  // exactOptionalPropertyTypes: omitimos las claves vacías en vez de pasar undefined.
  const input: CustomerInput = {
    name: f.name.trim(),
    priceListId: f.priceListId || null,
    tags: f.tags,
    paymentTerms: f.paymentTerms ? Number(f.paymentTerms) : null,
    creditLimit: f.creditLimit.trim() ? Number(f.creditLimit) : null,
    active: f.active,
  };
  if (f.nif.trim()) input.nif = f.nif.trim();
  if (f.email.trim()) input.email = f.email.trim();
  if (f.phone.trim()) input.phone = f.phone.trim();
  if (f.address.trim()) input.address = f.address.trim();
  if (f.salesRep.trim()) input.salesRep = f.salesRep.trim();
  return input;
}

export function CustomersSection() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const now = useMemo(() => Date.now(), []);

  const [form, setForm] = useState<Form | null>(null);
  const [importing, setImporting] = useState(false);
  const [facets, setFacets] = useState<CustomerFacetState>(EMPTY_FACETS);
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collectingId, setCollectingId] = useState<string | null>(null);

  const { data: customers = [] } = useQuery({
    queryKey: ['b2b-customers'],
    queryFn: listCustomers,
  });
  const { data: ledger = [] } = useQuery({
    queryKey: ['b2b-customer-ledger'],
    queryFn: customerLedger,
  });
  const { data: priceLists = [] } = useQuery({
    queryKey: ['b2b-pricelists'],
    queryFn: listPriceLists,
  });

  const views = useMemo(() => mergeCustomers(customers, ledger), [customers, ledger]);

  const invalidateAll = () => {
    void qc.invalidateQueries({ queryKey: ['b2b-customers'] });
    void qc.invalidateQueries({ queryKey: ['b2b-customer-ledger'] });
  };

  const saveMut = useMutation({
    mutationFn: (f: Form) => (f.id ? updateCustomer(f.id, toInput(f)) : createCustomer(toInput(f))),
    onSuccess: (saved, f) => {
      invalidateAll();
      setForm(null);
      setSelectedId(saved.id);
      sileo.success({ title: f.id ? 'Cliente actualizado' : 'Cliente creado' });
    },
    onError: (e) => sileo.error({ title: formErrorMessage(e, 'No se pudo guardar el cliente') }),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => deleteCustomer(id),
    onSuccess: (_data, id) => {
      invalidateAll();
      if (selectedId === id) setSelectedId(null);
      sileo.success({ title: 'Cliente eliminado' });
    },
    onError: (e) => sileo.error({ title: formErrorMessage(e, 'No se pudo eliminar el cliente') }),
  });

  // ── Selección + ficha ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const rows = filterCustomers(views, facets, now);
    const dir = sortAsc ? 1 : -1;
    return rows
      .slice()
      .sort((a, b) => (a.billed12m - b.billed12m) * dir || a.name.localeCompare(b.name));
  }, [views, facets, now, sortAsc]);

  // Totales de la cartera filtrada para las cards de resumen (espejo de los chips de Ventas).
  const summary = useMemo(
    () => ({
      billed: filtered.reduce((acc, c) => acc + c.billed12m, 0),
      balance: filtered.reduce((acc, c) => acc + c.balance, 0),
      overdue: filtered.reduce((acc, c) => acc + c.overdue, 0),
    }),
    [filtered],
  );

  const selected = useMemo(() => {
    if (selectedId) {
      const found = views.find((c) => c.id === selectedId);
      if (found) return found;
    }
    return filtered[0] ?? null;
  }, [selectedId, views, filtered]);

  const { data: ordersPage, isLoading: ordersLoading } = useQuery({
    queryKey: ['b2b-customer-orders', selected?.id],
    queryFn: () => listWholesaleOrders({ customerId: selected!.id }),
    enabled: !!selected,
  });

  const collectMut = useMutation({
    mutationFn: (orderId: string) => collectWholesaleOrder(orderId),
    onMutate: (orderId) => setCollectingId(orderId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['b2b-customer-orders'] });
      invalidateAll();
      sileo.success({ title: 'Cobro registrado' });
    },
    onError: (e) => sileo.error({ title: formErrorMessage(e, 'No se pudo registrar el cobro') }),
    onSettled: () => setCollectingId(null),
  });

  // ── Facetas + vistas guardadas ──────────────────────────────────────────────
  const base = useMemo(() => searchBase(views, facets.search), [views, facets.search]);
  const cnt = (pred: (c: CustomerView) => boolean) => base.filter(pred).length;

  const tags = useMemo(
    () => [...new Set(views.flatMap((c) => c.tags))].sort((a, b) => a.localeCompare(b)),
    [views],
  );

  const groups: FacetGroupView[] = [
    {
      key: 'estado',
      title: 'Estado',
      options: [
        { key: 'all', label: 'Todos', count: base.length, active: facets.estado === 'all' },
        {
          key: 'active',
          label: 'Activos',
          count: cnt((c) => c.active),
          active: facets.estado === 'active',
        },
        {
          key: 'inactive',
          label: 'Inactivos',
          count: cnt((c) => !c.active),
          active: facets.estado === 'inactive',
        },
      ],
    },
    ...(priceLists.length > 0
      ? [
          {
            key: 'tarifa',
            title: 'Tarifa',
            options: priceLists.map((p) => ({
              key: p.id,
              label: p.name,
              count: cnt((c) => c.priceListId === p.id),
              active: facets.tarifas.has(p.id),
            })),
          },
        ]
      : []),
    ...(tags.length > 0
      ? [
          {
            key: 'segmento',
            title: 'Segmento',
            options: tags.map((t) => ({
              key: t,
              label: t,
              count: cnt((c) => c.tags.includes(t)),
              active: facets.segmentos.has(t),
            })),
          },
        ]
      : []),
    {
      key: 'saldo',
      title: 'Saldo',
      options: [
        { key: 'all', label: 'Cualquiera', count: base.length, active: facets.saldo === 'all' },
        {
          key: 'con',
          label: 'Con saldo',
          count: cnt((c) => c.balance > 0),
          active: facets.saldo === 'con',
        },
        {
          key: 'vencido',
          label: 'Con vencido',
          count: cnt((c) => c.overdue > 0),
          active: facets.saldo === 'vencido',
        },
        {
          key: 'sin',
          label: 'Sin deuda',
          count: cnt((c) => c.balance === 0),
          active: facets.saldo === 'sin',
        },
      ],
    },
    {
      key: 'fecha',
      title: 'Último pedido',
      options: [
        { key: 'all', label: 'Cualquiera', count: base.length, active: facets.fecha === 'all' },
        {
          key: '30',
          label: 'Últimos 30 días',
          count: cnt((c) => c.lastOrderAt !== null && daysAgo(c.lastOrderAt, now) <= 30),
          active: facets.fecha === '30',
        },
        {
          key: '90',
          label: 'Últimos 90 días',
          count: cnt((c) => c.lastOrderAt !== null && daysAgo(c.lastOrderAt, now) <= 90),
          active: facets.fecha === '90',
        },
        {
          key: 'old',
          label: 'Sin pedido +6 meses',
          count: cnt((c) => c.lastOrderAt !== null && daysAgo(c.lastOrderAt, now) > 180),
          active: facets.fecha === 'old',
        },
        {
          key: 'none',
          label: 'Sin pedidos',
          count: cnt((c) => c.lastOrderAt === null),
          active: facets.fecha === 'none',
        },
      ],
    },
  ];

  const activeView = activeSavedView(facets);
  const savedViews = [
    { id: 'all' as SavedViewId, label: 'Todos', count: views.length },
    {
      id: 'deuda' as SavedViewId,
      label: 'Con deuda',
      count: views.filter((c) => c.balance > 0).length,
    },
    {
      id: 'vencido' as SavedViewId,
      label: 'Vencidos',
      count: views.filter((c) => c.overdue > 0).length,
    },
    {
      id: 'vip' as SavedViewId,
      label: 'VIP',
      count: views.filter((c) => c.tags.includes('VIP')).length,
    },
    {
      id: 'horeca' as SavedViewId,
      label: 'HORECA',
      count: views.filter((c) => c.tags.includes('HORECA')).length,
    },
    {
      id: 'inactivos' as SavedViewId,
      label: 'Inactivos',
      count: views.filter((c) => !c.active).length,
    },
  ].map((v) => ({ ...v, active: activeView === v.id }));

  const toggleFacet = (groupKey: string, optKey: string) => {
    setFacets((f) => {
      if (groupKey === 'estado') {
        return { ...f, estado: f.estado === optKey ? 'all' : (optKey as EstadoFilter) };
      }
      if (groupKey === 'saldo') {
        return { ...f, saldo: f.saldo === optKey ? 'all' : (optKey as SaldoFilter) };
      }
      if (groupKey === 'fecha') {
        return { ...f, fecha: f.fecha === optKey ? 'all' : (optKey as FechaFilter) };
      }
      const setKey = groupKey === 'tarifa' ? 'tarifas' : 'segmentos';
      const next = new Set(f[setKey]);
      if (next.has(optKey)) next.delete(optKey);
      else next.add(optKey);
      return { ...f, [setKey]: next };
    });
  };

  const clearFilters = () =>
    setFacets((f) => ({
      ...EMPTY_FACETS,
      search: f.search,
      tarifas: new Set(),
      segmentos: new Set(),
    }));

  // ── Acciones flotantes (export/import) ──────────────────────────────────────
  const filteredForExport = filtered;
  const handleExport = (): void => {
    const headers = [
      'Nombre',
      'NIF',
      'Contacto',
      'Tarifa',
      'Forma de pago',
      'Comercial',
      'Saldo',
      'Estado',
    ];
    const rows = filteredForExport.map((c) => [
      c.name,
      c.nif ?? '',
      c.email ?? c.phone ?? '',
      c.priceList?.name ?? 'PVP',
      paymentTermsLabel(c.paymentTerms),
      c.salesRep ?? '',
      String(c.balance),
      c.active ? 'Activo' : 'Inactivo',
    ]);
    exportRowsToCsv('clientes.csv', headers, rows);
  };

  const onImportCsv = (csv: string) =>
    importRowsViaCreate(
      csv,
      (row): CustomerInput => {
        const name = (row.nombre ?? row.name ?? '').trim();
        if (!name) throw new Error('Nombre vacío');
        return {
          name,
          ...(row.nif ? { nif: row.nif.trim() } : {}),
          ...(row.email ? { email: row.email.trim() } : {}),
        };
      },
      createCustomer,
    );

  usePageActions(
    <>
      <button
        type="button"
        className="float-action-btn"
        onClick={handleExport}
        aria-label="Exportar CSV"
        title="Exportar CSV"
        data-testid="b2b-customers-export"
      >
        <Download size={17} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="float-action-btn"
        onClick={() => setImporting(true)}
        aria-label="Importar CSV"
        title="Importar CSV"
        data-testid="b2b-customers-import"
      >
        <Upload size={17} aria-hidden="true" />
      </button>
      <Button
        onClick={() => setForm({ ...EMPTY })}
        data-testid="b2b-new-customer"
        icon={<Plus size={16} aria-hidden="true" />}
      >
        Nuevo cliente
      </Button>
    </>,
  );

  const tariffOptions = [
    { value: '', label: 'Sin tarifa (PVP)' },
    ...priceLists.map((p) => ({ value: p.id, label: p.name })),
  ];
  const orders = ordersPage?.items ?? [];

  const toggleTag = (tag: string) =>
    setForm((f) =>
      f === null
        ? f
        : { ...f, tags: f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag] },
    );

  return (
    <div className="b2b-customers-page">
      {/* Card full-bleed (como Ventas): solo el maestro-detalle de 3 columnas. Las
          sub-pestañas y el «Nuevo cliente» viven en la TopBar (pageNav + pageActions). */}
      <div className="cust-card">
        <div className="cust-layout">
          <CustomerFacets
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
          <CustomerList
            rows={filtered}
            total={views.length}
            summary={summary}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
            sortAsc={sortAsc}
            onToggleSort={() => setSortAsc((s) => !s)}
            now={now}
            hasFilters={activeFacetCount(facets) > 0 || facets.search.trim() !== ''}
            onClearFilters={() =>
              setFacets({ ...EMPTY_FACETS, tarifas: new Set(), segmentos: new Set() })
            }
          />
          <CustomerDetail
            customer={selected}
            orders={orders}
            ordersLoading={ordersLoading}
            collectingId={collectingId}
            onCollect={(id) => collectMut.mutate(id)}
            onEdit={(c) => setForm(toForm(c))}
            onDelete={async (c) => {
              const ok = await confirm({
                title: 'Eliminar cliente',
                message: `¿Eliminar el cliente "${c.name}"? Esta acción no se puede deshacer.`,
                confirmLabel: 'Eliminar',
                danger: true,
              });
              if (ok) removeMut.mutate(c.id);
            }}
            now={now}
          />
        </div>
      </div>

      {form && (
        <Modal
          onClose={() => setForm(null)}
          className="modal--form"
          testId="b2b-customer-form"
          onSubmit={(e) => {
            e.preventDefault();
            saveMut.mutate(form);
          }}
        >
          <header className="modal-head">
            <h3>{form.id ? 'Editar cliente' : 'Nuevo cliente'}</h3>
          </header>
          <div className="modal-body">
            <section className="form-section">
              <label>
                Nombre
                <Input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  data-testid="b2b-customer-name"
                />
              </label>
              <label>
                NIF
                <Input
                  value={form.nif}
                  onChange={(e) => setForm({ ...form, nif: e.target.value })}
                />
              </label>
              <label>
                Email
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </label>
              <label>
                Teléfono
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </label>
              <label>
                Dirección
                <Input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </label>
            </section>

            <section className="form-section">
              <span className="form-section-title">Comercial y segmentación</span>
              <label>
                Comercial asignado
                <Input
                  value={form.salesRep}
                  onChange={(e) => setForm({ ...form, salesRep: e.target.value })}
                  data-testid="b2b-customer-rep"
                />
              </label>
              <div className="cust-tag-picker" role="group" aria-label="Segmentos">
                {SEGMENT_OPTIONS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`cust-tag-chip${form.tags.includes(t) ? ' is-on' : ''}`}
                    aria-pressed={form.tags.includes(t)}
                    onClick={() => toggleTag(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </section>

            <section className="form-section">
              <span className="form-section-title">Tarifa y cobro</span>
              <label>
                Tarifa mayorista
                <Select
                  value={form.priceListId}
                  onChange={(v) => setForm({ ...form, priceListId: v })}
                  ariaLabel="Tarifa"
                  options={tariffOptions}
                  data-testid="b2b-customer-tariff"
                />
              </label>
              <label>
                Forma de pago
                <Select
                  value={form.paymentTerms}
                  onChange={(v) => setForm({ ...form, paymentTerms: v })}
                  ariaLabel="Forma de pago"
                  options={PAYMENT_TERM_OPTIONS}
                  data-testid="b2b-customer-terms"
                />
              </label>
              <label>
                Límite de crédito (€)
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="Sin límite"
                  value={form.creditLimit}
                  onChange={(e) => setForm({ ...form, creditLimit: e.target.value })}
                  data-testid="b2b-customer-credit"
                />
              </label>
            </section>
          </div>
          {saveMut.isError && (
            <p className="form-error">{formErrorMessage(saveMut.error, 'No se pudo guardar.')}</p>
          )}
          <div className="modal-foot modal-foot--split">
            <label className="switch">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              <span className="switch-track">
                <span className="switch-thumb" />
              </span>
              <span className="switch-text">Cliente activo</span>
            </label>
            <div className="modal-foot-actions">
              <button type="button" onClick={() => setForm(null)}>
                Cancelar
              </button>
              <Button
                type="submit"
                disabled={!form.name.trim() || saveMut.isPending}
                data-testid="b2b-customer-save"
              >
                {saveMut.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {importing && (
        <Modal
          onClose={() => setImporting(false)}
          className="modal--form"
          testId="b2b-customers-import-modal"
          ariaLabel="Importar clientes desde CSV"
        >
          <h3>Importar clientes desde CSV</h3>
          <CsvDropzone
            columns={['nombre', 'nif', 'email']}
            example={['Farmacia Centro', 'B12345678', 'pedidos@farmacia.com']}
            templateName="clientes"
            help={
              <>
                Columnas: <code>nombre,nif,email</code>. Solo <code>nombre</code> es obligatorio; la
                tarifa y la cartera se asignan después.
              </>
            }
            onImport={onImportCsv}
            onImported={invalidateAll}
            testId="b2b-customers-csv"
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
