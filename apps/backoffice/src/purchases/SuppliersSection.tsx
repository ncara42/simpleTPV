import type { Supplier } from '@simpletpv/auth';
import { Button, DataTable, Input } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { CsvActionButton } from '../components/CsvActionButton.js';
import { ImportExportModal } from '../components/ImportExportModal.js';
import { importRowsViaCreate } from '../lib/csv.js';
import { formErrorMessage } from '../lib/form-error.js';
import { usePageActions } from '../lib/pageActions.js';
import { createSupplier, deleteSupplier, listSuppliers, updateSupplier } from '../lib/purchases.js';
import { OrdersSection } from './OrdersSection.js';
import { SupplierFormModal } from './SupplierFormModal.js';
import { SupplierPricesSection } from './SupplierPricesSection.js';

export function SuppliersSection({ tabs }: { tabs?: ReactNode }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  // Modal unificado de Importar/Exportar proveedores (B-04): importar por CSV/XLSX
  // (alta en lote) o exportar los proveedores filtrados a CSV.
  const [dataModal, setDataModal] = useState<'import' | 'export' | null>(null);
  // Vista detalle (I-18/D-07): fila clicable → todo lo del proveedor en una vista.
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: listSuppliers,
  });
  const createMut = useMutation({
    mutationFn: createSupplier,
    onSuccess: () => {
      setCreating(false);
      void qc.invalidateQueries({ queryKey: ['suppliers'] });
    },
  });
  const delMut = useMutation({
    mutationFn: deleteSupplier,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });

  const detail = detailId ? suppliers.find((s) => s.id === detailId) : null;

  const term = search.trim().toLowerCase();
  const filtered = term ? suppliers.filter((s) => s.name.toLowerCase().includes(term)) : suppliers;

  // Exportación de proveedores: cabeceras + filas (filtradas en memoria) para el modal.
  const exportHeaders = ['Nombre', 'Lead time (días)'];
  const buildExportRows = (): string[][] => filtered.map((s) => [s.name, String(s.leadTimeDays)]);

  // Import por-fila (sin endpoint bulk): cada fila se da de alta con createSupplier.
  // mapRow LANZA si el nombre viene vacío para que se reporte como fila con error.
  const onImportCsv = (csv: string) =>
    importRowsViaCreate(
      csv,
      (row) => {
        const name = (row.nombre ?? row.name ?? '').trim();
        if (!name) throw new Error('Nombre vacío');
        return {
          name,
          leadTimeDays: Number(row.leadtimedias ?? row['lead time'] ?? row.leadtime ?? 7),
        };
      },
      createSupplier,
    );

  // Regla de hooks: usePageActions debe llamarse SIEMPRE, no tras el return de la vista detalle.
  // Las acciones (export/import) son del listado; en detalle se registra `null` (sin acciones).
  usePageActions(
    detail ? null : (
      <>
        <CsvActionButton
          kind="export"
          label="Exportar"
          onClick={() => setDataModal('export')}
          testId="suppliers-export"
        />
        <CsvActionButton
          kind="import"
          label="Importar"
          onClick={() => setDataModal('import')}
          testId="suppliers-import"
        />
      </>
    ),
  );

  if (detail) {
    return <SupplierDetail supplier={detail} onBack={() => setDetailId(null)} />;
  }

  return (
    <>
      {/* Fila clicable → vista detalle (I-18); las acciones no propagan (stopPropagation). */}
      <div className="table-panel">
        <DataTable
          data-testid="suppliers-table"
          rowTestId="supplier-row"
          rows={filtered}
          rowKey={(s) => s.id}
          loading={isLoading}
          rowClassName={() => 'row-clickable'}
          onRowClick={(s) => setDetailId(s.id)}
          header={
            <div className="dt-header-row">
              {tabs}
              <div className="dt-header-tools">
                <span className="search-field">
                  <Input
                    className="catalog-search"
                    placeholder="Buscar proveedor…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    data-testid="supplier-search"
                  />
                </span>
                <Button
                  type="button"
                  onClick={() => setCreating(true)}
                  data-testid="new-supplier"
                  icon={<Plus size={16} aria-hidden="true" />}
                >
                  Nuevo proveedor
                </Button>
              </div>
            </div>
          }
          emptyState={
            <span className="catalog-empty" data-testid="suppliers-empty">
              Sin proveedores.
            </span>
          }
          columns={[
            { key: 'name', header: 'Nombre', render: (s) => s.name },
            {
              key: 'leadTime',
              header: 'Lead time',
              render: (s) => <span className="muted">{s.leadTimeDays} días</span>,
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (s) => (
                <>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetailId(s.id);
                    }}
                    data-testid="supplier-open"
                  >
                    Ver
                  </button>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      delMut.mutate(s.id);
                    }}
                    data-testid="supplier-delete"
                  >
                    Eliminar
                  </button>
                </>
              ),
            },
          ]}
        />
      </div>
      {creating && (
        <SupplierFormModal
          onClose={() => setCreating(false)}
          onSubmit={(form) =>
            createMut.mutate({ name: form.name, leadTimeDays: Number(form.leadTimeDays) })
          }
          pending={createMut.isPending}
          error={
            createMut.isError
              ? formErrorMessage(createMut.error, 'No se pudo crear el proveedor.')
              : null
          }
        />
      )}
      {dataModal && (
        <ImportExportModal
          title="Proveedores"
          initialMode={dataModal}
          onClose={() => setDataModal(null)}
          testId="suppliers-data-modal"
          exportConfig={{
            headers: exportHeaders,
            getRows: buildExportRows,
            filenameBase: 'proveedores',
          }}
          importConfig={{
            columns: ['nombre', 'leadtimedias'],
            example: ['Distribuciones Norte', '7'],
            templateBase: 'proveedores',
            instructions: (
              <>
                Columnas: <code>nombre,leadtimedias</code>. Solo <code>nombre</code> es obligatorio.
                Lead time por defecto: 7 días.
              </>
            ),
            onImport: onImportCsv,
            onImported: () => {
              void qc.invalidateQueries({ queryKey: ['suppliers'] });
            },
          }}
        />
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
          <Input
            required
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            data-testid="sd-name"
          />
        </label>
        <label>
          NIF
          <Input
            value={form.nif}
            onChange={(e) => set({ nif: e.target.value })}
            data-testid="sd-nif"
          />
        </label>
        <label>
          Email
          <Input
            type="email"
            value={form.email}
            onChange={(e) => set({ email: e.target.value })}
            data-testid="sd-email"
          />
        </label>
        <label>
          Teléfono
          <Input
            value={form.phone}
            onChange={(e) => set({ phone: e.target.value })}
            data-testid="sd-phone"
          />
        </label>
        <label>
          Lead time (días)
          <Input
            type="number"
            min={0}
            required
            value={form.leadTimeDays}
            onChange={(e) => set({ leadTimeDays: e.target.value })}
            data-testid="sd-leadtime"
          />
        </label>
        <Button
          type="submit"
          className="supplier-save"
          disabled={saveMut.isPending}
          data-testid="sd-save"
        >
          {saveMut.isPending ? 'Guardando…' : saved ? 'Guardado ✓' : 'Guardar'}
        </Button>
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
