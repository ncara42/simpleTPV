import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { createStore, deleteStore, listStores } from './lib/admin.js';

interface StoreForm {
  name: string;
  code: string;
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
      createStore(
        s.address
          ? { name: s.name, code: s.code, address: s.address }
          : { name: s.name, code: s.code },
      ),
    onSuccess: () => {
      setForm(null);
      invalidate();
    },
  });
  // La eliminación se conserva en lib (deleteStore) para el futuro; el mockup de
  // Tiendas no muestra el botón Borrar en las cards.
  void deleteStore;

  return (
    <section className="catalog">
      <header className="catalog-head">
        <div>
          <h2>Tiendas</h2>
          <p className="catalog-sub">{stores.length} ubicaciones</p>
        </div>
        <button
          className="btn-primary"
          onClick={() => setForm({ name: '', code: '', address: '' })}
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
        <div className="store-grid" data-testid="stores-grid">
          {stores.map((s) => (
            <div className="store-card" key={s.id} data-testid="store-card">
              <span className="store-card-icon" aria-hidden="true">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 9l1-5h16l1 5" />
                  <path d="M4 9v11h16V9" />
                  <path d="M9 20v-6h6v6" />
                </svg>
              </span>
              <span className="store-card-text">
                <span className="store-card-name">{s.name}</span>
                <span className="store-card-addr">{s.address ?? '—'}</span>
              </span>
              <span className={`store-badge ${s.active ? 'active' : 'muted'}`}>
                {s.active ? 'Activa' : 'Almacén'}
              </span>
            </div>
          ))}
        </div>
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
              Código (p.ej. &quot;01&quot;)
              <input
                required
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                data-testid="store-code"
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
                disabled={createMut.isPending || !form.name.trim() || !form.code.trim()}
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
