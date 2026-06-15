import { Button, Input, Select } from '@simpletpv/ui';

import { fmtEur } from '../lib/format.js';
import { Modal } from './Modal.js';

// Estado del formulario de producto (alta y edición). Compartido con CatalogPage
// (que orquesta el asistente de edición en lote) y con el panel de productos de
// Familias (alta con la familia precargada, I-13).
export interface ProductFormState {
  id?: string;
  name: string;
  salePrice: number;
  sku: string | null;
  barcode: string | null;
  costPrice: number;
  taxRate: number;
  familyId: string | null;
}

export const EMPTY_PRODUCT_FORM: ProductFormState = {
  name: '',
  salePrice: 0,
  sku: '',
  barcode: '',
  costPrice: 0,
  taxRate: 21,
  familyId: null,
};

// Margen sobre PVP en vivo: (PVP − coste) / PVP. '—' sin PVP.
function marginLabel(sale: number, cost: number): string {
  if (!(sale > 0)) return '—';
  const eur = fmtEur(sale - cost);
  const pct = Math.round(((sale - cost) / sale) * 100);
  return `${eur} · ${pct}%`;
}

/**
 * Modal de producto por secciones (D-15, anti E-04): Datos básicos · Precios e
 * IVA (con margen calculado en vivo) · Clasificación. Usa modal-head/modal-body
 * (scroll interno): nada puede desbordar el modal. Controlado por el padre.
 */
export function ProductFormModal({
  form,
  onChange,
  onSubmit,
  onClose,
  familyOptions,
  pending,
  errorMessage,
  title,
  primaryLabel,
  extraSection,
}: {
  form: ProductFormState;
  onChange: (next: ProductFormState) => void;
  onSubmit: () => void;
  onClose: () => void;
  /** Opciones jerárquicas del selector de familia (sangría por profundidad). */
  familyOptions: Array<{ value: string; label: string }>;
  pending: boolean;
  errorMessage: string | null;
  title: string;
  primaryLabel: string;
  /** Sección extra al final del cuerpo (p. ej. Movimientos en modo edición, I-12). */
  extraSection?: React.ReactNode;
}) {
  return (
    <Modal
      onClose={onClose}
      className="modal--form product-form-modal"
      testId="product-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <header className="modal-head">
        <h3>{title}</h3>
      </header>

      <div className="modal-body">
        <section className="form-section">
          <span className="form-section-title">Datos básicos</span>
          <label>
            Nombre
            <Input
              required
              autoFocus
              value={form.name}
              onChange={(e) => onChange({ ...form, name: e.target.value })}
              data-testid="form-name"
            />
          </label>
          <div className="modal-row">
            <label>
              SKU
              <Input
                value={form.sku ?? ''}
                onChange={(e) => onChange({ ...form, sku: e.target.value })}
                data-testid="form-sku"
              />
            </label>
            <label>
              Código de barras
              <Input
                value={form.barcode ?? ''}
                onChange={(e) => onChange({ ...form, barcode: e.target.value })}
                data-testid="form-barcode"
              />
            </label>
          </div>
        </section>

        <section className="form-section">
          <span className="form-section-title">Precios e IVA</span>
          <div className="modal-row">
            <label>
              Precio venta (€)
              <Input
                type="number"
                step="0.01"
                min={0}
                required
                value={form.salePrice}
                onChange={(e) => onChange({ ...form, salePrice: Number(e.target.value) })}
                data-testid="form-price"
              />
            </label>
            <label>
              Coste (€)
              <Input
                type="number"
                step="0.01"
                min={0}
                value={form.costPrice}
                onChange={(e) => onChange({ ...form, costPrice: Number(e.target.value) })}
                data-testid="form-cost"
              />
            </label>
          </div>
          <div className="modal-row">
            <label>
              IVA (%)
              <Input
                type="number"
                step="1"
                min={0}
                value={form.taxRate}
                onChange={(e) => onChange({ ...form, taxRate: Number(e.target.value) })}
                data-testid="form-tax"
              />
            </label>
            <label>
              Margen (sobre PVP)
              <output className="product-form-margin" data-testid="form-margin">
                {marginLabel(form.salePrice, form.costPrice)}
              </output>
            </label>
          </div>
        </section>

        <section className="form-section">
          <span className="form-section-title">Clasificación</span>
          <label>
            Familia
            <Select
              value={form.familyId ?? ''}
              onChange={(value) => onChange({ ...form, familyId: value || null })}
              options={[{ value: '', label: '— Sin familia —' }, ...familyOptions]}
              ariaLabel="Familia"
              data-testid="form-family"
            />
          </label>
        </section>

        {extraSection}
      </div>

      {errorMessage && <p className="form-error">{errorMessage}</p>}
      <div className="modal-foot">
        <button type="button" onClick={onClose}>
          Cancelar
        </button>
        <Button type="submit" disabled={pending} data-testid="form-save">
          {primaryLabel}
        </Button>
      </div>
    </Modal>
  );
}
