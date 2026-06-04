import { Select } from '@simpletpv/ui';
import { useMemo, useState } from 'react';

import {
  DEMO_PROMOTIONS,
  type DemoPromotion,
  type PromoConditionType,
  type PromoDiscountType,
  type PromoStatus,
  promoStatus,
} from './demo/demoData.js';

const STATUS_LABEL: Record<PromoStatus, string> = {
  activa: 'Activa',
  programada: 'Programada',
  expirada: 'Expirada',
  pausada: 'Pausada',
};
const STATUS_FILTERS: { id: 'all' | PromoStatus; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'activa', label: 'Activas' },
  { id: 'programada', label: 'Programadas' },
  { id: 'expirada', label: 'Expiradas' },
  { id: 'pausada', label: 'Pausadas' },
];
function conditionText(p: { conditionType: PromoConditionType; threshold: number }): string {
  return p.conditionType === 'min_qty'
    ? `Si el ticket lleva ${p.threshold} o más productos`
    : `Si el ticket supera ${p.threshold} €`;
}
function actionText(p: { discountType: PromoDiscountType; discountValue: number }): string {
  return p.discountType === 'percent'
    ? `descuento del ${p.discountValue}%`
    : `descuento de ${p.discountValue} €`;
}

type PromoForm = Omit<DemoPromotion, 'id'> & { id?: string };
const EMPTY: PromoForm = {
  name: '',
  conditionType: 'min_qty',
  threshold: 2,
  discountType: 'percent',
  discountValue: 10,
  startDate: '2026-06-01',
  endDate: '2026-06-30',
  active: true,
};

