import type { Supplier } from '@simpletpv/auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { formErrorMessage } from '../lib/form-error.js';
import { createSupplier, deleteSupplier, listSuppliers, updateSupplier } from '../lib/purchases.js';
import { OrdersSection } from './OrdersSection.js';
import { SupplierPricesSection } from './SupplierPricesSection.js';

export function SuppliersSection() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [leadTime, setLeadTime] = useState('7');
  // Vista detalle (I-18/D-07): fila clicable → todo lo del proveedor en una vista.
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: listSuppliers,
  });
  const createMut = useMutation({
    mutationFn: createSupplier,
    onSuccess: () => {
      setName('');
      void qc.invalidateQueries({ queryKey: ['suppliers'] });
    },
  });
  const delMut = useMutation({
    mutationFn: deleteSupplier,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });

  const detail = detailId ? suppliers.find((s) => s.id === detailId) : null;
  if (detail) {
    return <SupplierDetail supplier={detail} onBack={() => setDetailId(null)} />;
  }

  return (
    <>
      <header className="catalog-head">
        <h2>Proveedores</h2>
        <div className="catalog-actions">
          <span className="search-field">
            <input
              className="catalog-search"
              placeholder="Nombre del proveedor"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="supplier-name"
            />
          </span>
          <input
            className="catalog-search"
            type="number"
            min={0}
            value={leadTime}
            onChange={(e) => setLeadTime(e.target.value)}
            title="Lead time (días)"
            data-testid="supplier-leadtime"
            style={{ width: '6rem' }}
          />
          <button
            type="button"
            className="btn-primary"
            disabled={!name || createMut.isPending}
            onClick={() => createMut.mutate({ name, leadTimeDays: Number(leadTime) })}
            data-testid="supplier-create"
          >
            Añadir
          </button>
        </div>
      </header>
      {isLoading ? (
        <p className="catalog-empty">Cargando…</p>
      ) : suppliers.length === 0 ? (
        <p className="catalog-empty" data-testid="suppliers-empty">
          Sin proveedores.
        </p>
      ) : (
        <table className="catalog-table" data-testid="suppliers-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Lead time</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              // Fila clicable → vista detalle (I-18); las acciones no propagan.
              <tr
                key={s.id}
                className="row-clickable"
                data-testid="supplier-row"
                onClick={() => setDetailId(s.id)}
              >
                <td>{s.name}</td>
                <td className="muted">{s.leadTimeDays} días</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => setDetailId(s.id)}
                    data-testid="supplier-open"
                  >
                    Ver
                  </button>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => delMut.mutate(s.id)}
                    data-testid="supplier-delete"
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

// Todo lo del proveedor en una vista (I-18/D-07): datos editables (PATCH
// /suppliers/:id), su tarifa de compra (con alta e import CSV) y sus pedidos.
function SupplierDetail({ supplier, onBack }: { supplier: Supplier; onBack: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: supplier.name,
    nif: supplier.nif ?? '',
    email: supplier.email ?? '',
    phone: supplier.phone ?? '',
    leadTimeDays: String(supplier.leadTimeDays),
  });
  const [saved, setSaved] = useState(false);
  const set = (patch: Partial<typeof form>): void => {
    setSaved(false);
    setForm((cur) => ({ ...cur, ...patch }));
  };
  const saveMut = useMutation({
    // Los campos vacíos no se envían: el DTO valida formato (p. ej. IsEmail) y
    // undefined significa "sin cambios".
    mutationFn: () =>
      updateSupplier(supplier.id, {
        name: form.name,
        ...(form.nif ? { nif: form.nif } : {}),
        ...(form.email ? { email: form.email } : {}),
        ...(form.phone ? { phone: form.phone } : {}),
        leadTimeDays: Number(form.leadTimeDays),
      }),
    onSuccess: () => {
      setSaved(true);
      void qc.invalidateQueries({ queryKey: ['suppliers'] });
    },
  });

  return (
    <div data-testid="supplier-detail">
      <header className="catalog-head">
        <div className="supplier-detail-title">
          <button type="button" className="link-btn" onClick={onBack} data-testid="supplier-back">
            ← Volver
          </button>
          <h2>{supplier.name}</h2>
        </div>
      </header>

      <form
        className="supplier-form"
        onSubmit={(e) => {
          e.preventDefault();
          saveMut.mutate();
        }}
      >
        <label>
          Nombre
          <input
            required
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            data-testid="sd-name"
          />
        </label>
        <label>
          NIF
          <input
            value={form.nif}
            onChange={(e) => set({ nif: e.target.value })}
            data-testid="sd-nif"
          />
        </label>
        <label>
          Email
          <input
            type="email"
            value={form.email}
            onChange={(e) => set({ email: e.target.value })}
            data-testid="sd-email"
          />
        </label>
        <label>
          Teléfono
          <input
            value={form.phone}
            onChange={(e) => set({ phone: e.target.value })}
            data-testid="sd-phone"
          />
        </label>
        <label>
          Lead time (días)
          <input
            type="number"
            min={0}
            required
            value={form.leadTimeDays}
            onChange={(e) => set({ leadTimeDays: e.target.value })}
            data-testid="sd-leadtime"
          />
        </label>
        <button
          type="submit"
          className="btn-primary"
          disabled={saveMut.isPending}
          data-testid="sd-save"
        >
          {saveMut.isPending ? 'Guardando…' : saved ? 'Guardado ✓' : 'Guardar'}
        </button>
      </form>
      {saveMut.isError && (
        <p className="form-error">
          {formErrorMessage(saveMut.error, 'No se pudo guardar el proveedor.')}
        </p>
      )}

      <h3 className="supplier-detail-h">Tarifa de compra</h3>
      <SupplierPricesSection fixedSupplierId={supplier.id} />

      <h3 className="supplier-detail-h">Pedidos de compra</h3>
      <OrdersSection supplierId={supplier.id} />
    </div>
  );
}
