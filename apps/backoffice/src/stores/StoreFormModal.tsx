import { useState } from 'react';

export interface StoreForm {
  name: string;
  code: string;
  address: string;
}

// Modal de alta de tienda. Es autónomo: gestiona su propio formulario y delega el
// alta en `onSubmit`. El padre controla pending/error de la mutación.
export function StoreFormModal({
  onClose,
  onSubmit,
  pending,
  error,
}: {
  onClose: () => void;
  onSubmit: (form: StoreForm) => void;
  pending: boolean;
  error: boolean;
}) {
  const [form, setForm] = useState<StoreForm>({ name: '', code: '', address: '' });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="modal modal--form"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(form);
        }}
        data-testid="store-form"
      >
        <h3>Nueva tienda</h3>
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
        {error && <p className="form-error">No se pudo crear.</p>}
        <div className="modal-foot">
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={pending || !form.name.trim() || !form.code.trim()}
            data-testid="store-save"
          >
            {pending ? 'Guardando…' : 'Crear'}
          </button>
        </div>
      </form>
    </div>
  );
}
