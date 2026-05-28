import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { createStore, deleteStore, listStores } from './lib/admin.js';

interface StoreForm {
  name: string;
  address: string;
}

export function StoresPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<StoreForm | null>(null);

  const { data: stores = [], isLoading } = useQuery({
    queryKey: ['stores'],
    queryFn: listStores,
  });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['stores'] });

  const createMut = useMutation({
    mutationFn: (s: StoreForm) =>
      createStore(s.address ? { name: s.name, address: s.address } : { name: s.name }),
    onSuccess: () => {
      setForm(null);
      invalidate();
    },
  });
  const delMut = useMutation({
    mutationFn: (id: string) => deleteStore(id),
    onSuccess: invalidate,
  });

  return (
    <section className="catalog">
      <header className="catalog-head">
        <h2>Tiendas</h2>
        <button
          className="btn-primary"
          onClick={() => setForm({ name: '', address: '' })}
          data-testid="new-store"
        >
          Nueva tienda
        </button>
      </header>

      {isLoading ? (
        <p className="catalog-empty">Cargando…</p>
      ) : stores.length === 0 ? (
        <p className="catalog-empty" data-testid="stores-empty">
          Sin tiendas. Crea la primera.
        </p>
      ) : (
        <table className="catalog-table" data-testid="stores-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Dirección</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {stores.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td className="muted">{s.address ?? '—'}</td>
                <td className="row-actions">
                  <button className="danger" onClick={() => delMut.mutate(s.id)}>
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
            className="modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              createMut.mutate(form);
            }}
            data-testid="store-form"
          >
            <h3>Nueva tienda</h3>
            <label>
              Nombre
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                data-testid="store-name"
              />
            </label>
            <label>
              Dirección
              <input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </label>
            {createMut.isError && <p className="form-error">No se pudo crear.</p>}
            <div className="modal-foot">
              <button type="button" onClick={() => setForm(null)}>
                Cancelar
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={createMut.isPending}
                data-testid="store-save"
              >
                {createMut.isPending ? 'Guardando…' : 'Crear'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
