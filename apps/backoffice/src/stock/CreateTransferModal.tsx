import type { ImportResult } from '@simpletpv/auth';
import { Button, DataTable, Input, Select } from '@simpletpv/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';

import { CsvDropzone } from '../components/CsvDropzone.js';
import { Modal } from '../components/Modal.js';
import { listStores } from '../lib/admin.js';
import { parseCsvRows } from '../lib/csv.js';
import { formErrorMessage } from '../lib/form-error.js';
import { listProducts } from '../lib/products.js';
import { createTransfer, sendTransfer } from '../lib/stock.js';
import { fallbackTransferName, TRANSFER_NAME_MAX_LENGTH } from './transfer-name.js';

interface DraftLine {
  productId: string;
  qty: number;
}

/** Prefijado del traspaso al abrirlo desde una rotura de Inventario (S-16). */
export interface CreateTransferPrefill {
  /** Tienda de destino (la que tiene la rotura). */
  destStoreId?: string;
  /** Producto en rotura, se añade como primera línea. */
  productId?: string;
  /** Cantidad de esa línea (por defecto 1, P099). */
  qty?: number;
  /** Tienda de origen sugerida (la de mayor excedente), preseleccionada. */
  suggestedOriginStoreId?: string;
}

export interface CreateTransferModalProps {
  onClose: () => void;
  /** Llamado tras crear (y enviar, en modo sendNow); recibe el id del traspaso. */
  onCreated: (transferId?: string) => void;
  prefill?: CreateTransferPrefill;
  /**
   * `draft` (def): crea el traspaso en BORRADOR (flujo manual de Traspasos).
   * `sendNow`: encadena create + send en un paso (P094, desde Inventario).
   */
  mode?: 'draft' | 'sendNow';
}

