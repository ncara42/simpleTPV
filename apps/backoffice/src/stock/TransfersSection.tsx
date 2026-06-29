import type { ImportResult, Transfer } from '@simpletpv/auth';
import { Button } from '@simpletpv/ui';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, Download, Plus, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';

import { CsvDropzone } from '../components/CsvDropzone.js';
import { Modal } from '../components/Modal.js';
import { listStores } from '../lib/admin.js';
import { exportRowsToCsv, parseCsvRows } from '../lib/csv.js';
import { usePageActions } from '../lib/pageActions.js';
import { listProducts } from '../lib/products.js';
import {
  closeTransfer,
  createTransfer,
  listTransfers,
  receiveTransfer,
  sendTransfer,
} from '../lib/stock.js';
import { CreateTransferModal } from './CreateTransferModal.js';
import { dt, STATUS_LABEL } from './labels.js';
import { fallbackTransferName } from './transfer-name.js';
import {
  applyStoreFacets,
  applyView,
  buildFullReceiveInput,
  computeStoreFacets,
  computeViewCounts,
  groupTransfers,
  searchTransfers,
  sortTransfers,
  type TransferActionKind,
  transferLabel,
  type TransferView,
} from './transfer-view.js';
import { TransferChatModal } from './TransferChatModal.js';
import { TransferFacets } from './TransferFacets.js';
import { type TransferChatTarget, TransfersTable } from './TransfersTable.js';

