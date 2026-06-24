import { Button, DataTable, type DataTableColumn, Input, Select } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Plus, Upload } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { sileo } from 'sileo';

import { useConfirm } from '../components/ConfirmProvider.js';
import { CsvDropzone } from '../components/CsvDropzone.js';
import { Modal } from '../components/Modal.js';
import { SectionToolbar } from '../components/SectionToolbar.js';
import {
  createCustomer,
  type Customer,
  type CustomerInput,
  deleteCustomer,
  listCustomers,
  listPriceLists,
  updateCustomer,
} from '../lib/b2b.js';
import { exportRowsToCsv, importRowsViaCreate } from '../lib/csv.js';
import { formErrorMessage } from '../lib/form-error.js';
import { usePageActions } from '../lib/pageActions.js';

interface Form {
  id?: string;
  name: string;
  nif: string;
  email: string;
  phone: string;
  address: string;
  priceListId: string;
  active: boolean;
}

const EMPTY: Form = {
  name: '',
  nif: '',
  email: '',
  phone: '',
  address: '',
  priceListId: '',
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
    active: c.active,
  };
}

function toInput(f: Form): CustomerInput {
  // exactOptionalPropertyTypes: omitimos las claves vacías en vez de pasar undefined.
  const input: CustomerInput = {
    name: f.name.trim(),
    priceListId: f.priceListId || null,
    active: f.active,
  };
  if (f.nif.trim()) input.nif = f.nif.trim();
  if (f.email.trim()) input.email = f.email.trim();
  if (f.phone.trim()) input.phone = f.phone.trim();
  if (f.address.trim()) input.address = f.address.trim();
  return input;
}

export function CustomersSection({ tabs }: { tabs?: ReactNode }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [form, setForm] = useState<Form | null>(null);
  const [search, setSearch] = useState('');
  // Modal de importación de clientes por CSV (alta en lote).
  const [importing, setImporting] = useState(false);

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['b2b-customers'],
    queryFn: listCustomers,
  });
  const { data: priceLists = [] } = useQuery({
    queryKey: ['b2b-pricelists'],
    queryFn: listPriceLists,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['b2b-customers'] });

  const saveMut = useMutation({
    mutationFn: (f: Form) => (f.id ? updateCustomer(f.id, toInput(f)) : createCustomer(toInput(f))),
    onSuccess: (_data, f) => {
      invalidate();
      setForm(null);
      sileo.success({ title: f.id ? 'Cliente actualizado' : 'Cliente creado' });
    },
    onError: (e) => sileo.error({ title: formErrorMessage(e, 'No se pudo guardar el cliente') }),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => deleteCustomer(id),
    onSuccess: () => {
      invalidate();
      sileo.success({ title: 'Cliente eliminado' });
    },
    onError: (e) => sileo.error({ title: formErrorMessage(e, 'No se pudo eliminar el cliente') }),
  });

  const tariffOptions = [
    { value: '', label: 'Sin tarifa (PVP)' },
    ...priceLists.map((p) => ({ value: p.id, label: p.name })),
  ];

  // Filtrado cliente-side sobre la lista ya cargada en memoria (nombre / NIF / contacto).
  const query = search.trim().toLowerCase();
  const filtered = query
    ? customers.filter((c) =>
        [c.name, c.nif, c.email, c.phone].some((field) =>
          (field ?? '').toLowerCase().includes(query),
        ),
      )
    : customers;

  // Exporta a CSV las filas actualmente filtradas en memoria.
  const handleExport = (): void => {
    const headers = ['Nombre', 'NIF', 'Contacto', 'Tarifa', 'Estado'];
    const rows = filtered.map((c) => [
      c.name,
      c.nif ?? '',
      c.email ?? c.phone ?? '',
      c.priceList?.name ?? 'PVP',
      c.active ? 'Activo' : 'Inactivo',
    ]);
    exportRowsToCsv('clientes.csv', headers, rows);
  };

  // Import por-fila (alta simple): nombre + NIF/email opcionales. La tarifa queda
  // por defecto (PVP); no se intenta resolver por nombre.
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

  // Export/Import viven en el clúster flotante (junto al conmutador Backoffice↔TPV),
  // no en una banda propia sobre la tabla. Se registran como acciones de la view.
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
    </>,
  );

  type CustomerRow = (typeof customers)[number];
  const customerColumns: DataTableColumn<CustomerRow>[] = [
    { key: 'name', header: 'Nombre', render: (c) => c.name },
    { key: 'nif', header: 'NIF', render: (c) => <span className="muted">{c.nif ?? '—'}</span> },
    {
      key: 'contact',
      header: 'Contacto',
      render: (c) => <span className="muted">{c.email ?? c.phone ?? '—'}</span>,
    },
    {
      key: 'tariff',
      header: 'Tarifa',
      render: (c) => c.priceList?.name ?? <span className="muted">PVP</span>,
    },
    {
      key: 'active',
      header: 'Estado',
      render: (c) => <span className="role-badge">{c.active ? 'Activo' : 'Inactivo'}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (c) => (
        <>
          <button type="button" className="link-btn" onClick={() => setForm(toForm(c))}>
            Editar
          </button>
          <button
            type="button"
            className="link-btn"
            onClick={async () => {
              const ok = await confirm({
                title: 'Eliminar cliente',
                message: `¿Eliminar el cliente "${c.name}"? Esta acción no se puede deshacer.`,
                confirmLabel: 'Eliminar',
                danger: true,
              });
              if (ok) removeMut.mutate(c.id);
            }}
          >
            Borrar
          </button>
        </>
      ),
    },
  ];

  return (
    <>
      <div className="table-panel" data-testid="b2b-customers">
        <div className="dt-header-row">
          {tabs}
          <SectionToolbar
            actionLabel="Nuevo cliente"
            onAction={() => setForm({ ...EMPTY })}
            actionTestId="b2b-new-customer"
            actionIcon={<Plus size={16} aria-hidden="true" />}
          >
            <span className="search-field">
              <Input
                className="catalog-search"
                placeholder="Buscar cliente…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="b2b-customers-search"
              />
            </span>
            <span className="muted">
              {filtered.length} cliente{filtered.length !== 1 ? 's' : ''}
            </span>
          </SectionToolbar>
        </div>

        <DataTable
          columns={customerColumns}
          rows={filtered}
          rowKey={(c) => c.id}
          loading={isLoading}
          rowTestId="b2b-customer-row"
          emptyState="Aún no hay clientes mayoristas. Crea el primero."
          data-testid="b2b-customers-table"
        />

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
                <span className="form-section-title">Tarifa mayorista</span>
                <Select
                  value={form.priceListId}
                  onChange={(v) => setForm({ ...form, priceListId: v })}
                  ariaLabel="Tarifa"
                  options={tariffOptions}
                  data-testid="b2b-customer-tariff"
                />
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
                  Columnas: <code>nombre,nif,email</code>. Solo <code>nombre</code> es obligatorio;
                  la tarifa se asigna después por defecto (PVP).
                </>
              }
              onImport={onImportCsv}
              onImported={() => qc.invalidateQueries({ queryKey: ['b2b-customers'] })}
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
    </>
  );
}
