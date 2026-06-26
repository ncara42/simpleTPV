import type { Rotation } from '@simpletpv/auth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { CsvActionButton } from '../components/CsvActionButton.js';
import { ImportExportModal } from '../components/ImportExportModal.js';
import { listStores } from '../lib/admin.js';
import { listFamilies } from '../lib/families.js';
import { usePageActions } from '../lib/pageActions.js';
import { listProducts } from '../lib/products.js';
import { getGlobalStock } from '../lib/stock.js';
import { AdjustStockModal } from './AdjustStockModal.js';
import { CreateTransferModal, type CreateTransferPrefill } from './CreateTransferModal.js';
import {
  applyFamilyRotation,
  applyView,
  buildExRows,
  computeExFacets,
  EMPTY_EX_FILTERS,
  type ExFilters,
  type ExRow,
  type ExView,
  groupExRows,
  LEVEL_LABELS,
  ROTATION_LABELS,
  type Scope,
  scopeOf,
  searchRows,
} from './existences.js';
import { ExistencesFacets } from './ExistencesFacets.js';
import { ExistencesTable } from './ExistencesTable.js';

// Alterna una clave en un Set de forma inmutable.
function toggleInSet<T>(set: ReadonlySet<T>, key: T): Set<T> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

type ModalState =
  | { type: 'adjust'; row: ExRow; storeId: string }
  | { type: 'transfer'; row: ExRow; prefill: CreateTransferPrefill }
  | null;

interface ExistencesViewProps {
  /** Deep-link de tienda (`?store=`): preselecciona el ámbito al entrar. */
  initialStoreId?: string | null;
  /** Búsqueda compartida del shell de Inventario (controlada). */
  search?: string;
  onSearchChange?: (value: string) => void;
}