// Toggle inmutable de una clave en un Set (origen/destino de las facetas).
function toggleInSet(set: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

export function TransfersSection() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  // Modal de importación de traspasos en lote por CSV.
  const [importing, setImporting] = useState(false);
  // Filtros del carril (búsqueda + vista + facetas) y orden — en cliente (P102).
  const [search, setSearch] = useState('');
  const [view, setView] = useState<TransferView>('all');
  const [origins, setOrigins] = useState<ReadonlySet<string>>(new Set());
  const [dests, setDests] = useState<ReadonlySet<string>>(new Set());
  // Chat (pop-up) abierto desde el botón de comentarios de una fila.
  const [chat, setChat] = useState<TransferChatTarget | null>(null);

  const { data: transfers = [], isLoading } = useQuery({
    queryKey: ['transfers'],
    queryFn: () => listTransfers(),
    placeholderData: keepPreviousData,
  });
  // Catálogos para resolver nombres de tienda/producto y el CSV de import.
  const { data: stores = [] } = useQuery({ queryKey: ['stores'], queryFn: listStores });
  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => listProducts(),
  });

  // ─── Resolutores (memo sobre los catálogos) ─────────────────────────────────
  const nameOf = useMemo(() => {
    const byId = new Map(stores.map((s) => [s.id, s.name]));
    return (id: string): string => byId.get(id) ?? id;
  }, [stores]);
  const resolveProduct = useMemo(() => {
    const byId = new Map(products.map((p) => [p.id, p]));
    return (productId: string): { name: string; sku: string } => {
      const p = byId.get(productId);
      return { name: p?.name ?? productId, sku: p?.sku ?? '' };
    };
  }, [products]);
  const storeIds = useMemo(() => stores.map((s) => s.id), [stores]);

  // ─── Derivaciones (búsqueda → vista → facetas → orden → grupos) ──────────────
  const afterSearch = useMemo(
    () => searchTransfers(transfers, search, nameOf),
    [transfers, search, nameOf],
  );
  const afterView = useMemo(() => applyView(afterSearch, view), [afterSearch, view]);
  // Orden fijo: más recientes primero (la tabla ya no expone toggle de orden; la
  // barra recuento+orden se retiró para igualar la tabla de Inventario/Catálogo).
  const sorted = useMemo(
    () => sortTransfers(applyStoreFacets(afterView, origins, dests), true),
    [afterView, origins, dests],
  );
  const groups = useMemo(() => groupTransfers(sorted), [sorted]);
  const viewCounts = useMemo(() => computeViewCounts(afterSearch), [afterSearch]);
  const originFacets = useMemo(
    () => computeStoreFacets(afterView, 'origin', storeIds, nameOf),
    [afterView, storeIds, nameOf],
  );
  const destFacets = useMemo(
    () => computeStoreFacets(afterView, 'dest', storeIds, nameOf),
    [afterView, storeIds, nameOf],
  );

  const showClear = search.trim() !== '' || view !== 'all' || origins.size > 0 || dests.size > 0;

  // ─── Mutaciones del ciclo (enviar/recibir/cerrar) ───────────────────────────
  const invalidate = (): void => {
    void qc.invalidateQueries({ queryKey: ['transfers'] });
    void qc.invalidateQueries({ queryKey: ['stock-global'] });
  };
  const sendMutation = useMutation({
    mutationFn: (id: string) => sendTransfer(id),
    onSuccess: invalidate,
  });
  const receiveMutation = useMutation({
    mutationFn: (t: Transfer) => receiveTransfer(t.id, buildFullReceiveInput(t)),
    onSuccess: invalidate,
  });
  const closeMutation = useMutation({
    mutationFn: (id: string) => closeTransfer(id),
    onSuccess: invalidate,
  });

  // Traspaso con una mutación en vuelo (deshabilita su acción en línea / en la ficha).
  const pendingId: string | null =
    (sendMutation.isPending && sendMutation.variables) ||
    (closeMutation.isPending && closeMutation.variables) ||
    (receiveMutation.isPending && receiveMutation.variables?.id) ||
    null;

  const runAction = (kind: TransferActionKind, t: Transfer): void => {
    if (kind === 'send') sendMutation.mutate(t.id);
    else if (kind === 'receive') receiveMutation.mutate(t);
    else closeMutation.mutate(t.id);
  };

  const clearFilters = (): void => {
    setSearch('');
    setView('all');
    setOrigins(new Set());
    setDests(new Set());
  };

  // ─── Exportar (CSV de todos los traspasos) ──────────────────────────────────
  const handleExport = (): void => {
    exportRowsToCsv(
      'traspasos.csv',
      ['Nombre', 'Fecha', 'Líneas', 'Estado'],
      transfers.map((t) => [
        transferLabel(t, nameOf),
        dt.format(new Date(t.createdAt)),
        String(t.lines.length),
        STATUS_LABEL[t.status] ?? t.status,
      ]),
    );
  };

  // Import en lote: CSV con una línea por producto (origen, destino, sku, cantidad).
  // Agrupa filas con el mismo (origen, destino) en un único traspaso BORRADOR.
  const onImportCsv = async (csv: string): Promise<ImportResult> => {
    const storeByKey = new Map<string, string>();
    for (const s of stores) {
      storeByKey.set(s.code.toLowerCase(), s.id);
      storeByKey.set(s.name.toLowerCase(), s.id);
    }
    const productBySku = new Map(
      products.filter((p) => p.sku).map((p) => [p.sku!.toLowerCase(), p.id] as const),
    );
    const groupsByRoute = new Map<
      string,
      {
        originStoreId: string;
        destStoreId: string;
        lines: { productId: string; quantitySent: number }[];
      }
    >();
    const errors: ImportResult['errors'] = [];
    parseCsvRows(csv).forEach((row, i) => {
      const rowNum = i + 2;
      const origin = storeByKey.get((row.origen ?? '').toLowerCase());
      const dest = storeByKey.get((row.destino ?? '').toLowerCase());
      const productId = productBySku.get((row.sku ?? '').toLowerCase());
      const qty = Number(row.cantidad ?? row.qty ?? 0);
      if (!origin)
        return void errors.push({ row: rowNum, message: `Origen no encontrado: ${row.origen}` });
      if (!dest)
        return void errors.push({ row: rowNum, message: `Destino no encontrado: ${row.destino}` });
      if (origin === dest)
        return void errors.push({ row: rowNum, message: 'Origen y destino iguales' });
      if (!productId)
        return void errors.push({ row: rowNum, message: `SKU no encontrado: ${row.sku}` });
      if (!(qty > 0)) return void errors.push({ row: rowNum, message: 'Cantidad inválida' });
      const key = `${origin}|${dest}`;
      const group = groupsByRoute.get(key) ?? {
        originStoreId: origin,
        destStoreId: dest,
        lines: [],
      };
      group.lines.push({ productId, quantitySent: qty });
      groupsByRoute.set(key, group);
    });
    let inserted = 0;
    for (const group of groupsByRoute.values()) {
      try {
        // P104: cada traspaso importado recibe el auto-nombre "Origen → Destino".
        const notes = fallbackTransferName(nameOf(group.originStoreId), nameOf(group.destStoreId));
        await createTransfer({ ...group, notes });
        inserted += group.lines.length;
      } catch (e) {
        errors.push({
          row: 0,
          message: e instanceof Error ? e.message : 'No se pudo crear el traspaso',
        });
      }
    }
    return { inserted, errors };
  };

  // CTAs de página en la TopBar: Nuevo traspaso (primario) + exportar/importar.
  usePageActions(
    <>
      <Button
        type="button"
        onClick={() => setCreating(true)}
        data-testid="new-transfer"
        icon={<Plus size={16} aria-hidden="true" />}
      >
        Nuevo traspaso
      </Button>
      <button
        type="button"
        className="float-action-btn"
        onClick={handleExport}
        aria-label="Exportar traspasos"
        title="Exportar traspasos"
        data-testid="transfers-export"
      >
        <Download size={17} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="float-action-btn"
        onClick={() => setImporting(true)}
        aria-label="Importar traspasos"
        title="Importar traspasos"
        data-testid="transfers-import"
      >
        <Upload size={17} aria-hidden="true" />
      </button>
    </>,
  );

  const emptyNode = (
    <>
      <ArrowLeftRight size={22} aria-hidden="true" />
      <span className="tr-empty-title">
        {isLoading
          ? 'Cargando…'
          : transfers.length === 0
            ? 'Sin traspasos todavía.'
            : 'Sin traspasos para estos filtros'}
      </span>
      {showClear && (
        <button type="button" className="tr-clear" onClick={clearFilters}>
          Limpiar filtros
        </button>
      )}
    </>
  );

  return (
    <>
      <div className="tr-card">
        <div className="catalog--faceted">
          <div className="cat-layout">
            <TransferFacets
              search={search}
              onSearchChange={setSearch}
              viewCounts={viewCounts}
              view={view}
              onView={setView}
              origins={origins}
              dests={dests}
              originFacets={originFacets}
              destFacets={destFacets}
              onToggleOrigin={(id) => setOrigins((s) => toggleInSet(s, id))}
              onToggleDest={(id) => setDests((s) => toggleInSet(s, id))}
              showClear={showClear}
              onClear={clearFilters}
            />
            <TransfersTable
              groups={groups}
              nameOf={nameOf}
              resolveProduct={resolveProduct}
              onAction={runAction}
              pendingId={pendingId}
              onOpenChat={setChat}
              empty={emptyNode}
            />
          </div>
        </div>
      </div>

      {chat && (
        <TransferChatModal
          transferId={chat.id}
          title={chat.title}
          subtitle={chat.subtitle}
          incidentOpen={chat.incidentOpen}
          onClose={() => setChat(null)}
        />
      )}

      {creating && (
        <CreateTransferModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void qc.invalidateQueries({ queryKey: ['transfers'] });
          }}
        />
      )}

      {importing && (
        <Modal
          onClose={() => setImporting(false)}
          className="modal--form"
          testId="transfers-import-modal"
          ariaLabel="Importar traspasos desde CSV"
        >
          <h3>Importar traspasos desde CSV</h3>
          <CsvDropzone
            columns={['origen', 'destino', 'sku', 'cantidad']}
            example={['Centro', 'Norte', 'CBD-10-30', '5']}
            templateName="traspasos"
            help="Una línea por producto. Las filas con el mismo origen y destino se agrupan en un traspaso borrador. Origen/destino por código o nombre de tienda."
            testId="transfers-csv"
            onImport={onImportCsv}
            onImported={() => {
              void qc.invalidateQueries({ queryKey: ['transfers'] });
            }}
          />
          <div className="modal-foot">
            <button type="button" onClick={() => setImporting(false)}>
              Cerrar
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
