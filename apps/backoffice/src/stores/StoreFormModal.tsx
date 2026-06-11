import { Check, X } from 'lucide-react';
import { useState } from 'react';

import { Modal } from '../components/Modal.js';

export interface StoreForm {
  name: string;
  code: string;
  address: string;
}

// Modal de alta/edición de tienda. Es autónomo: gestiona su propio formulario y
// delega en `onSubmit`. El padre controla pending/error de la mutación. Con
// `initial` precarga los datos (modo edición, I-10).
export function StoreFormModal({
  onClose,
  onSubmit,
  pending,
  error,
  initial,
}: {
  onClose: () => void;
  onSubmit: (form: StoreForm) => void;
  pending: boolean;
  // Mensaje de error a mostrar (null si no hay error). El padre lo deriva con
  // formErrorMessage para enseñar la causa real de la API (D-14).
  error: string | null;
  initial?: StoreForm;
}) {
  const editing = initial !== undefined;
  const [form, setForm] = useState<StoreForm>(initial ?? { name: '', code: '', address: '' });

  return (
    <Modal
      onClose={onClose}
      className="modal--form"
      testId="store-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      <h3>{editing ? 'Editar tienda' : 'Nueva tienda'}</h3>
      <label>
        Nombre
        <input
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          data-testid="store-name"
        />
      </label>
      <label>
        Código (p.ej. &quot;01&quot;)
        <input
          required
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
          data-testid="store-code"
        />
      </label>
      <label>
        Dirección
        <input
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
          data-testid="store-address"
        />
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="modal-foot">
        <button type="button" onClick={onClose}>
          <X size={16} aria-hidden="true" />
          Cancelar
        </button>
        <button
          type="submit"
          className="btn-primary"
          disabled={pending || !form.name.trim() || !form.code.trim()}
          data-testid="store-save"
        >
          <Check size={16} aria-hidden="true" />
          {pending ? 'Guardando…' : editing ? 'Guardar' : 'Crear'}
        </button>
      </div>
    </Modal>
  );
}
