import {
  Button,
  type DataTableColumn,
  type FacetedColumn,
  FacetedTable,
  type FacetSection,
  Input,
} from '@simpletpv/ui';
import { usePageHeader } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Plus, SlidersHorizontal, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { CsvActionButton } from './components/CsvActionButton.js';
import { FacetRail } from './components/FacetRail.js';
import { ImportExportModal } from './components/ImportExportModal.js';
import { Modal } from './components/Modal.js';
import { ScrollShadowCell } from './components/ScrollShadowCell.js';
import { useTableColumns } from './components/useTableColumns.js';
import {
  assignUserStores,
  createUser,
  deleteUser,
  importUsersCsv,
  listStores,
  listUsers,
  type NewUser,
  updateUser,
  type User,
} from './lib/admin.js';
import { formErrorMessage } from './lib/form-error.js';
import { usePageActions } from './lib/pageActions.js';

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
  // Modal unificado de Importar/Exportar equipo (B-04).
  const [dataModal, setDataModal] = useState<'import' | 'export' | null>(null);
  // Roles plegados (key = rol): cabeceras de grupo plegables.
  const [collapsedRoles, setCollapsedRoles] = useState<ReadonlySet<string>>(new Set());
  const toggleGroup = (key: string): void =>
    setCollapsedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  // Facetas del carril: búsqueda por nombre + rol/tienda en multi-selección (vacío = todos).
  const [search, setSearch] = useState('');
  const [roleSet, setRoleSet] = useState<ReadonlySet<string>>(new Set());
  const [storeSet, setStoreSet] = useState<ReadonlySet<string>>(new Set());
  const toggleInSet = (set: ReadonlySet<string>, key: string): Set<string> => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };
  // Selección múltiple por fila (ids marcados).
  const [selected, setSelected] = useState<string[]>([]);

  const { data: users = [], isLoading } = useQuery({ queryKey: ['users'], queryFn: listUsers });
  const { data: stores = [] } = useQuery({ queryKey: ['stores'], queryFn: listStores });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['users'] });

  // Etiqueta de tiendas de un usuario, resuelta contra las tiendas reales (IT-09).
  const storeName = (id: string): string => stores.find((s) => s.id === id)?.name ?? id;
  const storesLabel = (role: Role, storeIds: string[]): string => {
    if (role === 'ADMIN') return 'Todas';
    return storeIds.length ? storeIds.map(storeName).join(', ') : '—';
  };

  const allUsers = useMemo<UserWithStores[]>(
    () => users.map((u) => ({ ...u, storeIds: u.storeIds ?? [] })),
    [users],
  );

  // Conjunto tras la búsqueda (alimenta los recuentos de las facetas).
  const searched = useMemo<UserWithStores[]>(
    () => allUsers.filter((u) => !search || u.name.toLowerCase().includes(search.toLowerCase())),
    [allUsers, search],
  );

  // Búsqueda + rol + tienda (multi). Los ADMIN acceden a todas las tiendas (storeIds
  // vacío), así que entran en cualquier filtro de tienda.
  const filtered = useMemo<UserWithStores[]>(
    () =>
      searched.filter((u) => {
        if (roleSet.size > 0 && !roleSet.has(u.role)) return false;
        if (
          storeSet.size > 0 &&
          u.role !== 'ADMIN' &&
          !(u.storeIds ?? []).some((s) => storeSet.has(s))
        )
          return false;
        return true;
      }),
    [searched, roleSet, storeSet],
  );

  // Secciones del carril: Rol (checks) + Tienda (checks), con recuentos sobre `searched`.
  const railSections = useMemo<FacetSection[]>(
    () => [
      {
        kind: 'checks',
        title: 'Rol',
        options: ROLES.map((r) => ({
          key: r.value,
          label: r.label,
          count: searched.filter((u) => u.role === r.value).length,
        })),
        selected: roleSet,
        onToggle: (key) => setRoleSet((prev) => toggleInSet(prev, key)),
        testIdPrefix: 'users-role',
      },
      {
        kind: 'checks',
        title: 'Tienda',
        options: stores.map((s) => ({
          key: s.id,
          label: s.name,
          count: searched.filter((u) => u.role === 'ADMIN' || (u.storeIds ?? []).includes(s.id))
            .length,
        })),
        selected: storeSet,
        onToggle: (key) => setStoreSet((prev) => toggleInSet(prev, key)),
        testIdPrefix: 'users-store',
      },
    ],
    [searched, roleSet, storeSet, stores],
  );

  usePageHeader('Usuarios', `${allUsers.length} usuarios`, 'users-count');

  // Exportación del equipo: cabeceras + filas (filtradas en memoria) para el modal.
  const exportHeaders = ['Nombre', 'Email', 'Rol', 'Tiendas', 'Estado'];
  const buildExportRows = (): string[][] => {
    const storesCsv = (role: Role, storeIds: string[]): string =>
      role === 'ADMIN' ? 'Todas' : storeIds.map(storeName).join('; ');
    return filtered.map((u) => [
      u.name,
      u.email,
      ROLE_LABEL[u.role],
      storesCsv(u.role, u.storeIds ?? []),
      u.active ? 'Activo' : 'Inactivo',
    ]);
  };

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

  // ─── Mutaciones (persistencia real; la tabla se refresca por invalidate) ──
  const createMut = useMutation({
    mutationFn: async (f: UserForm): Promise<void> => {
      const created = await createUser({
        name: f.name,
        email: f.email,
        password: f.password,
        role: f.role,
      });
      // El alta no acepta estos campos: se aplican justo después de crear.
      if (!f.active) await updateUser(created.id, { active: false });
      if (f.role !== 'ADMIN' && f.storeIds.length > 0) {
        await assignUserStores(created.id, f.storeIds);
      }
    },
    onSuccess: () => {
      closeModal();
      invalidate();
    },
  });

  // Edita un usuario existente (datos + tiendas); el refetch refleja el cambio.
  const applyEdit = (f: UserForm): void => {
    if (!f.id) return;
    const id = f.id;
    void Promise.all([
      updateUser(id, {
        name: f.name,
        email: f.email,
        role: f.role,
        active: f.active,
        ...(f.password ? { password: f.password } : {}),
      }),
      assignUserStores(id, f.role === 'ADMIN' ? [] : f.storeIds),
    ]).then(invalidate);
  };

  // Activa/desactiva un usuario desde su badge en la tabla.
  const toggleActive = (id: string): void => {
    const current = allUsers.find((u) => u.id === id);
    if (!current) return;
    void updateUser(id, { active: !current.active }).then(invalidate);
  };

  // Borrado en lote: se refresca cuando terminan todos los DELETE.
  const removeSelected = (): void => {
    void Promise.all(selected.map((id) => deleteUser(id))).then(invalidate);
    clearSelection();
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

  // Columnas del DataTable (D-12: las cinco visibles por defecto); la de
  // selección va fija fuera de la configuración.
  const dataColumns: DataTableColumn<UserWithStores>[] = [
    { key: 'name', header: 'Nombre', sortable: true },
    { key: 'email', header: 'Email', render: (u) => <span className="muted">{u.email}</span> },
    {
      key: 'role',
      header: 'Rol',
      render: (u) => (
        <span className="role-badge" data-testid="user-role-badge">
          {ROLE_LABEL[u.role]}
        </span>
      ),
    },
    {
      key: 'stores',
      header: 'Tiendas',
      // B-09: la lista de tiendas puede ser larga y, sin acotar, envolvía e inflaba
      // el alto de fila (Personal en tablet). Se trunca con elipsis + tooltip y se
      // oculta en pantallas estrechas (la columna menos crítica en móvil).
      hideOnNarrow: true,
      render: (u) => {
        const label = storesLabel(u.role, u.storeIds ?? []);
        return (
          <span className="muted dt-cell-truncate" title={label}>
            {label}
          </span>
        );
      },
    },
    {
      key: 'active',
      header: 'Estado',
      render: (u) => (
        <button
          type="button"
          className={`user-state ${u.active ? 'on' : 'off'}`}
          title={u.active ? 'Activo — pulsa para desactivar' : 'Inactivo — pulsa para activar'}
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
      ),
    },
  ];
  const {
    effectiveColumns,
    editor: columnsEditor,
    editorOpen: columnsEditorOpen,
    toggleEditor: toggleColumnsEditor,
  } = useTableColumns('table.users.columns', dataColumns, {
    editorTestId: 'users-columns-editor',
    title: 'Columnas de usuarios',
  });
  // Mapea las columnas efectivas (DataTableColumn del editor) a FacetedColumn: el
  // nombre es la columna 'name' (indentada/bold; aloja el checkbox de selección),
  // el estado va a la derecha ('num') y el resto 'mid'. El checkbox lo pinta la
  // tabla (selectable) dentro de la celda de nombre.
  const variantOf = (key: string): 'name' | 'num' | 'mid' =>
    key === 'name' ? 'name' : key === 'active' ? 'num' : 'mid';
  const facetedColumns: FacetedColumn<UserWithStores>[] = effectiveColumns.map((c) => ({
    key: c.key,
    header: c.header,
    variant: variantOf(c.key),
    render: (u: UserWithStores) =>
      c.render ? c.render(u, 0) : String((u as unknown as Record<string, unknown>)[c.key] ?? ''),
  }));

  // Grupos por rol (jerárquico: Admin → Responsable → Dependiente); usuarios
  // ordenados por nombre dentro de cada grupo. El rol sigue visible por fila.
  const groups = (['ADMIN', 'MANAGER', 'CLERK'] as Role[])
    .map((role) => ({
      role,
      rows: filtered.filter((u) => u.role === role).sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter((g) => g.rows.length > 0)
    .map((g) => ({
      key: g.role,
      label: ROLE_LABEL[g.role],
      meta: `${g.rows.length} ${g.rows.length === 1 ? 'usuario' : 'usuarios'}`,
      rows: g.rows,
    }));

  // Acciones de la TopBar: con selección, acciones en lote (Editar/Borrar/Quitar);
  // sin selección, exportar/importar/columnas + alta (no hay toolbar en la card).
  usePageActions(
    selected.length > 0 ? (
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
      </>
    ) : (
      <>
        <CsvActionButton
          kind="export"
          label="Exportar"
          onClick={() => setDataModal('export')}
          testId="users-export"
        />
        <CsvActionButton
          kind="import"
          label="Importar"
          onClick={() => setDataModal('import')}
          testId="users-import"
        />
        <button
          type="button"
          className={`float-action-btn${columnsEditorOpen ? ' is-active' : ''}`}
          onClick={toggleColumnsEditor}
          aria-label="Ajustar columnas"
          title="Columnas"
          aria-expanded={columnsEditorOpen}
          data-testid="users-columns-toggle"
        >
          <SlidersHorizontal size={17} aria-hidden="true" />
        </button>
        <Button
          onClick={openCreate}
          data-testid="new-user"
          icon={<Plus size={16} aria-hidden="true" />}
        >
          Nuevo usuario
        </Button>
      </>
    ),
  );

  return (
    <section className="catalog catalog--faceted">
      {columnsEditor}

      <div className="inv-card">
        <div className="cat-layout">
          <FacetRail
            ariaLabel="Filtros de usuarios"
            testId="users-facets"
            search={{
              value: search,
              onChange: setSearch,
              placeholder: 'Buscar por nombre…',
              testId: 'users-search',
            }}
            sections={railSections}
          />
          <ScrollShadowCell className="cat-main" data-testid="users-table">
            <FacetedTable<UserWithStores>
              layout="table"
              columns={facetedColumns}
              groups={groups}
              rowKey={(u) => u.id}
              loading={isLoading}
              selectable
              selectedKeys={selectedSet}
              onToggleSelect={toggleSelect}
              selectTestId="user-select"
              selectAriaLabel={(u) => `Seleccionar ${u.name}`}
              collapsedKeys={collapsedRoles}
              onToggleGroup={toggleGroup}
              rowTestId="user-row"
              emptyState={
                <span data-testid="users-empty">Sin usuarios para los filtros seleccionados.</span>
              }
            />
          </ScrollShadowCell>
        </div>
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
                <Input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  data-testid="user-name"
                />
              </label>
              <label>
                Email
                <Input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  data-testid="user-email"
                />
              </label>
              <label>
                {wizard ? 'Contraseña (opcional)' : 'Contraseña'}
                <Input
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

          {createMut.isError && (
            <p className="form-error">{formErrorMessage(createMut.error, 'No se pudo guardar.')}</p>
          )}
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
              <Button type="submit" disabled={createMut.isPending} data-testid="user-save">
                {primaryLabel}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {dataModal && (
        <ImportExportModal
          title="Equipo"
          initialMode={dataModal}
          onClose={() => setDataModal(null)}
          testId="users-data-modal"
          exportConfig={{
            headers: exportHeaders,
            getRows: buildExportRows,
            filenameBase: 'usuarios',
          }}
          importConfig={{
            columns: ['email', 'name', 'password', 'role'],
            example: ['nuevo@tienda.com', 'Nombre Apellido', 'contrasena8', 'CLERK'],
            templateBase: 'plantilla_usuarios',
            instructions: (
              <>
                Columnas: <code>email,name,password,role</code>. El rol es <code>ADMIN</code>,{' '}
                <code>MANAGER</code> o <code>CLERK</code>; la contraseña, mínimo 8 caracteres.
              </>
            ),
            onImport: importUsersCsv,
            onImported: invalidate,
          }}
        />
      )}
    </section>
  );
}
