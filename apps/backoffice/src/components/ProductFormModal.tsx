import { Button, Input, Select } from '@simpletpv/ui';
import { useState } from 'react';

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

// Margen sobre PVP en vivo: (PVP − coste) / PVP. Devuelve null sin PVP válido.
interface Margin {
  pct: number;
  eur: number;
  note: string;
}
function computeMargin(sale: number, cost: number): Margin | null {
  if (!(sale > 0)) return null;
  const eur = sale - cost;
  const pct = Math.round((eur / sale) * 100);
  // Etiqueta cualitativa del margen (orienta sin sustituir al número).
  let note = 'Margen saludable';
  if (pct <= 0) note = 'Sin margen';
  else if (pct < 20) note = 'Margen ajustado';
  else if (pct < 40) note = 'Margen correcto';
  return { pct, eur, note };
}

// Inicial para el avatar de la cabecera (primer carácter del nombre, o ·).
function avatarInitial(name: string): string {
  const ch = name.trim()[0];
  return ch ? ch.toUpperCase() : '·';
}

// Input numérico con spinners personalizados (dos mitades, flechas SVG).
// Sustituye los botones nativos del navegador para coherencia visual con Geist.
function NumInput({
  value,
  step,
  min = 0,
  onStep,
  ...inputProps
}: {
  value: number;
  step: number;
  min?: number;
  onStep: (v: number) => void;
} & Omit<React.ComponentProps<typeof Input>, 'type' | 'value' | 'onChange' | 'step' | 'min'>) {
  function inc() {
    onStep(parseFloat((value + step).toFixed(10)));
  }
  function dec() {
    const next = parseFloat((value - step).toFixed(10));
    onStep(next < min ? min : next);
  }
  return (
    <div className="pfm-num">
      <Input
        type="number"
        step={step}
        min={min}
        value={value}
        onChange={(e) => onStep(Number(e.target.value))}
        {...inputProps}
      />
      <div className="pfm-spinners" aria-hidden="true">
        <button
          type="button"
          className="pfm-spinner-btn"
          tabIndex={-1}
          onClick={inc}
          aria-label="Aumentar"
        >
          <svg width="8" height="5" viewBox="0 0 8 5" fill="none">
            <path
              d="M0 4.5L4 0.5L8 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          className="pfm-spinner-btn"
          tabIndex={-1}
          onClick={dec}
          aria-label="Disminuir"
        >
          <svg width="8" height="5" viewBox="0 0 8 5" fill="none">
            <path
              d="M0 0.5L4 4.5L8 0.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

/**
 * Modal de producto, estilo Vercel/Geist (rediseño D-15): cabecera con avatar +
 * subtítulo de contexto, cuerpo a dos columnas (Datos básicos · Clasificación a la
 * izquierda; Precios e IVA + tarjeta de margen en vivo a la derecha) y pie partido
 * con el enlace "Ver movimientos" (despliega `extraSection`) y los CTA. Radio único
 * de 12px en todo el modal (.product-form-modal en catalog.css). Controlado por el
 * padre; el contrato de props no cambia.
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
  /** Sección extra (Movimientos en modo edición, I-12): se muestra al pulsar el enlace del pie. */
  extraSection?: React.ReactNode;
}) {
  const [showExtra, setShowExtra] = useState(false);
  const margin = computeMargin(form.salePrice, form.costPrice);

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
      <header className="modal-head pfm-head">
        <span className="pfm-avatar" aria-hidden="true">
          {avatarInitial(form.name)}
        </span>
        <span className="pfm-head-text">
          <h3>{title}</h3>
          {form.name.trim() && <span className="modal-sub">{form.name}</span>}
        </span>
      </header>

      <div className="modal-body pfm-grid">
        <div className="pfm-col">
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
        </div>

        <div className="pfm-col">
          <section className="form-section">
            <span className="form-section-title">Precios e IVA</span>
            <div className="pfm-prices-grid">
              <label>
                Precio venta (€)
                <NumInput
                  step={0.01}
                  min={0}
                  required
                  value={form.salePrice}
                  onStep={(v) => onChange({ ...form, salePrice: v })}
                  data-testid="form-price"
                />
              </label>
              <label>
                Coste (€)
                <NumInput
                  step={0.01}
                  min={0}
                  value={form.costPrice}
                  onStep={(v) => onChange({ ...form, costPrice: v })}
                  data-testid="form-cost"
                />
              </label>
              <label>
                IVA (%)
                <NumInput
                  step={1}
                  min={0}
                  value={form.taxRate}
                  onStep={(v) => onChange({ ...form, taxRate: v })}
                  data-testid="form-tax"
                />
              </label>
              <div className="pfm-margin-card" data-testid="form-margin">
                <span className="pfm-margin-label">Margen sobre PVP</span>
                {margin ? (
                  <>
                    <span className="pfm-margin-figure">
                      <span className="pfm-margin-pct">{margin.pct}%</span>
                      <span className="pfm-margin-eur">
                        {margin.eur >= 0 ? '+' : ''}
                        {fmtEur(margin.eur)} / ud
                      </span>
                    </span>
                    <span className="pfm-margin-note">{margin.note}</span>
                  </>
                ) : (
                  <span className="pfm-margin-pct pfm-margin-pct--empty">—</span>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>

      {showExtra && extraSection && <div className="pfm-extra">{extraSection}</div>}

      {errorMessage && <p className="form-error">{errorMessage}</p>}

      <div className="modal-foot modal-foot--split">
        {extraSection ? (
          <button
            type="button"
            className="pfm-link"
            aria-expanded={showExtra}
            onClick={() => setShowExtra((v) => !v)}
          >
            Ver movimientos <span aria-hidden="true">{showExtra ? '⌄' : '›'}</span>
          </button>
        ) : (
          <span />
        )}
        <div className="modal-foot-actions">
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <Button type="submit" disabled={pending} data-testid="form-save">
            {primaryLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
