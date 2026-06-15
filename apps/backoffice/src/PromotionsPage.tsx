import { DataTable, Select } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Modal } from './components/Modal.js';
import { usePageHeader } from './lib/pageHeader.js';
import {
  createPromotion,
  type CreatePromotionInput,
  deletePromotion,
  listPromotions,
  type PromoConditionType,
  type PromoDiscountType,
  type PromoStatus,
  promoStatus,
  type Promotion,
  updatePromotion,
  type UpdatePromotionInput,
} from './lib/promotions.js';

const STATUS_LABEL: Record<PromoStatus, string> = {
  activa: 'Activa',
  programada: 'Programada',
  expirada: 'Expirada',
  pausada: 'Pausada',
};
// Tres grupos de filtrado (informe §5): activas, programadas e inactivas
// (expiradas + pausadas). Se muestran todos por defecto y cada chip los alterna.
type PromoGroup = 'activa' | 'programada' | 'inactiva';
const PROMO_GROUPS: { id: PromoGroup; label: string }[] = [
  { id: 'activa', label: 'Activas' },
  { id: 'programada', label: 'Programadas' },
  { id: 'inactiva', label: 'Inactivas' },
];
function promoGroup(p: Promotion): PromoGroup {
  const s = promoStatus(p);
  return s === 'activa' || s === 'programada' ? s : 'inactiva';
}
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

type PromoForm = Omit<Promotion, 'id'> & { id?: string };
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

function toInput(f: PromoForm): CreatePromotionInput {
  return {
    name: f.name,
    conditionType: f.conditionType,
    threshold: f.threshold,
    discountType: f.discountType,
    discountValue: f.discountValue,
    startDate: f.startDate,
    endDate: f.endDate,
    active: f.active,
  };
}

