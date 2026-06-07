import { Select } from '@simpletpv/ui';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Modal } from '../components/Modal.js';
import { listStores } from '../lib/admin.js';
import { createTransfer, getGlobalStock, listTransfers, sendTransfer } from '../lib/stock.js';
import { dt, STATUS_LABEL } from './labels.js';

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
  const { data: globalRows = [] } = useQuery({
    queryKey: ['stock-global'],
    queryFn: getGlobalStock,
  });

  const [originStoreId, setOriginStoreId] = useState('');
  const [destStoreId, setDestStoreId] = useState('');
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('1');

  const mutation = useMutation({
    mutationFn: createTransfer,
    onSuccess: onCreated,
  });

  const canSubmit =
    originStoreId && destStoreId && originStoreId !== destStoreId && productId && Number(qty) > 0;

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
            lines: [{ productId, quantitySent: Number(qty) }],
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
          <span className="form-section-title">Producto y cantidad</span>
          <Select
            value={productId}
            onChange={setProductId}
            ariaLabel="Producto"
            data-testid="transfer-product"
            options={[
              { value: '', label: 'Selecciona producto…' },
              ...globalRows.map((r) => ({ value: r.productId, label: r.productName })),
            ]}
          />
          <label>
            Cantidad
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              data-testid="transfer-qty"
            />
          </label>
        </section>
      </div>
      {mutation.isError && <p className="form-error">No se pudo crear el traspaso.</p>}
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
