import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

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
      <header className="catalog-head">
        <h2>Traspasos</h2>
        <div className="catalog-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => setCreating(true)}
            data-testid="new-transfer"
          >
            Nuevo traspaso
          </button>
        </div>
      </header>

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
                  <span className="stock-tag" data-testid="transfer-status">
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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} data-testid="transfer-form">
        <h3>Nuevo traspaso</h3>
        <div className="modal-row">
          <label>Origen</label>
          <select
            value={originStoreId}
            onChange={(e) => setOriginStoreId(e.target.value)}
            data-testid="transfer-origin"
          >
            <option value="">—</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="modal-row">
          <label>Destino</label>
          <select
            value={destStoreId}
            onChange={(e) => setDestStoreId(e.target.value)}
            data-testid="transfer-dest"
          >
            <option value="">—</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="modal-row">
          <label>Producto</label>
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            data-testid="transfer-product"
          >
            <option value="">—</option>
            {globalRows.map((r) => (
              <option key={r.productId} value={r.productId}>
                {r.productName}
              </option>
            ))}
          </select>
        </div>
        <div className="modal-row">
          <label>Cantidad</label>
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            data-testid="transfer-qty"
          />
        </div>
        {originStoreId && destStoreId && originStoreId === destStoreId && (
          <p className="muted">Origen y destino deben ser distintos.</p>
        )}
        <div className="modal-foot">
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!canSubmit || mutation.isPending}
            onClick={() =>
              mutation.mutate({
                originStoreId,
                destStoreId,
                lines: [{ productId, quantitySent: Number(qty) }],
              })
            }
            data-testid="transfer-save"
          >
            Crear
          </button>
        </div>
        {mutation.isError && <p className="muted">No se pudo crear el traspaso.</p>}
      </div>
    </div>
  );
}
