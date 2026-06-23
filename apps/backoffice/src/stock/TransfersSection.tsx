import type { ImportResult } from '@simpletpv/auth';
import { Badge, Button, DataTable, type DataTableColumn, Input } from '@simpletpv/ui';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Plus, Upload } from 'lucide-react';
import { useState } from 'react';

import { CsvDropzone } from '../components/CsvDropzone.js';
import { Modal } from '../components/Modal.js';
import { listStores } from '../lib/admin.js';
import { exportRowsToCsv, parseCsvRows } from '../lib/csv.js';
import { usePageActions } from '../lib/pageActions.js';
import { listProducts } from '../lib/products.js';
import { createTransfer, listTransfers, sendTransfer } from '../lib/stock.js';
import { CreateTransferModal } from './CreateTransferModal.js';
import { dt, STATUS_LABEL } from './labels.js';
import { fallbackTransferName, transferDisplayName } from './transfer-name.js';

export function TransfersSection() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  // Modal de importación de traspasos en lote por CSV.
  const [importing, setImporting] = useState(false);
  // Buscador en cliente sobre la lista ya cargada (P102), sin llamada extra a la API.
  const [search, setSearch] = useState('');

  const { data: transfers = [], isLoading } = useQuery({
    queryKey: ['transfers'],
    queryFn: () => listTransfers(),
    placeholderData: keepPreviousData,
  });
  // Catálogos para resolver el CSV de import: código/nombre de tienda → id y SKU → id.
  const { data: stores = [] } = useQuery({ queryKey: ['stores'], queryFn: listStores });
  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => listProducts(),
  });

  const sendMutation = useMutation({
    mutationFn: sendTransfer,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['transfers'] });
      void qc.invalidateQueries({ queryKey: ['stock-global'] });
    },
  });

  type TransferRow = (typeof transfers)[number];

  const storeName = (id: string): string | undefined => stores.find((s) => s.id === id)?.name;
  // Nombre mostrado: notes si existe, o el fallback "Origen → Destino" (P105).
  const displayName = (t: TransferRow): string =>
    transferDisplayName(t.notes, storeName(t.originStoreId), storeName(t.destStoreId));

  // Filtro en cliente por nombre mostrado y por tiendas (P102), case-insensitive.
  const query = search.trim().toLowerCase();
  const filtered = query
    ? transfers.filter((t) =>
        [displayName(t), storeName(t.originStoreId) ?? '', storeName(t.destStoreId) ?? '']
          .join(' ')
          .toLowerCase()
          .includes(query),
      )
    : transfers;
  const transferColumns: DataTableColumn<TransferRow>[] = [
    {
      key: 'name',
      header: 'Nombre',
      render: (t) => <span data-testid="transfer-name-cell">{displayName(t)}</span>,
    },
    {
      key: 'date',
      header: 'Fecha',
      render: (t) => <span className="muted">{dt.format(new Date(t.createdAt))}</span>,
    },
    { key: 'lines', header: 'Líneas', render: (t) => t.lines.length },
    {
      key: 'status',
      header: 'Estado',
      render: (t) => (
        <Badge variant="muted" data-testid="transfer-status">
          {STATUS_LABEL[t.status] ?? t.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (t) =>
        t.status === 'DRAFT' ? (
          <button
            type="button"
            className="link-btn"
            disabled={sendMutation.isPending}
            onClick={() => sendMutation.mutate(t.id)}
            data-testid="transfer-send"
          >
            Enviar
          </button>
        ) : null,
    },
  ];

  const handleExport = (): void => {
    exportRowsToCsv(
      'traspasos.csv',
      ['Nombre', 'Fecha', 'Líneas', 'Estado'],
      transfers.map((t) => [
        displayName(t),
        dt.format(new Date(t.createdAt)),
        String(t.lines.length),
        STATUS_LABEL[t.status] ?? t.status,
      ]),
    );
  };

  // Import en lote: CSV con una línea por producto (origen, destino, sku, cantidad).
  // Se agrupan las filas con el mismo (origen, destino) en un único traspaso BORRADOR.
  // Resuelve tiendas por código o nombre y productos por SKU contra los catálogos
  // cargados; las filas no resolubles se reportan como error sin abortar el lote.
  const onImportCsv = async (csv: string): Promise<ImportResult> => {
    const storeByKey = new Map<string, string>();
    for (const s of stores) {
      storeByKey.set(s.code.toLowerCase(), s.id);
      storeByKey.set(s.name.toLowerCase(), s.id);
    }
    const productBySku = new Map(
      products.filter((p) => p.sku).map((p) => [p.sku!.toLowerCase(), p.id] as const),
    );
    const groups = new Map<
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
      const group = groups.get(key) ?? { originStoreId: origin, destStoreId: dest, lines: [] };
      group.lines.push({ productId, quantitySent: qty });
      groups.set(key, group);
    });
    let inserted = 0;
    for (const group of groups.values()) {
      try {
        // P104: cada traspaso importado recibe el auto-nombre "Origen → Destino".
        const notes = fallbackTransferName(
          storeName(group.originStoreId),
          storeName(group.destStoreId),
        );
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

  // Export/Import en el clúster flotante (junto al conmutador Backoffice↔TPV).
  usePageActions(
    <>
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

  return (
    <>
      <div className="table-panel">
        <DataTable
          columns={transferColumns}
          rows={filtered}
          rowKey={(t) => t.id}
          loading={isLoading}
          toolbar={
            <div className="users-toolbar">
              <div className="sales-filters">
                <span className="search-field">
                  <Input
                    className="catalog-search"
                    placeholder="Buscar traspaso"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="Buscar traspaso"
                    data-testid="transfers-search"
                  />
                </span>
              </div>
              <div className="ui-dt-toolbar-actions">
                <Button
                  type="button"
                  onClick={() => setCreating(true)}
                  data-testid="new-transfer"
                  icon={<Plus size={16} aria-hidden="true" />}
                >
                  Nuevo traspaso
                </Button>
              </div>
            </div>
          }
          rowTestId="transfer-row"
          emptyState={<span data-testid="transfers-empty">Sin traspasos.</span>}
          data-testid="transfers-table"
        />
      </div>

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
