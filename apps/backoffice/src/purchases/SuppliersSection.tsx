import './suppliers.css';

import type { Supplier } from '@simpletpv/auth';
import { Button, Input } from '@simpletpv/ui';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';

import { CsvActionButton } from '../components/CsvActionButton.js';
import { ImportExportModal } from '../components/ImportExportModal.js';
import { importRowsViaCreate } from '../lib/csv.js';
import { formErrorMessage } from '../lib/form-error.js';
import { usePageActions } from '../lib/pageActions.js';
import {
  createSupplier,
  deleteSupplier,
  listPurchaseOrders,
  listSuppliers,
  updateSupplier,
} from '../lib/purchases.js';
import { OrdersSection } from './OrdersSection.js';
import { SupplierFacets } from './SupplierFacets.js';
import { SupplierFormModal } from './SupplierFormModal.js';
import { SupplierPricesSection } from './SupplierPricesSection.js';
import {
  buildGroups,
  buildMetrics,
  computeFacetCounts,
  filterSuppliers,
  type LeadKey,
  type SavedView,
  type StatusKey,
  type SupplierFilters,
  type SupplierOrderLite,
} from './suppliers-view.js';
import { SuppliersGroupedTable } from './SuppliersGroupedTable.js';

const EMPTY_FILTERS: SupplierFilters = {
  view: 'all',
  status: new Set<StatusKey>(),
  lead: new Set<LeadKey>(),
};

// Toggle inmutable de un elemento en un Set de facetas (devuelve un Set nuevo).
function toggleIn<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export function SuppliersSection() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<SupplierFilters>(EMPTY_FILTERS);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // Modal unificado de Importar/Exportar proveedores (B-04).
  const [dataModal, setDataModal] = useState<'import' | 'export' | null>(null);
  // Vista detalle completa (I-18/D-07): edición + tarifa + pedidos. Se abre desde el
  // botón «Editar proveedor» del acordeón de la fila.
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: listSuppliers,
  });
  // Todos los pedidos de compra (clave compartida con OrdersSection a nivel de página):
  // alimentan las métricas por proveedor de la tabla agrupada.
  const { data: allOrders = [] } = useQuery({
    queryKey: ['purchase-orders', null],
    queryFn: () => listPurchaseOrders(),
    placeholderData: keepPreviousData,
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

  const metricsBy = useMemo(
    // El pedido real trae más campos; reducimos la superficie a lo que agregamos.
    () => buildMetrics(suppliers, allOrders as unknown as SupplierOrderLite[], Date.now()),
    [suppliers, allOrders],
  );
  const facetCounts = useMemo(
    () => computeFacetCounts(suppliers, metricsBy, search),
    [suppliers, metricsBy, search],
  );
  const groups = useMemo(() => {
    const filtered = filterSuppliers(suppliers, metricsBy, filters, search);
    return buildGroups(filtered, metricsBy);
  }, [suppliers, metricsBy, filters, search]);

  const activeFilterCount =
    (filters.view !== 'all' ? 1 : 0) + filters.status.size + filters.lead.size;

  // Exportación de proveedores: cabeceras + filas (filtradas por búsqueda) para el modal.
  const exportHeaders = ['Nombre', 'Lead time (días)'];
  const buildExportRows = (): string[][] =>
    groups.flatMap((g) => g.rows.map((r) => [r.supplier.name, String(r.supplier.leadTimeDays)]));

  // Import por-fila (sin endpoint bulk): cada fila se da de alta con createSupplier.
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

  const detail = detailId ? (suppliers.find((s) => s.id === detailId) ?? null) : null;

  // Acciones de la view en la TOPBAR (mismo patrón y diseño que Catálogo/Inventario):
  // exportar/importar CSV + alta. En la vista detalle no hay acciones de listado.
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
        <Button
          type="button"
          onClick={() => setCreating(true)}
          data-testid="new-supplier"
          icon={<Plus size={16} aria-hidden="true" />}
        >
          Nuevo proveedor
        </Button>
      </>
    ),
  );

  if (detail) return <SupplierDetail supplier={detail} onBack={() => setDetailId(null)} />;

  const toggleExpand = (id: string): void => setExpandedId((cur) => (cur === id ? null : id));

  return (
    <div className="suppliers-shell" data-testid="suppliers-section">
      <div className="sup-card">
        <div className="sup-body">
          <SupplierFacets
            search={search}
            onSearchChange={setSearch}
            filters={filters}
            facets={facetCounts}
            onView={(view: SavedView) => setFilters((f) => ({ ...f, view }))}
            onToggleStatus={(status) =>
              setFilters((f) => ({ ...f, status: toggleIn(f.status, status) }))
            }
            onToggleLead={(lead) => setFilters((f) => ({ ...f, lead: toggleIn(f.lead, lead) }))}
            activeFilterCount={activeFilterCount}
            onClear={() => setFilters(EMPTY_FILTERS)}
          />
          <SuppliersGroupedTable
            groups={groups}
            expandedId={expandedId}
            onToggleExpand={toggleExpand}
            onEdit={(s) => setDetailId(s.id)}
            onDelete={(s) => delMut.mutate(s.id)}
            deletingId={delMut.isPending ? (delMut.variables ?? null) : null}
            empty={
              isLoading
                ? 'Cargando proveedores…'
                : 'Sin proveedores para los filtros seleccionados.'
            }
          />
        </div>
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
    </div>
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
