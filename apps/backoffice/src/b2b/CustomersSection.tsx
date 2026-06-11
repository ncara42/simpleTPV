import { DataTable, type DataTableColumn, Select } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { useState } from 'react';

import { useConfirm } from '../components/ConfirmProvider.js';
import { Modal } from '../components/Modal.js';
import { SectionToolbar } from '../components/SectionToolbar.js';
import { useToast } from '../components/ToastProvider.js';
import {
  createCustomer,
  type Customer,
  type CustomerInput,
  deleteCustomer,
  listCustomers,
  listPriceLists,
  updateCustomer,
} from '../lib/b2b.js';
import { formErrorMessage } from '../lib/form-error.js';

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

export function CustomersSection() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [form, setForm] = useState<Form | null>(null);

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
      toast(f.id ? 'Cliente actualizado' : 'Cliente creado', 'success');
    },
    onError: (e) => toast(formErrorMessage(e, 'No se pudo guardar el cliente'), 'error'),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => deleteCustomer(id),
    onSuccess: () => {
      invalidate();
      toast('Cliente eliminado', 'success');
    },
    onError: (e) => toast(formErrorMessage(e, 'No se pudo eliminar el cliente'), 'error'),
  });

  const tariffOptions = [
    { value: '', label: 'Sin tarifa (PVP)' },
    ...priceLists.map((p) => ({ value: p.id, label: p.name })),
  ];

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
    <div className="table-panel" data-testid="b2b-customers">
      <SectionToolbar
        actionLabel="Nuevo cliente"
        onAction={() => setForm({ ...EMPTY })}
        actionTestId="b2b-new-customer"
      >
        <span className="muted">
          {customers.length} cliente{customers.length !== 1 ? 's' : ''}
        </span>
      </SectionToolbar>

      <DataTable
        columns={customerColumns}
        rows={customers}
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
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  data-testid="b2b-customer-name"
                />
              </label>
              <label>
                NIF
                <input
                  value={form.nif}
                  onChange={(e) => setForm({ ...form, nif: e.target.value })}
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </label>
              <label>
                Teléfono
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </label>
              <label>
                Dirección
                <input
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
                <X size={16} aria-hidden="true" />
                Cancelar
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={!form.name.trim() || saveMut.isPending}
                data-testid="b2b-customer-save"
              >
                <Check size={16} aria-hidden="true" />
                {saveMut.isPending ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