export function ExistencesView({ initialStoreId, search, onSearchChange }: ExistencesViewProps) {
  const qc = useQueryClient();

  // Búsqueda controlada por el shell de Inventario; autónoma si no la provee.
  const controlled = search !== undefined;
  const [searchInner, setSearchInner] = useState('');
  const term = controlled ? search : searchInner;
  const setTerm = controlled ? (onSearchChange ?? (() => {})) : setSearchInner;

  const [filters, setFilters] = useState<ExFilters>(EMPTY_EX_FILTERS);
  const [scope, setScope] = useState<Scope>(() =>
    initialStoreId ? new Set([initialStoreId]) : new Set(),
  );
  const [modal, setModal] = useState<ModalState>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const { data: stockRows = [], isLoading } = useQuery({
    queryKey: ['stock-global'],
    queryFn: getGlobalStock,
  });
  const { data: families = [] } = useQuery({ queryKey: ['families'], queryFn: listFamilies });
  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => listProducts(),
  });
  const { data: stores = [] } = useQuery({ queryKey: ['stores'], queryFn: listStores });

  // Descarta del ámbito tiendas que ya no existan (p. ej. tras borrarlas). Vacío = todas.
  const safeScope = useMemo<Scope>(
    () => new Set([...scope].filter((id) => stores.some((s) => s.id === id))),
    [scope, stores],
  );

  // Filas enriquecidas → búsqueda → familia/rotación → vista; recuentos y grupos.
  const rows = useMemo(
    () => buildExRows(stockRows, products, families),
    [stockRows, products, families],
  );
  const searched = useMemo(() => searchRows(rows, term), [rows, term]);
  const afterFamilyRotation = useMemo(
    () => applyFamilyRotation(searched, filters),
    [searched, filters],
  );
  const shown = useMemo(
    () => applyView(afterFamilyRotation, filters.view, safeScope),
    [afterFamilyRotation, filters.view, safeScope],
  );
  const facets = useMemo(
    () => computeExFacets(searched, afterFamilyRotation, families, safeScope),
    [searched, afterFamilyRotation, families, safeScope],
  );
  const groups = useMemo(
    () => groupExRows(shown, families, safeScope),
    [shown, families, safeScope],
  );

  // ─── Facetas ──────────────────────────────────────────────────────────────
  const setView = (view: ExView): void => setFilters((f) => ({ ...f, view }));
  const toggleStore = (id: string): void => setScope((prev) => toggleInSet(prev, id));
  const toggleFamily = (id: string): void =>
    setFilters((f) => ({ ...f, families: toggleInSet(f.families, id) }));
  const toggleRotation = (rotation: Rotation): void =>
    setFilters((f) => ({ ...f, rotations: toggleInSet(f.rotations, rotation) }));

  // ─── Acciones de fila ─────────────────────────────────────────────────────
  const openAdjust = (row: ExRow): void => {
    // Tienda a ajustar: la primera del ámbito; si no hay (todas), la primera con stock
    // del producto o la primera tienda. El modal permite cambiarla.
    const storeId = [...safeScope][0] ?? row.stores[0]?.storeId ?? stores[0]?.id ?? '';
    setModal({ type: 'adjust', row, storeId });
  };

  const openTransfer = (row: ExRow): void => {
    // Destino: la primera tienda del ámbito; o (en «todas») la primera con stock por
    // debajo del mínimo, la primera del producto, o la primera tienda.
    const dest =
      [...safeScope][0] ??
      row.stores.find((st) => st.quantity <= st.minStock)?.storeId ??
      row.stores[0]?.storeId ??
      stores[0]?.id ??
      '';
    // Orígenes candidatos: tiendas (≠ destino) con excedente, mayor excedente primero.
    const origins = row.stores
      .filter((st) => st.storeId !== dest && st.quantity - st.minStock > 0)
      .sort((a, b) => b.quantity - b.minStock - (a.quantity - a.minStock));
    const destStore = row.stores.find((st) => st.storeId === dest);
    const shortfall = destStore ? Math.max(1, destStore.minStock - destStore.quantity) : 1;
    const prefill: CreateTransferPrefill = {
      productId: row.productId,
      qty: shortfall,
      ...(dest ? { destStoreId: dest } : {}),
      ...(origins[0] ? { suggestedOriginStoreId: origins[0].storeId } : {}),
    };
    setModal({ type: 'transfer', row, prefill });
  };

  const closeModal = (): void => setModal(null);

  const onTransferCreated = (): void => {
    void qc.invalidateQueries({ queryKey: ['stock-global'] });
    void qc.invalidateQueries({ queryKey: ['transfers'] });
    closeModal();
  };

  // ─── Exportar (CSV de las filas mostradas en el ámbito actual) ─────────────
  const exportHeaders = ['Producto', 'Familia', 'Rotación', 'Mínimo', 'Disponible', 'Estado'];
  const buildExportRows = (): string[][] =>
    shown.map((row) => {
      const sc = scopeOf(row, safeScope);
      return [
        row.name,
        row.rootFamily?.name ?? '',
        ROTATION_LABELS[row.rotation],
        String(sc.min),
        String(sc.disp),
        LEVEL_LABELS[sc.level],
      ];
    });

  usePageActions(
    <CsvActionButton
      kind="export"
      label="Exportar"
      onClick={() => setExportOpen(true)}
      testId="existences-export"
    />,
  );

  return (
    <section className="catalog catalog--faceted" data-testid="stock-page">
      <div className="cat-layout">
        <ExistencesFacets
          search={term}
          onSearchChange={setTerm}
          facets={facets}
          filters={filters}
          scope={safeScope}
          stores={stores}
          onView={setView}
          onToggleStore={toggleStore}
          onToggleFamily={toggleFamily}
          onToggleRotation={toggleRotation}
        />
        <ExistencesTable
          groups={groups}
          scope={safeScope}
          onAdjust={openAdjust}
          onTransfer={openTransfer}
          empty={
            <span data-testid="existences-empty">
              {isLoading
                ? 'Cargando…'
                : stockRows.length === 0
                  ? 'Sin existencias todavía.'
                  : 'Sin productos para los filtros seleccionados.'}
            </span>
          }
        />
      </div>

      {modal?.type === 'adjust' && (
        <AdjustStockModal
          row={modal.row}
          stores={stores}
          initialStoreId={modal.storeId}
          onClose={closeModal}
        />
      )}

      {modal?.type === 'transfer' && (
        <CreateTransferModal
          mode="sendNow"
          prefill={modal.prefill}
          onClose={closeModal}
          onCreated={onTransferCreated}
        />
      )}

      {exportOpen && (
        <ImportExportModal
          title="Existencias"
          initialMode="export"
          onClose={() => setExportOpen(false)}
          testId="existences-export-modal"
          exportConfig={{
            headers: exportHeaders,
            getRows: buildExportRows,
            filenameBase: 'existencias',
          }}
        />
      )}
    </section>
  );
}