export function PromotionsPage() {
  const [promos, setPromos] = useState<DemoPromotion[]>(DEMO_PROMOTIONS);
  const [filter, setFilter] = useState<'all' | PromoStatus>('all');
  const [form, setForm] = useState<PromoForm | null>(null);

  const visible = useMemo(
    () => promos.filter((p) => filter === 'all' || promoStatus(p) === filter),
    [promos, filter],
  );
  const save = (f: PromoForm): void => {
    if (f.id) {
      const id = f.id;
      setPromos((prev) => prev.map((p) => (p.id === id ? { ...(f as DemoPromotion) } : p)));
    } else {
      setPromos((prev) => [{ ...(f as DemoPromotion), id: `promo-${prev.length + 1}` }, ...prev]);
    }
    setForm(null);
  };
  const toggle = (id: string): void =>
    setPromos((prev) => prev.map((p) => (p.id === id ? { ...p, active: !p.active } : p)));

  return (
    <section className="catalog">
      <header className="catalog-head">
        <div>
          <h2>Promociones</h2>
          <p className="catalog-sub">Descuentos y reglas programables</p>
        </div>
      </header>

      <div className="stock-tabs-row">
        <nav className="bo-tabs" data-testid="promo-filters">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`bo-tab ${filter === f.id ? 'active' : ''}`}
              onClick={() => setFilter(f.id)}
              data-testid={`promo-filter-${f.id}`}
            >
              {f.label}
            </button>
          ))}
        </nav>
        <button
          className="btn-primary stock-tabs-action"
          onClick={() => setForm({ ...EMPTY })}
          data-testid="new-promo"
        >
          Nueva promoción
        </button>
      </div>

      {visible.length === 0 ? (
        <p className="catalog-empty" data-testid="promos-empty">
          No hay promociones con ese estado.
        </p>
      ) : (
        <div className="promo-list" data-testid="promo-list">
          {visible.map((p) => {
            const status = promoStatus(p);
            return (
              <div className="promo-card" key={p.id} data-testid="promo-card">
                <div className="promo-card-main">
                  <div className="promo-card-head">
                    <span className="promo-name">{p.name}</span>
                    <span className={`promo-badge promo-${status}`} data-testid="promo-status">
                      {STATUS_LABEL[status]}
                    </span>
                  </div>
                  <p className="promo-rule">
                    {conditionText(p)} → <strong>{actionText(p)}</strong>.
                  </p>
                  <p className="promo-dates">
                    Del {p.startDate} al {p.endDate}
                  </p>
                </div>
                <div className="promo-card-actions">
                  <button
                    className="link-btn"
                    onClick={() => toggle(p.id)}
                    data-testid="promo-toggle"
                  >
                    {p.active ? 'Pausar' : 'Activar'}
                  </button>
                  <button
                    className="link-btn"
                    onClick={() => setForm({ ...p })}
                    data-testid="promo-edit"
                  >
                    Editar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {form && (
        <PromoModal form={form} onChange={setForm} onClose={() => setForm(null)} onSave={save} />
      )}
    </section>
  );
}

function PromoModal({
  form,
  onChange,
  onClose,
  onSave,
}: {
  form: PromoForm;
  onChange: (f: PromoForm) => void;
  onClose: () => void;
  onSave: (f: PromoForm) => void;
}) {
  const valid =
    form.name.trim().length > 0 &&
    form.threshold > 0 &&
    form.discountValue > 0 &&
    form.startDate <= form.endDate;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="modal modal--form"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSave(form);
        }}
        data-testid="promo-form"
      >
        <h3>{form.id ? 'Editar promoción' : 'Nueva promoción'}</h3>
        <label>
          Nombre
          <input
            required
            value={form.name}
            onChange={(e) => onChange({ ...form, name: e.target.value })}
            data-testid="promo-name"
          />
        </label>
        <div className="modal-row">
          <label>
            Condición
            <Select
              value={form.conditionType}
              onChange={(value) =>
                onChange({ ...form, conditionType: value as PromoConditionType })
              }
              ariaLabel="Condición de la promoción"
              data-testid="promo-condition"
              options={[
                { value: 'min_qty', label: 'Nº de productos ≥' },
                { value: 'min_ticket', label: 'Importe del ticket ≥ (€)' },
              ]}
            />
          </label>
          <label>
            Umbral
            <input
              type="number"
              min={1}
              value={form.threshold}
              onChange={(e) => onChange({ ...form, threshold: Number(e.target.value) })}
              data-testid="promo-threshold"
            />
          </label>
        </div>
        <div className="modal-row">
          <label>
            Acción
            <Select
              value={form.discountType}
              onChange={(value) => onChange({ ...form, discountType: value as PromoDiscountType })}
              ariaLabel="Tipo de descuento"
              data-testid="promo-discount-type"
              options={[
                { value: 'percent', label: 'Descuento %' },
                { value: 'amount', label: 'Descuento €' },
              ]}
            />
          </label>
          <label>
            Valor
            <input
              type="number"
              min={1}
              value={form.discountValue}
              onChange={(e) => onChange({ ...form, discountValue: Number(e.target.value) })}
              data-testid="promo-discount-value"
            />
          </label>
        </div>
        <div className="modal-row">
          <label>
            Inicio
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => onChange({ ...form, startDate: e.target.value })}
              data-testid="promo-start"
            />
          </label>
          <label>
            Fin
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => onChange({ ...form, endDate: e.target.value })}
              data-testid="promo-end"
            />
          </label>
        </div>
        <label className="user-active-check">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => onChange({ ...form, active: e.target.checked })}
            data-testid="promo-active"
          />
          Activa
        </label>

        <div className="promo-preview" data-testid="promo-preview">
          <span className="promo-preview-title">Previsualización del impacto</span>
          <p>
            {conditionText(form)} → <strong>{actionText(form)}</strong>.
          </p>
          <p className="muted">
            Vigente del {form.startDate} al {form.endDate}.
          </p>
        </div>

        <div className="modal-foot">
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={!valid} data-testid="promo-save">
            {form.id ? 'Guardar' : 'Crear'}
          </button>
        </div>
      </form>
    </div>
  );
}
