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
import { usePageHeader } from './lib/pageHeader.js';

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

// Versiones condensadas para las celdas de la tabla (el texto largo se reserva
// para la previsualización del modal).
function conditionShort(p: { conditionType: PromoConditionType; threshold: number }): string {
  return p.conditionType === 'min_qty'
    ? `≥ ${p.threshold} productos`
    : `≥ ${p.threshold} € de ticket`;
}
function discountShort(p: { discountType: PromoDiscountType; discountValue: number }): string {
  return p.discountType === 'percent' ? `−${p.discountValue}%` : `−${p.discountValue} €`;
}

// Vigencia compacta «20 may. – 30 jun. 2026». Las fechas llegan como YYYY-MM-DD;
// se parsean en horario local para no desplazar el día por zona horaria.
const fmtDM = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
const fmtDMY = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
function parseLocal(d: string): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, day ?? 1);
}
function dateRange(start: string, end: string): string {
  const s = parseLocal(start);
  const e = parseLocal(end);
  const startLabel = s.getFullYear() === e.getFullYear() ? fmtDM.format(s) : fmtDMY.format(s);
  return `${startLabel} – ${fmtDMY.format(e)}`;
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

  usePageHeader('Promociones', 'Descuentos y reglas programables');

  return (
    <section className="catalog">
      <div className="table-panel">
        <div className="table-toolbar">
          <Select
            className="promo-filter-select"
            value={filter}
            onChange={(value) => setFilter(value as 'all' | PromoStatus)}
            ariaLabel="Filtrar por estado"
            data-testid="promo-filters"
            options={STATUS_FILTERS.map((f) => ({ value: f.id, label: f.label }))}
          />
          <button
            className="btn-primary"
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
          <table className="catalog-table promo-table" data-testid="promo-list">
            <thead>
              <tr>
                <th>Promoción</th>
                <th>Condición</th>
                <th>Descuento</th>
                <th>Vigencia</th>
                <th>Estado</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const status = promoStatus(p);
                const canToggle = status === 'activa' || status === 'pausada';
                return (
                  <tr key={p.id} data-testid="promo-card">
                    <td className="promo-name-cell">{p.name}</td>
                    <td className="muted">{conditionShort(p)}</td>
                    <td>
                      <span className="promo-discount">{discountShort(p)}</span>
                    </td>
                    <td className="muted">{dateRange(p.startDate, p.endDate)}</td>
                    <td>
                      <span className={`promo-badge promo-${status}`} data-testid="promo-status">
                        {STATUS_LABEL[status]}
                      </span>
                    </td>
                    <td className="promo-actions-cell">
                      {canToggle && (
                        <button
                          className="link-btn"
                          onClick={() => toggle(p.id)}
                          data-testid="promo-toggle"
                        >
                          {p.active ? 'Pausar' : 'Activar'}
                        </button>
                      )}
                      <button
                        className="link-btn"
                        onClick={() => setForm({ ...p })}
                        data-testid="promo-edit"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

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
