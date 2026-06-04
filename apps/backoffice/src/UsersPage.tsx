import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { DEMO_STORES, type DemoUser, ROLE_LABEL } from './demo/demoData.js';
import { createUser, deleteUser, listUsers, type NewUser } from './lib/admin.js';

type Role = NewUser['role'];

interface UserForm {
  id?: string;
  name: string;
  email: string;
  password: string;
  role: Role;
  storeIds: string[];
  active: boolean;
}

const EMPTY: UserForm = {
  name: '',
  email: '',
  password: '',
  role: 'CLERK',
  storeIds: [],
  active: true,
};

// Opciones de rol para el control segmentado (mismo orden jerárquico que el badge).
const ROLES: { value: Role; label: string }[] = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'MANAGER', label: 'Responsable' },
  { value: 'CLERK', label: 'Dependiente' },
];

// Permisos por rol — visibles y auditables en la ficha (nada implícito). (#104)
const ROLE_PERMISSIONS: Record<Role, string[]> = {
  ADMIN: [
    'Acceso total al backoffice y la configuración',
    'Gestiona usuarios, tiendas, catálogo y precios',
    'Acceso a todas las tiendas',
  ],
  MANAGER: [
    'Gestiona las tiendas que tiene asignadas',
    'Ventas, stock, traspasos y arqueos de caja',
    'No gestiona usuarios ni la configuración global',
  ],
  CLERK: [
    'Operativa de venta en su tienda',
    'Consulta de stock y productos',
    'Sin acceso a configuración ni a otras tiendas',
  ],
};

function storeName(id: string): string {
  return DEMO_STORES.find((s) => s.id === id)?.name ?? id;
}

function storesLabel(role: Role, storeIds: string[]): string {
  if (role === 'ADMIN') return 'Todas';
  return storeIds.length ? storeIds.map(storeName).join(', ') : '—';
}

