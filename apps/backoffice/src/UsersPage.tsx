import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ROLE_LABEL } from './demo/demoData.js';
import { createUser, deleteUser, listUsers, type NewUser } from './lib/admin.js';

const EMPTY: NewUser = { email: '', name: '', password: '', role: 'CLERK' };

export function UsersPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<NewUser | null>(null);

  const { data: users = [], isLoading } = useQuery({ queryKey: ['users'], queryFn: listUsers });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['users'] });

  const createMut = useMutation({
    mutationFn: (u: NewUser) => createUser(u),
    onSuccess: () => {
      setForm(null);
      invalidate();
    },
  });
  // Edición de usuario no implementada en el MVP; el botón "Editar" reabre el
  // form vacío. La eliminación se conserva en lib (deleteUser) para el futuro.
  void deleteUser;

  return (
    <section className="catalog">
      <header className="catalog-head">
        <div>
          <h2>Usuarios</h2>
          <p className="catalog-sub" data-testid="users-count">
            {users.length} usuarios
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => setForm({ ...EMPTY })}
          data-testid="new-user"
        >
          Nuevo usuario
        </button>
      </header>

      {isLoading ? (
        <p className="catalog-empty">Cargando…</p>
      ) : (
        <table className="catalog-table" data-testid="users-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Rol</th>
              <th>Tienda</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td className="muted">{u.email}</td>
                <td>
                  <span className="role-badge" data-testid="user-role-badge">
                    {ROLE_LABEL[u.role]}
                  </span>
                </td>
                <td className="muted">{(u as { storeName?: string }).storeName ?? '—'}</td>
                <td className="row-actions">
                  <button onClick={() => setForm({ ...EMPTY })}>Editar</button>
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
            data-testid="user-form"
          >
            <h3>Nuevo usuario</h3>
            <label>
              Nombre
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                data-testid="user-name"
              />
            </label>
            <label>
              Email
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                data-testid="user-email"
              />
            </label>
            <div className="modal-row">
              <label>
                Contraseña
                <input
                  type="password"
                  required
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  data-testid="user-password"
                />
              </label>
              <label>
                Rol
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as NewUser['role'] })}
                  data-testid="user-role"
                >
                  <option value="ADMIN">ADMIN</option>
                  <option value="MANAGER">MANAGER</option>
                  <option value="CLERK">CLERK</option>
                </select>
              </label>
            </div>
            {createMut.isError && <p className="form-error">No se pudo crear.</p>}
            <div className="modal-foot">
              <button type="button" onClick={() => setForm(null)}>
                Cancelar
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={createMut.isPending}
                data-testid="user-save"
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
