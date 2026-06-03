import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { createSupplier, deleteSupplier, listSuppliers } from '../lib/purchases.js';

export function SuppliersSection() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [leadTime, setLeadTime] = useState('7');

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

  return (
    <>
      <header className="catalog-head">
        <h2>Proveedores</h2>
        <div className="catalog-actions">
          <input
            className="catalog-search"
            placeholder="Nombre del proveedor"
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="supplier-name"
          />
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
              <tr key={s.id} data-testid="supplier-row">
                <td>{s.name}</td>
                <td className="muted">{s.leadTimeDays} días</td>
                <td>
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
