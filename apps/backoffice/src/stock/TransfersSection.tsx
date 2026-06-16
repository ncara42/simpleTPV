import type { ImportResult } from '@simpletpv/auth';
import { Badge, Button, DataTable, type DataTableColumn, Input, Select } from '@simpletpv/ui';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';

import { CsvActionButton } from '../components/CsvActionButton.js';
import { CsvDropzone } from '../components/CsvDropzone.js';
import { Modal } from '../components/Modal.js';
import { listStores } from '../lib/admin.js';
import { exportRowsToCsv, parseCsvRows } from '../lib/csv.js';
import { formErrorMessage } from '../lib/form-error.js';
import { listProducts } from '../lib/products.js';
import { createTransfer, listTransfers, sendTransfer } from '../lib/stock.js';
import { dt, STATUS_LABEL } from './labels.js';

interface DraftLine {
  productId: string;
  qty: number;
}

export function TransfersSection() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  // Modal de importación de traspasos en lote por CSV.
  const [importing, setImporting] = useState(false);

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
  const transferColumns: DataTableColumn<TransferRow>[] = [
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
      ['Fecha', 'Líneas', 'Estado'],
      transfers.map((t) => [
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
        await createTransfer(group);
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

  return (
    <>
      <div className="table-actions">
        <CsvActionButton kind="export" onClick={handleExport} testId="transfers-export" />
        <CsvActionButton
          kind="import"
          onClick={() => setImporting(true)}
          testId="transfers-import"
        />
      </div>
      <div className="table-panel">
        <DataTable
          columns={transferColumns}
          rows={transfers}
          rowKey={(t) => t.id}
          loading={isLoading}
          toolbar={
            <div className="users-toolbar">
              <div className="sales-filters" />
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

function CreateTransferModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { data: stores = [] } = useQuery({ queryKey: ['stores'], queryFn: listStores });
  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => listProducts(),
  });

  const [originStoreId, setOriginStoreId] = useState('');
  const [destStoreId, setDestStoreId] = useState('');
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('1');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [importOpen, setImportOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: createTransfer,
    onSuccess: onCreated,
  });

  const productName = (id: string): string => products.find((p) => p.id === id)?.name ?? id;

  // Añade (o acumula) una línea al traspaso; varias líneas del mismo producto suman.
  const addLine = (pid: string, q: number): void =>
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === pid);
      if (existing) {
        return prev.map((l) => (l.productId === pid ? { ...l, qty: l.qty + q } : l));
      }
      return [...prev, { productId: pid, qty: q }];
    });

  const addManual = (): void => {
    if (!productId || Number(qty) <= 0) return;
    addLine(productId, Number(qty));
    setProductId('');
    setQty('1');
  };

  // Import CSV (sku,qty) en cliente: resuelve cada SKU contra el catálogo cargado y
  // acumula las líneas válidas, reportando errores por fila (mismo contrato que CsvDropzone).
  const importLines = (csv: string): Promise<ImportResult> => {
    const bySku = new Map(
      products.filter((p) => p.sku).map((p) => [p.sku!.toLowerCase(), p] as const),
    );
    const errors: ImportResult['errors'] = [];
    let inserted = 0;
    parseCsvRows(csv).forEach((cells, i) => {
      const row = i + 2;
      const sku = (cells.sku ?? '').trim();
      const q = Number((cells.qty ?? '').trim());
      if (!sku) return errors.push({ row, message: 'Falta el SKU' });
      if (!Number.isFinite(q) || q <= 0) return errors.push({ row, message: 'Cantidad inválida' });
      const p = bySku.get(sku.toLowerCase());
      if (!p) return errors.push({ row, message: `Sin producto con SKU "${sku}"` });
      addLine(p.id, q);
      inserted += 1;
    });
    return Promise.resolve({ inserted, errors });
  };

  const canSubmit =
    originStoreId && destStoreId && originStoreId !== destStoreId && lines.length > 0;

  const storeOptions = stores.map((s) => ({ value: s.id, label: s.name }));

  return (
    <Modal
      onClose={onClose}
      className="modal--form"
      testId="transfer-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit && !mutation.isPending) {
          mutation.mutate({
            originStoreId,
            destStoreId,
            lines: lines.map((l) => ({ productId: l.productId, quantitySent: l.qty })),
          });
        }
      }}
    >
      <header className="modal-head">
        <h3>Nuevo traspaso</h3>
      </header>
      <div className="modal-body">
        <section className="form-section">
          <span className="form-section-title">Origen y destino</span>
          <div className="modal-row">
            <Select
              value={originStoreId}
              onChange={setOriginStoreId}
              ariaLabel="Tienda de origen"
              data-testid="transfer-origin"
              options={[{ value: '', label: 'Selecciona origen…' }, ...storeOptions]}
            />
            <Select
              value={destStoreId}
              onChange={setDestStoreId}
              ariaLabel="Tienda de destino"
              data-testid="transfer-dest"
              options={[{ value: '', label: 'Selecciona destino…' }, ...storeOptions]}
            />
          </div>
          {originStoreId && destStoreId && originStoreId === destStoreId && (
            <p className="form-error">Origen y destino deben ser distintos.</p>
          )}
        </section>

        <section className="form-section">
          <span className="form-section-title">Productos del traspaso</span>
          <div className="b2b-item-form">
            <Select
              value={productId}
              onChange={setProductId}
              ariaLabel="Producto"
              data-testid="transfer-product"
              options={[
                { value: '', label: 'Selecciona producto…' },
                ...products.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
            <Input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              data-testid="transfer-qty"
              aria-label="Cantidad"
            />
            <Button
              type="button"
              disabled={!productId || Number(qty) <= 0}
              onClick={addManual}
              data-testid="transfer-add-line"
            >
              Añadir
            </Button>
          </div>

          {lines.length > 0 && (
            <DataTable
              data-testid="transfer-lines"
              rowTestId="transfer-line-row"
              rows={lines}
              rowKey={(l) => l.productId}
              columns={[
                { key: 'product', header: 'Producto', render: (l) => productName(l.productId) },
                { key: 'qty', header: 'Cantidad', render: (l) => l.qty },
                {
                  key: 'actions',
                  header: '',
                  align: 'right',
                  render: (l) => (
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() =>
                        setLines((prev) => prev.filter((x) => x.productId !== l.productId))
                      }
                    >
                      Quitar
                    </button>
                  ),
                },
              ]}
            />
          )}

          <button
            type="button"
            className="link-btn"
            onClick={() => setImportOpen((o) => !o)}
            aria-expanded={importOpen}
            data-testid="transfer-import-toggle"
          >
            {importOpen ? 'Ocultar importación CSV' : 'Añadir productos por CSV'}
          </button>
          {importOpen && (
            <CsvDropzone
              columns={['sku', 'qty']}
              example={['SKU-001', '10']}
              templateName="plantilla_traspaso.csv"
              testId="transfer-csv"
              help={
                <>
                  Columnas: <code>sku,qty</code>. Cada fila añade el producto con ese SKU al
                  traspaso con la cantidad indicada.
                </>
              }
              onImport={importLines}
            />
          )}
        </section>
      </div>
      {mutation.isError && (
        <p className="form-error">
          {formErrorMessage(mutation.error, 'No se pudo crear el traspaso.')}
        </p>
      )}
      <div className="modal-foot modal-foot-actions">
        <button type="button" onClick={onClose}>
          Cancelar
        </button>
        <Button
          type="submit"
          disabled={!canSubmit || mutation.isPending}
          data-testid="transfer-save"
        >
          {mutation.isPending ? 'Creando…' : 'Crear'}
        </Button>
      </div>
    </Modal>
  );
}
