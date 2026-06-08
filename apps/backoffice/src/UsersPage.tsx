import { Select } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Modal } from './components/Modal.js';
import {
  createUser,
  deleteUser,
  listStores,
  listUsers,
  type NewUser,
  type User,
} from './lib/admin.js';
import { usePageHeader } from './lib/pageHeader.js';

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

interface EditWizard {
  queue: UserWithStores[];
  step: number;
}

interface UserWithStores extends User {
  storeIds: string[];
}

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Admin',
  MANAGER: 'Responsable',
  CLERK: 'Dependiente',
};

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

function toForm(u: UserWithStores): UserForm {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    password: '',
    role: u.role,
    storeIds: u.storeIds ?? [],
    active: u.active,
  };
}

export function UsersPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<UserForm | null>(null);
  // Modo asistente (edición en lote). null → alta de un usuario nuevo.
  const [wizard, setWizard] = useState<EditWizard | null>(null);
  // Filtros de la barra superior (espejo de la toolbar de stock).
  const [search, setSearch] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  // Selección múltiple por fila (ids marcados).
  const [selected, setSelected] = useState<string[]>([]);
  // Overlays locales (demo: no hay backend que persista los cambios).
  const [overrides, setOverrides] = useState<Record<string, Partial<UserWithStores>>>({});
  const [extras, setExtras] = useState<UserWithStores[]>([]);
  const [deleted, setDeleted] = useState<string[]>([]);

  const { data: users = [], isLoading } = useQuery({ queryKey: ['users'], queryFn: listUsers });
  const { data: stores = [] } = useQuery({ queryKey: ['stores'], queryFn: listStores });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['users'] });

  // Etiqueta de tiendas de un usuario, resuelta contra las tiendas reales (IT-09).
  const storeName = (id: string): string => stores.find((s) => s.id === id)?.name ?? id;
  const storesLabel = (role: Role, storeIds: string[]): string => {
    if (role === 'ADMIN') return 'Todas';
    return storeIds.length ? storeIds.map(storeName).join(', ') : '—';
  };

  const allUsers = useMemo<UserWithStores[]>(() => {
    const base = (users as UserWithStores[]).map((u) => ({ ...u, ...overrides[u.id] }));
    return [...base, ...extras].filter((u) => !deleted.includes(u.id));
  }, [users, overrides, extras, deleted]);

  // Búsqueda por nombre + filtro por tienda. Los ADMIN acceden a todas las
  // tiendas (storeIds vacío), así que aparecen en cualquier filtro de tienda.
  const filtered = useMemo<UserWithStores[]>(
    () =>
      allUsers.filter((u) => {
        if (search && !u.name.toLowerCase().includes(search.toLowerCase())) return false;
        if (storeFilter && u.role !== 'ADMIN' && !(u.storeIds ?? []).includes(storeFilter))
          return false;
        return true;
      }),
    [allUsers, search, storeFilter],
  );

  usePageHeader('Usuarios', `${allUsers.length} usuarios`, 'users-count');

  // ─── Selección ─────────────────────────────────────────────────────────
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const toggleSelect = (id: string): void =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const clearSelection = (): void => setSelected([]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((u) => selectedSet.has(u.id));
  const selectAllFiltered = (): void =>
    setSelected((prev) => [...new Set([...prev, ...filtered.map((u) => u.id)])]);

  // Usuarios seleccionados que siguen existiendo, en el orden de la lista.
  const selectedUsers = useMemo(
    () => allUsers.filter((u) => selectedSet.has(u.id)),
    [allUsers, selectedSet],
  );

  // ─── Mutaciones / overlays ─────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: async (f: UserForm): Promise<UserForm> => {
      await createUser({ name: f.name, email: f.email, password: f.password, role: f.role });
      return f;
    },
    onSuccess: (f) => {
      setExtras((prev) => [
        ...prev,
        {
          id: `u-${f.email}`,
          active: f.active,
          role: f.role,
          name: f.name,
          email: f.email,
          storeIds: f.role === 'ADMIN' ? [] : f.storeIds,
        },
      ]);
      closeModal();
      invalidate();
    },
  });

  // Aplica la edición de un usuario existente sobre los overlays locales.
  const applyEdit = (f: UserForm): void => {
    if (!f.id) return;
    const patch: Partial<UserWithStores> = {
      name: f.name,
      email: f.email,
      role: f.role,
      storeIds: f.role === 'ADMIN' ? [] : f.storeIds,
      active: f.active,
    };
    if (extras.some((u) => u.id === f.id)) {
      setExtras((prev) => prev.map((u) => (u.id === f.id ? { ...u, ...patch } : u)));
    } else {
      setOverrides((prev) => ({ ...prev, [f.id as string]: patch }));
    }
  };

  // Activa/desactiva un usuario desde su badge en la tabla, conservando el
  // resto del overlay local (demo: no hay backend que persista el cambio).
  const toggleActive = (id: string): void => {
    const current = allUsers.find((u) => u.id === id);
    if (!current) return;
    const active = !current.active;
    if (extras.some((u) => u.id === id)) {
      setExtras((prev) => prev.map((u) => (u.id === id ? { ...u, active } : u)));
    } else {
      setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], active } }));
    }
    invalidate();
  };

  // Borrado en lote en local (demo: deleteUser es un stub sin backend).
  const removeSelected = (): void => {
    const ids = new Set(selected);
    const extraIds = new Set(extras.map((e) => e.id));
    setExtras((prev) => prev.filter((u) => !ids.has(u.id)));
    setDeleted((prev) => [...prev, ...selected.filter((id) => !extraIds.has(id))]);
    selected.forEach((id) => void deleteUser(id));
    clearSelection();
    invalidate();
  };

  // ─── Modal ─────────────────────────────────────────────────────────────
  const closeModal = (): void => {
    setForm(null);
    setWizard(null);
  };

  const openCreate = (): void => {
    setWizard(null);
    setForm({ ...EMPTY });
  };

  const openBulkEdit = (): void => {
    const queue = selectedUsers;
    if (queue.length === 0) return;
    setWizard({ queue, step: 0 });
    setForm(toForm(queue[0]!));
  };

  const submitForm = (): void => {
    if (!form) return;
    if (wizard) {
      applyEdit(form);
      const next = wizard.step + 1;
      if (next < wizard.queue.length) {
        setWizard({ ...wizard, step: next });
        setForm(toForm(wizard.queue[next]!));
      } else {
        closeModal();
        clearSelection();
      }
      invalidate();
    } else {
      createMut.mutate(form);
    }
  };

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

  // Etiqueta del botón primario: "Siguiente (n / total)" mientras quedan
  // usuarios en la cola; "Guardar" en el último paso (o en alta/edición única).
  const total = wizard?.queue.length ?? 0;
  const step = wizard?.step ?? 0;
  const isLastStep = !wizard || step + 1 >= total;
  const primaryLabel = !wizard
    ? createMut.isPending
      ? 'Guardando…'
      : 'Crear'
    : total > 1 && !isLastStep
      ? `Siguiente (${step + 1} / ${total})`
      : total > 1
        ? `Guardar (${total} / ${total})`
        : 'Guardar';

  return (
    <section className="catalog">
      <div className="table-panel">
        <div className="users-toolbar">
          <div className="sales-filters">
            <span className="search-field">
              <input
                className="catalog-search"
                placeholder="Buscar por nombre…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="users-search"
              />
            </span>
            <Select
              className="catalog-search"
              value={storeFilter}
              onChange={setStoreFilter}
              ariaLabel="Filtrar por tienda"
              data-testid="users-store"
              options={[
                { value: '', label: 'Todas las tiendas' },
                ...stores.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
            {selected.length > 0 && (
              <>
                {!allFilteredSelected && (
                  <button
                    type="button"
                    className="users-sel-btn"
                    onClick={selectAllFiltered}
                    data-testid="users-select-all"
                  >
                    Seleccionar todo
                  </button>
                )}
                <button
                  type="button"
                  className="users-sel-btn"
                  onClick={clearSelection}
                  data-testid="users-clear"
                >
                  Quitar selección
                </button>
              </>
            )}
          </div>
          {selected.length > 0 ? (
            <div className="users-toolbar-actions">
              <button
                type="button"
                className="users-bulk-edit"
                onClick={openBulkEdit}
                data-testid="users-edit"
              >
                Editar{selected.length > 1 ? ` (${selected.length})` : ''}
              </button>
              <button
                type="button"
                className="users-bulk-del"
                onClick={removeSelected}
                data-testid="users-delete"
              >
                Borrar{selected.length > 1 ? ` (${selected.length})` : ''}
              </button>
            </div>
          ) : (
            <button className="btn-primary" onClick={openCreate} data-testid="new-user">
              Nuevo usuario
            </button>
          )}
        </div>

        {isLoading ? (
          <p className="catalog-empty">Cargando…</p>
        ) : filtered.length === 0 ? (
          <p className="catalog-empty" data-testid="users-empty">
            Sin usuarios para los filtros seleccionados.
          </p>
        ) : (
          <table
            className={`catalog-table users-table${selected.length ? ' has-selection' : ''}`}
            data-testid="users-table"
          >
            <thead>
              <tr>
                <th className="users-select-col" aria-label="Selección" />
                <th>Nombre</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Tiendas</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const isSel = selectedSet.has(u.id);
                return (
                  <tr
                    key={u.id}
                    className={isSel ? 'is-selected' : undefined}
                    aria-selected={isSel}
                    onClick={() => toggleSelect(u.id)}
                    data-testid="user-row"
                  >
                    <td className="users-select-col" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="user-check"
                        aria-label={`Seleccionar ${u.name}`}
                        data-testid="user-select"
                        checked={isSel}
                        onChange={() => toggleSelect(u.id)}
                      />
                    </td>
                    <td>{u.name}</td>
                    <td className="muted">{u.email}</td>
                    <td>
                      <span className="role-badge" data-testid="user-role-badge">
                        {ROLE_LABEL[u.role]}
                      </span>
                    </td>
                    <td className="muted">{storesLabel(u.role, u.storeIds ?? [])}</td>
                    <td>
                      <button
                        type="button"
                        className={`user-state ${u.active ? 'on' : 'off'}`}
                        title={
                          u.active
                            ? 'Activo — pulsa para desactivar'
                            : 'Inactivo — pulsa para activar'
                        }
                        aria-label={u.active ? 'Activo' : 'Inactivo'}
                        aria-pressed={u.active}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleActive(u.id);
                        }}
                      >
                        <Check
                          className="user-state__icon user-state__icon--on"
                          size={14}
                          strokeWidth={3}
                          aria-hidden="true"
                        />
                        <X
                          className="user-state__icon user-state__icon--off"
                          size={14}
                          strokeWidth={3}
                          aria-hidden="true"
                        />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {form && (
        <Modal
          onClose={closeModal}
          className="modal--form user-form"
          testId="user-form"
          onSubmit={(e) => {
            e.preventDefault();
            submitForm();
          }}
        >
          <header className="modal-head">
            <h3>{wizard ? 'Editar usuario' : 'Nuevo usuario'}</h3>
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
                {wizard ? 'Contraseña (opcional)' : 'Contraseña'}
                <input
                  type="password"
                  required={!wizard}
                  placeholder={wizard ? 'Dejar en blanco para mantener' : undefined}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  data-testid="user-password"
                />
              </label>
            </section>

            <section className="form-section">
              <span className="form-section-title">Rol</span>
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
            </section>

            <section className="form-section">
              <span className="form-section-title">Acceso a tiendas</span>
              {form.role === 'ADMIN' ? (
                <p className="user-stores-note">
                  Los administradores acceden a <strong>todas las tiendas</strong>.
                </p>
              ) : (
                <div className="store-chips" data-testid="user-stores">
                  {stores.map((s) => {
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

          {createMut.isError && <p className="form-error">No se pudo guardar.</p>}
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
              <button type="button" onClick={closeModal}>
                Cancelar
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={createMut.isPending}
                data-testid="user-save"
              >
                {primaryLabel}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