export function UsersPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<UserForm | null>(null);
  // Overlays locales (demo: no hay backend que persista los cambios).
  const [overrides, setOverrides] = useState<Record<string, Partial<DemoUser>>>({});
  const [extras, setExtras] = useState<DemoUser[]>([]);

  const { data: users = [], isLoading } = useQuery({ queryKey: ['users'], queryFn: listUsers });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['users'] });

  const allUsers = useMemo<DemoUser[]>(() => {
    const base = (users as DemoUser[]).map((u) => ({ ...u, ...overrides[u.id] }));
    return [...base, ...extras];
  }, [users, overrides, extras]);

  const saveMut = useMutation({
    mutationFn: async (f: UserForm): Promise<{ form: UserForm; mode: 'edit' | 'create' }> => {
      const exists =
        (users as DemoUser[]).some((u) => u.id === f.id) || extras.some((u) => u.id === f.id);
      if (f.id && exists) return { form: f, mode: 'edit' };
      await createUser({ name: f.name, email: f.email, password: f.password, role: f.role });
      return { form: f, mode: 'create' };
    },
    onSuccess: ({ form: f, mode }) => {
      const patch: Partial<DemoUser> = {
        name: f.name,
        email: f.email,
        role: f.role,
        storeIds: f.role === 'ADMIN' ? [] : f.storeIds,
        active: f.active,
      };
      if (mode === 'edit' && f.id) {
        if (extras.some((u) => u.id === f.id)) {
          setExtras((prev) => prev.map((u) => (u.id === f.id ? { ...u, ...patch } : u)));
        } else {
          setOverrides((prev) => ({ ...prev, [f.id as string]: patch }));
        }
      } else {
        setExtras((prev) => [
          ...prev,
          {
            id: `u-${f.email}`,
            active: f.active,
            role: f.role,
            name: f.name,
            email: f.email,
            storeIds: patch.storeIds ?? [],
          },
        ]);
      }
      setForm(null);
      invalidate();
    },
  });

  // La eliminación se conserva en lib (deleteUser) para el futuro.
  void deleteUser;

  const openCreate = (): void => setForm({ ...EMPTY });
  const openEdit = (u: DemoUser): void =>
    setForm({
      id: u.id,
      name: u.name,
      email: u.email,
      password: '',
      role: u.role,
      storeIds: u.storeIds ?? [],
      active: u.active,
    });

  const toggleStore = (id: string): void =>
    setForm((f) =>
      f
        ? {
            ...f,
            storeIds: f.storeIds.includes(id)
              ? f.storeIds.filter((s) => s !== id)
              : [...f.storeIds, id],
          }
        : f,
    );

  const isEdit = Boolean(form?.id);

  return (
    <section className="catalog">
      <header className="catalog-head">
        <div>
          <h2>Usuarios</h2>
          <p className="catalog-sub" data-testid="users-count">
            {allUsers.length} usuarios
          </p>
        </div>
        <button className="btn-primary" onClick={openCreate} data-testid="new-user">
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
              <th>Tiendas</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {allUsers.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td className="muted">{u.email}</td>
                <td>
                  <span className="role-badge" data-testid="user-role-badge">
                    {ROLE_LABEL[u.role]}
                  </span>
                </td>
                <td className="muted">{storesLabel(u.role, u.storeIds ?? [])}</td>
                <td>
                  <span className={`user-state ${u.active ? 'on' : 'off'}`}>
                    {u.active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="row-actions">
                  <button onClick={() => openEdit(u)} data-testid="user-edit">
                    Editar
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
            className="modal modal--form user-form"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              saveMut.mutate(form);
            }}
            data-testid="user-form"
          >
            <header className="modal-head">
              <h3>{isEdit ? 'Editar usuario' : 'Nuevo usuario'}</h3>
            </header>

            <div className="modal-body">
              <section className="form-section">
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
                <label>
                  {isEdit ? 'Contraseña (opcional)' : 'Contraseña'}
                  <input
                    type="password"
                    required={!isEdit}
                    placeholder={isEdit ? 'Dejar en blanco para mantener' : undefined}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    data-testid="user-password"
                  />
                </label>
              </section>

              <section className="form-section">
                <span className="form-section-title">Rol y permisos</span>
                <div
                  className="role-segment"
                  role="radiogroup"
                  aria-label="Rol"
                  data-testid="user-role"
                >
                  {ROLES.map((r) => (
                    <button
                      type="button"
                      key={r.value}
                      role="radio"
                      aria-checked={form.role === r.value}
                      className={`role-seg ${form.role === r.value ? 'is-active' : ''}`}
                      onClick={() => setForm({ ...form, role: r.value })}
                      data-testid={`user-role-${r.value}`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                <div className="role-perms" data-testid="role-permissions">
                  <span className="role-perms-title">Permisos de {ROLE_LABEL[form.role]}</span>
                  <ul>
                    {ROLE_PERMISSIONS[form.role].map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              </section>

              <section className="form-section">
                <span className="form-section-title">Acceso a tiendas</span>
                {form.role === 'ADMIN' ? (
                  <p className="user-stores-note">
                    Los administradores acceden a <strong>todas las tiendas</strong>.
                  </p>
                ) : (
                  <div className="store-chips" data-testid="user-stores">
                    {DEMO_STORES.map((s) => {
                      const on = form.storeIds.includes(s.id);
                      return (
                        <button
                          type="button"
                          key={s.id}
                          aria-pressed={on}
                          className={`store-chip ${on ? 'is-on' : ''}`}
                          onClick={() => toggleStore(s.id)}
                          data-testid={`user-store-${s.id}`}
                        >
                          {s.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>

            {saveMut.isError && <p className="form-error">No se pudo guardar.</p>}
            <div className="modal-foot modal-foot--split">
              <label className="switch">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  data-testid="user-active"
                />
                <span className="switch-track">
                  <span className="switch-thumb" />
                </span>
                <span className="switch-text">Usuario activo</span>
              </label>
              <div className="modal-foot-actions">
                <button type="button" onClick={() => setForm(null)}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={saveMut.isPending}
                  data-testid="user-save"
                >
                  {saveMut.isPending ? 'Guardando…' : isEdit ? 'Guardar' : 'Crear'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
