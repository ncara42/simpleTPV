import type { ImportResult } from '@simpletpv/auth';
import { Select } from '@simpletpv/ui';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { CsvDropzone } from '../components/CsvDropzone.js';
import { Modal } from '../components/Modal.js';
import { listStores } from '../lib/admin.js';
import { parseCsvRows } from '../lib/csv.js';
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

  const { data: transfers = [], isLoading } = useQuery({
    queryKey: ['transfers'],
    queryFn: () => listTransfers(),
    placeholderData: keepPreviousData,
  });

  const sendMutation = useMutation({
    mutationFn: sendTransfer,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['transfers'] });
      void qc.invalidateQueries({ queryKey: ['stock-global'] });
    },
  });

  return (
    <>
      <div className="table-panel">
        <div className="sales-filters">
          <button
            type="button"
            className="btn-primary stock-toolbar-action"
            onClick={() => setCreating(true)}
            data-testid="new-transfer"
          >
            Nuevo traspaso
          </button>
        </div>
        {isLoading ? (
          <p className="catalog-empty">Cargando…</p>
        ) : transfers.length === 0 ? (
          <p className="catalog-empty" data-testid="transfers-empty">
            Sin traspasos.
          </p>
        ) : (
          <table className="catalog-table" data-testid="transfers-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Líneas</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {transfers.map((t) => (
                <tr key={t.id} data-testid="transfer-row">
                  <td className="muted">{dt.format(new Date(t.createdAt))}</td>
                  <td>{t.lines.length}</td>
                  <td>
                    <span className="status-badge" data-testid="transfer-status">
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                  </td>
                  <td>
                    {t.status === 'DRAFT' && (
                      <button
                        type="button"
                        className="link-btn"
                        disabled={sendMutation.isPending}
                        onClick={() => sendMutation.mutate(t.id)}
                        data-testid="transfer-send"
                      >
                        Enviar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              data-testid="transfer-qty"
              aria-label="Cantidad"
            />
            <button
              type="button"
              className="btn-primary"
              disabled={!productId || Number(qty) <= 0}
              onClick={addManual}
              data-testid="transfer-add-line"
            >
              Añadir
            </button>
          </div>

          {lines.length > 0 && (
            <table className="catalog-table" data-testid="transfer-lines">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Cantidad</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.productId} data-testid="transfer-line-row">
                    <td>{productName(l.productId)}</td>
                    <td>{l.qty}</td>
                    <td>
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() =>
                          setLines((prev) => prev.filter((x) => x.productId !== l.productId))
                        }
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
        <button
          type="submit"
          className="btn-primary"
          disabled={!canSubmit || mutation.isPending}
          data-testid="transfer-save"
        >
          {mutation.isPending ? 'Creando…' : 'Crear'}
        </button>
      </div>
    </Modal>
  );
}
