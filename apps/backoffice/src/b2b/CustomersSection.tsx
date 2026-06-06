import { Select } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  createCustomer,
  type Customer,
  type CustomerInput,
  deleteCustomer,
  listCustomers,
  listPriceLists,
  updateCustomer,
} from '../lib/b2b.js';

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
    onSuccess: () => {
      invalidate();
      setForm(null);
    },
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => deleteCustomer(id),
    onSuccess: invalidate,
  });

  const tariffOptions = [
    { value: '', label: 'Sin tarifa (PVP)' },
    ...priceLists.map((p) => ({ value: p.id, label: p.name })),
  ];

  return (
    <div className="table-panel" data-testid="b2b-customers">
      <div className="users-toolbar">
        <div className="sales-filters">
          <span className="muted">
            {customers.length} cliente{customers.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          className="btn-primary"
          onClick={() => setForm({ ...EMPTY })}
          data-testid="b2b-new-customer"
        >
          Nuevo cliente
        </button>
      </div>

      {isLoading ? (
        <p className="catalog-empty">Cargando…</p>
      ) : customers.length === 0 ? (
        <p className="catalog-empty">Aún no hay clientes mayoristas. Crea el primero.</p>
      ) : (
        <table className="catalog-table" data-testid="b2b-customers-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>NIF</th>
              <th>Contacto</th>
              <th>Tarifa</th>
              <th>Estado</th>
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} data-testid="b2b-customer-row">
                <td>{c.name}</td>
                <td className="muted">{c.nif ?? '—'}</td>
                <td className="muted">{c.email ?? c.phone ?? '—'}</td>
                <td>{c.priceList?.name ?? <span className="muted">PVP</span>}</td>
                <td>
                  <span className="role-badge">{c.active ? 'Activo' : 'Inactivo'}</span>
                </td>
                <td>
                  <button type="button" className="link-btn" onClick={() => setForm(toForm(c))}>
                    Editar
                  </button>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => {
                      if (window.confirm(`¿Eliminar el cliente "${c.name}"?`))
                        removeMut.mutate(c.id);
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

      {form && (
        <div className="modal-backdrop" onClick={() => setForm(null)}>
          <form
            className="modal modal--form"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              saveMut.mutate(form);
            }}
            data-testid="b2b-customer-form"
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
            {saveMut.isError && <p className="form-error">No se pudo guardar.</p>}
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
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={!form.name.trim() || saveMut.isPending}
                  data-testid="b2b-customer-save"
                >
                  {saveMut.isPending ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