export function PromotionsPage() {
  const qc = useQueryClient();
  const { data: promos = [] } = useQuery({ queryKey: ['promotions'], queryFn: listPromotions });
  const invalidate = (): void => void qc.invalidateQueries({ queryKey: ['promotions'] });
  // Grupos visibles: los tres activos por defecto (se ven todas las promociones).
  const [groups, setGroups] = useState<Set<PromoGroup>>(
    () => new Set<PromoGroup>(['activa', 'programada', 'inactiva']),
  );
  const toggleGroup = (g: PromoGroup): void =>
    setGroups((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  const [form, setForm] = useState<PromoForm | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  const visible = useMemo(() => promos.filter((p) => groups.has(promoGroup(p))), [promos, groups]);

  // ── Selección múltiple + acciones en lote (mismo patrón que Usuarios) ──
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const toggleSelect = (id: string): void =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const clearSelection = (): void => setSelected([]);
  const allVisibleSelected = visible.length > 0 && visible.every((p) => selectedSet.has(p.id));
  const selectAllVisible = (): void =>
    setSelected((prev) => [...new Set([...prev, ...visible.map((p) => p.id)])]);

  const selectedPromos = useMemo(
    () => promos.filter((p) => selectedSet.has(p.id)),
    [promos, selectedSet],
  );
  // Pausar/activar solo aplica a las que están vigentes (activa ⇄ pausada).
  const activeSel = selectedPromos.filter((p) => promoStatus(p) === 'activa');
  const pausedSel = selectedPromos.filter((p) => promoStatus(p) === 'pausada');

  const createMut = useMutation({
    mutationFn: (f: PromoForm) => createPromotion(toInput(f)),
    onSuccess: () => {
      setForm(null);
      clearSelection();
      invalidate();
    },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePromotionInput }) =>
      updatePromotion(id, input),
    onSuccess: invalidate,
  });

  const save = (f: PromoForm): void => {
    if (f.id) {
      updateMut.mutate(
        { id: f.id, input: toInput(f) },
        {
          onSuccess: () => {
            setForm(null);
            clearSelection();
            invalidate();
          },
        },
      );
    } else {
      createMut.mutate(f);
    }
  };
  const editSelected = (): void => {
    const target = selectedPromos[0];
    if (target) setForm({ ...target });
  };
  // Acciones en lote: una mutación por id (sin endpoint bulk) + invalidación al final.
  const setActiveFor = (ids: Set<string>, active: boolean): void => {
    void Promise.all([...ids].map((id) => updatePromotion(id, { active }))).then(() => {
      clearSelection();
      invalidate();
    });
  };
  const pauseSelected = (): void => setActiveFor(new Set(activeSel.map((p) => p.id)), false);
  const activateSelected = (): void => setActiveFor(new Set(pausedSel.map((p) => p.id)), true);
  const removeSelected = (): void => {
    void Promise.all(selected.map((id) => deletePromotion(id))).then(() => {
      clearSelection();
      invalidate();
    });
  };

  usePageHeader('Promociones', 'Descuentos y reglas programables');

  return (
    <section className="catalog">
      <div className="table-panel">
        <div className="users-toolbar">
          <div className="sales-filters">
            <div className="promo-chips" role="group" aria-label="Filtrar por estado">
              {PROMO_GROUPS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={`promo-chip${groups.has(g.id) ? ' is-on' : ''}`}
                  aria-pressed={groups.has(g.id)}
                  onClick={() => toggleGroup(g.id)}
                  data-testid={`promo-group-${g.id}`}
                >
                  {g.label}
                </button>
              ))}
            </div>
            {selected.length > 0 && (
              <>
                {!allVisibleSelected && (
                  <button
                    type="button"
                    className="users-sel-btn"
                    onClick={selectAllVisible}
                    data-testid="promo-select-all"
                  >
                    Seleccionar todo
                  </button>
                )}
                <button
                  type="button"
                  className="users-sel-btn"
                  onClick={clearSelection}
                  data-testid="promo-clear"
                >
                  Quitar selección
                </button>
              </>
            )}
          </div>
          {selected.length > 0 ? (
            <div className="users-toolbar-actions">
              {selected.length === 1 && (
                <button
                  type="button"
                  className="users-bulk-edit"
                  onClick={editSelected}
                  data-testid="promo-edit"
                >
                  Editar
                </button>
              )}
              {activeSel.length > 0 && (
                <button
                  type="button"
                  className="promo-bulk-toggle"
                  onClick={pauseSelected}
                  data-testid="promo-pause"
                >
                  Pausar{activeSel.length > 1 ? ` (${activeSel.length})` : ''}
                </button>
              )}
              {pausedSel.length > 0 && (
                <button
                  type="button"
                  className="promo-bulk-toggle"
                  onClick={activateSelected}
                  data-testid="promo-activate"
                >
                  Activar{pausedSel.length > 1 ? ` (${pausedSel.length})` : ''}
                </button>
              )}
              <button
                type="button"
                className="users-bulk-del"
                onClick={removeSelected}
                data-testid="promo-delete"
              >
                Borrar{selected.length > 1 ? ` (${selected.length})` : ''}
              </button>
            </div>
          ) : (
            <button
              className="btn-primary"
              onClick={() => setForm({ ...EMPTY })}
              data-testid="new-promo"
            >
              <Plus size={16} aria-hidden="true" />
              Nueva promoción
            </button>
          )}
        </div>

        <DataTable
          className={`promo-table${selected.length ? ' has-selection' : ''}`}
          data-testid="promo-list"
          rowTestId="promo-card"
          rows={visible}
          rowKey={(p) => p.id}
          onRowClick={(p) => toggleSelect(p.id)}
          rowClassName={(p) => (selectedSet.has(p.id) ? 'is-selected' : undefined)}
          rowAriaSelected={(p) => selectedSet.has(p.id)}
          emptyState={
            <span className="catalog-empty" data-testid="promos-empty">
              No hay promociones con ese estado.
            </span>
          }
          columns={[
            {
              key: 'select',
              header: '',
              width: '3rem',
              render: (p) => (
                <input
                  type="checkbox"
                  className="user-check"
                  aria-label={`Seleccionar ${p.name}`}
                  data-testid="promo-select"
                  checked={selectedSet.has(p.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleSelect(p.id)}
                />
              ),
            },
            { key: 'name', header: 'Promoción', render: (p) => p.name },
            {
              key: 'condition',
              header: 'Condición',
              render: (p) => <span className="muted">{conditionShort(p)}</span>,
            },
            {
              key: 'discount',
              header: 'Descuento',
              render: (p) => <span className="promo-discount">{discountShort(p)}</span>,
            },
            {
              key: 'validity',
              header: 'Vigencia',
              render: (p) => <span className="muted">{dateRange(p.startDate, p.endDate)}</span>,
            },
            {
              key: 'status',
              header: 'Estado',
              render: (p) => {
                const status = promoStatus(p);
                return (
                  <span className={`promo-badge promo-${status}`} data-testid="promo-status">
                    {STATUS_LABEL[status]}
                  </span>
                );
              },
            },
          ]}
        />
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
    <Modal
      onClose={onClose}
      className="modal--form"
      testId="promo-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(form);
      }}
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
            onChange={(value) => onChange({ ...form, conditionType: value as PromoConditionType })}
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
    </Modal>
  );
}