export function CreateTransferModal({
  onClose,
  onCreated,
  prefill,
  mode = 'draft',
}: CreateTransferModalProps) {
  const { data: stores = [] } = useQuery({ queryKey: ['stores'], queryFn: listStores });
  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => listProducts(),
  });

  const [name, setName] = useState('');
  const [originStoreId, setOriginStoreId] = useState(prefill?.suggestedOriginStoreId ?? '');
  const [destStoreId, setDestStoreId] = useState(prefill?.destStoreId ?? '');
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('1');
  const [lines, setLines] = useState<DraftLine[]>(() =>
    prefill?.productId ? [{ productId: prefill.productId, qty: prefill.qty ?? 1 }] : [],
  );
  const [importOpen, setImportOpen] = useState(false);

  // Alta gráfica de varios productos a la vez (S-24): buscador + lista de
  // checkboxes con cantidad editable por fila, alternativa a repetir el alta
  // manual una a una o exigir CSV para más de un producto.
  const [multiAddOpen, setMultiAddOpen] = useState(false);
  const [multiAddSearch, setMultiAddSearch] = useState('');
  const [multiAddChecked, setMultiAddChecked] = useState<ReadonlySet<string>>(new Set());
  const [multiAddQty, setMultiAddQty] = useState<Record<string, string>>({});

  const sendNow = mode === 'sendNow';
  const mutation = useMutation({
    mutationFn: async (input: Parameters<typeof createTransfer>[0]) => {
      const created = await createTransfer(input);
      // P094: en modo sendNow el traspaso se envía en el mismo paso. Si `send`
      // falla tras crear, el borrador queda creado y reenviarse desde Traspasos.
      if (sendNow) await sendTransfer(created.id);
      return created;
    },
    onSuccess: (created) => onCreated(created.id),
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

  const filteredMultiAddProducts = useMemo(() => {
    const term = multiAddSearch.trim().toLowerCase();
    if (!term) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(term) || (p.sku ?? '').toLowerCase().includes(term),
    );
  }, [products, multiAddSearch]);

  const toggleMultiAddCheck = (id: string): void =>
    setMultiAddChecked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const closeMultiAdd = (): void => {
    setMultiAddOpen(false);
    setMultiAddSearch('');
    setMultiAddChecked(new Set());
    setMultiAddQty({});
  };

  const confirmMultiAdd = (): void => {
    multiAddChecked.forEach((id) => {
      const q = Number(multiAddQty[id] ?? '1');
      addLine(id, q > 0 ? q : 1);
    });
    closeMultiAdd();
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
          // P101: nombre opcional; si está vacío se auto-asigna "Origen → Destino"
          // (P105) usando los nombres de tienda ya cargados. Trim en cliente (P106).
          const storeName = (id: string): string | undefined =>
            stores.find((s) => s.id === id)?.name;
          const notes =
            name.trim() || fallbackTransferName(storeName(originStoreId), storeName(destStoreId));
          mutation.mutate({
            originStoreId,
            destStoreId,
            notes,
            lines: lines.map((l) => ({ productId: l.productId, quantitySent: l.qty })),
          });
        }
      }}
    >
      <header className="modal-head">
        <h3>{sendNow ? 'Traspasar y enviar' : 'Nuevo traspaso'}</h3>
      </header>
      <div className="modal-body">
        <section className="form-section">
          <label className="form-section-title" htmlFor="transfer-name-input">
            Nombre
          </label>
          <Input
            id="transfer-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={TRANSFER_NAME_MAX_LENGTH}
            placeholder="Opcional · si lo dejas vacío se nombra «Origen → Destino»"
            aria-label="Nombre del traspaso"
            data-testid="transfer-name"
          />
        </section>

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

          <div className="transfer-batch-actions">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={<Plus size={16} />}
              onClick={() => setMultiAddOpen((o) => !o)}
              aria-expanded={multiAddOpen}
              data-testid="transfer-multi-add-toggle"
            >
              {multiAddOpen ? 'Ocultar selección múltiple' : 'Añadir varios productos'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={<Upload size={16} />}
              onClick={() => setImportOpen((o) => !o)}
              aria-expanded={importOpen}
              data-testid="transfer-import-toggle"
            >
              {importOpen ? 'Ocultar importación CSV' : 'Añadir productos por CSV'}
            </Button>
          </div>

          {multiAddOpen && (
            <div className="transfer-multi-add" data-testid="transfer-multi-add-panel">
              <Input
                type="search"
                placeholder="Buscar producto por nombre o SKU…"
                value={multiAddSearch}
                onChange={(e) => setMultiAddSearch(e.target.value)}
                aria-label="Buscar producto"
                data-testid="transfer-multi-add-search"
              />
              {filteredMultiAddProducts.length === 0 ? (
                <p className="catalog-empty" data-testid="transfer-multi-add-empty">
                  Sin productos para la búsqueda.
                </p>
              ) : (
                <ul className="fam-add-existing-list" data-testid="transfer-multi-add-list">
                  {filteredMultiAddProducts.map((p) => {
                    const checked = multiAddChecked.has(p.id);
                    return (
                      <li
                        key={p.id}
                        className="fam-add-existing-item"
                        data-testid="transfer-multi-add-item"
                      >
                        <label className="transfer-multi-add-row">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleMultiAddCheck(p.id)}
                            data-testid="transfer-multi-add-check"
                            aria-label={`Seleccionar ${p.name}`}
                          />
                          <span className="fam-product-name">{p.name}</span>
                          <Input
                            type="number"
                            min={1}
                            className="w-20"
                            value={multiAddQty[p.id] ?? '1'}
                            onChange={(e) =>
                              setMultiAddQty((cur) => ({ ...cur, [p.id]: e.target.value }))
                            }
                            aria-label={`Cantidad de ${p.name}`}
                            data-testid="transfer-multi-add-qty"
                          />
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="transfer-multi-add-actions">
                <button type="button" className="link-btn" onClick={closeMultiAdd}>
                  Cancelar
                </button>
                <Button
                  type="button"
                  size="sm"
                  onClick={confirmMultiAdd}
                  disabled={multiAddChecked.size === 0}
                  data-testid="transfer-multi-add-confirm"
                >
                  {multiAddChecked.size > 0 ? `Añadir ${multiAddChecked.size}` : 'Añadir'}
                </Button>
              </div>
            </div>
          )}

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
          {formErrorMessage(
            mutation.error,
            sendNow ? 'No se pudo crear o enviar el traspaso.' : 'No se pudo crear el traspaso.',
          )}
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
          {mutation.isPending
            ? sendNow
              ? 'Enviando…'
              : 'Creando…'
            : sendNow
              ? 'Traspasar y enviar'
              : 'Crear'}
        </Button>
      </div>
    </Modal>
  );
}
