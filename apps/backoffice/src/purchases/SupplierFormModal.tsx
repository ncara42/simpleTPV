import { Button, Input } from '@simpletpv/ui';
import { useState } from 'react';

import { Modal } from '../components/Modal.js';
import { OrderFrequencyField } from './OrderFrequencyField.js';

export interface SupplierForm {
  name: string;
  leadTimeDays: string;
  /** Periodicidad de compra en días; '' = sin definir. */
  orderFrequencyDays: string;
}

// Modal de alta de proveedor. Mismo patrón que StoreFormModal: autónomo, gestiona
// su propio formulario y delega en `onSubmit`. El padre controla pending/error de la
// mutación. Unifica el alta de Proveedores con el resto de tablas (CTA → modal) en
// lugar del antiguo alta inline en el toolbar.
export function SupplierFormModal({
  onClose,
  onSubmit,
  pending,
  error,
}: {
  onClose: () => void;
  onSubmit: (form: SupplierForm) => void;
  pending: boolean;
  error: string | null;
}) {
  const [form, setForm] = useState<SupplierForm>({
    name: '',
    leadTimeDays: '7',
    orderFrequencyDays: '',
  });

  return (
    <Modal
      onClose={onClose}
      className="modal--form"
      testId="supplier-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      <h3>Nuevo proveedor</h3>
      <label>
        Nombre
        <Input
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Nombre del proveedor"
          data-testid="supplier-name"
        />
      </label>
      <label>
        Lead time (días)
        <Input
          type="number"
          min={0}
          required
          value={form.leadTimeDays}
          onChange={(e) => setForm({ ...form, leadTimeDays: e.target.value })}
          data-testid="supplier-leadtime"
        />
      </label>
      <label>
        Periodicidad de compra
        <OrderFrequencyField
          value={form.orderFrequencyDays}
          onChange={(orderFrequencyDays) => setForm({ ...form, orderFrequencyDays })}
          testId="supplier-frequency"
        />
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="modal-foot">
        <button type="button" onClick={onClose}>
          Cancelar
        </button>
        <Button type="submit" disabled={pending || !form.name.trim()} data-testid="supplier-create">
          {pending ? 'Guardando…' : 'Crear'}
        </Button>
      </div>
    </Modal>
  );
}
