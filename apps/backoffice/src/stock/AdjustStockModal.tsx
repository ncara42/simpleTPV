import type { Store } from '@simpletpv/auth';
import { Button, Input, Select } from '@simpletpv/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Modal } from '../components/Modal.js';
import { formErrorMessage } from '../lib/form-error.js';
import { adjustStock, setMinStock } from '../lib/stock.js';
import type { ExRow } from './existences.js';

// Modal «Ajustar existencias»: fija la cantidad disponible y el stock mínimo de un
// producto EN UNA TIENDA, con un motivo (recuento, merma, rotura…). Persiste contra
// POST /stock/adjust (cantidad + motivo → movimiento auditado) y PUT /stock/min
// (umbral). Refresca el stock global, los movimientos y las alertas al guardar.

interface AdjustStockModalProps {
  row: ExRow;
  stores: Store[];
  /** Tienda inicial (id concreto; el contenedor lo resuelve si el ámbito era «todas»). */
  initialStoreId: string;
  onClose: () => void;
}

function qtyOf(row: ExRow, storeId: string): number {
  return row.stores.find((s) => s.storeId === storeId)?.quantity ?? 0;
}
function minOf(row: ExRow, storeId: string): number {
  return row.stores.find((s) => s.storeId === storeId)?.minStock ?? 0;
}

export function AdjustStockModal({ row, stores, initialStoreId, onClose }: AdjustStockModalProps) {
  const qc = useQueryClient();
  const [storeId, setStoreId] = useState(initialStoreId);
  const [qty, setQty] = useState(() => String(qtyOf(row, initialStoreId)));
  const [min, setMin] = useState(() => String(minOf(row, initialStoreId)));
  const [reason, setReason] = useState('');

  // Al cambiar de tienda, recarga cantidad/mínimo del producto en esa tienda.
  const onStore = (id: string): void => {
    setStoreId(id);
    setQty(String(qtyOf(row, id)));
    setMin(String(minOf(row, id)));
  };

  const mutation = useMutation({
    mutationFn: async () => {
      await adjustStock({
        productId: row.productId,
        storeId,
        newQuantity: Number(qty),
        reason: reason.trim() || 'Ajuste manual desde backoffice',
      });
      await setMinStock({ productId: row.productId, storeId, minStock: Number(min) });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['stock-global'] });
      void qc.invalidateQueries({ queryKey: ['stock-movements'] });
      void qc.invalidateQueries({ queryKey: ['stock-alerts'] });
      onClose();
    },
  });

  const qtyValid = Number.isInteger(Number(qty)) && Number(qty) >= 0;
  const minValid = Number.isInteger(Number(min)) && Number(min) >= 0;
  const canSubmit = Boolean(storeId) && qtyValid && minValid && !mutation.isPending;

  return (
    <Modal
      onClose={onClose}
      className="modal--form"
      testId="stock-adjust-form"
      ariaLabel="Ajustar existencias"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) mutation.mutate();
      }}
    >
      <header className="modal-head">
        <h3>Ajustar existencias</h3>
        <p className="ex-modal-sub">{row.name}</p>
      </header>
      <div className="modal-body">
        <section className="form-section">
          <span className="form-section-title">Tienda</span>
          <Select
            value={storeId}
            onChange={onStore}
            ariaLabel="Tienda"
            data-testid="stock-adjust-store"
            options={stores.map((s) => ({ value: s.id, label: s.name }))}
          />
        </section>

        <div className="modal-row">
          <section className="form-section">
            <label className="form-section-title" htmlFor="adjust-qty">
              Existencias
            </label>
            <Input
              id="adjust-qty"
              type="number"
              min={0}
              step={1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              data-testid="stock-adjust-qty"
            />
          </section>
          <section className="form-section">
            <label className="form-section-title" htmlFor="adjust-min">
              Stock mínimo
            </label>
            <Input
              id="adjust-min"
              type="number"
              min={0}
              step={1}
              value={min}
              onChange={(e) => setMin(e.target.value)}
              data-testid="stock-adjust-min"
            />
          </section>
        </div>

        <section className="form-section">
          <label className="form-section-title" htmlFor="adjust-reason">
            Motivo
          </label>
          <Input
            id="adjust-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Recuento, merma, rotura…"
            data-testid="stock-adjust-reason"
          />
        </section>
      </div>
      {mutation.isError && (
        <p className="form-error">
          {formErrorMessage(mutation.error, 'No se pudo guardar el ajuste.')}
        </p>
      )}
      <div className="modal-foot modal-foot-actions">
        <button type="button" onClick={onClose}>
          Cancelar
        </button>
        <Button type="submit" disabled={!canSubmit} data-testid="stock-adjust-save">
          {mutation.isPending ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </Modal>
  );
}
