import { Button, Input, Select, usePageHeader } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { sileo } from 'sileo';

import { useConfirm } from './components/ConfirmProvider.js';
import { CsvActionButton } from './components/CsvActionButton.js';
import { ImportExportModal } from './components/ImportExportModal.js';
import { Modal } from './components/Modal.js';
import { formErrorMessage } from './lib/form-error.js';
import { usePageActions } from './lib/pageActions.js';
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
} from './lib/promotions.js';
import { useTableShellHeight } from './lib/useTableShellHeight.js';
import {
  activeFacetCount,
  activeSavedView,
  applySavedView,
  condClause,
  condShort,
  dateRange,
  discPhrase,
  discShort,
  EMPTY_PROMO_FACETS,
  filterPromotions,
  isExpiringSoon,
  type PromoFacetGroupKey,
  type PromoFacetState,
  type PromoSavedViewId,
  type PromoSortMode,
  searchBase,
  sortPromotions,
  statusChips,
  todayLocal,
} from './promotions/promo-facets.js';
import { PromotionDetail } from './promotions/PromotionDetail.js';
import { type PromoFacetGroupView, PromotionFacets } from './promotions/PromotionFacets.js';
import { PromotionList } from './promotions/PromotionList.js';

const STATUS_LABEL: Record<PromoStatus, string> = {
  activa: 'Activa',
  programada: 'Programada',
  expirada: 'Expirada',
  pausada: 'Pausada',
};

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

function toForm(p: Promotion): PromoForm {
  return { ...p };
}

function toInput(f: PromoForm): CreatePromotionInput {
  return {
    name: f.name.trim(),
    conditionType: f.conditionType,
    threshold: f.threshold,
    discountType: f.discountType,
    discountValue: f.discountValue,
    startDate: f.startDate,
    endDate: f.endDate,
    active: f.active,
  };
}

function promoToInput(p: Promotion): CreatePromotionInput {
  return {
    name: p.name,
    conditionType: p.conditionType,
    threshold: p.threshold,
    discountType: p.discountType,
    discountValue: p.discountValue,
    startDate: p.startDate,
    endDate: p.endDate,
    active: p.active,
  };
}

/** Alterna `key` en un set de facetas tipado (devuelve un set nuevo, sin mutar). */
function toggleInSet<T extends string>(set: ReadonlySet<T>, key: string): Set<T> {
  const next = new Set(set);
  if (next.has(key as T)) next.delete(key as T);
  else next.add(key as T);
  return next;
}

export function PromotionsPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  // `today` se fija una vez por montaje: el estado de cada promoción (activa, programada…)
  // es una derivación de presentación sobre la fecha de hoy, no un dato del servidor.
  const today = useMemo(() => todayLocal(), []);

  const { data: promos = [] } = useQuery({ queryKey: ['promotions'], queryFn: listPromotions });
  const invalidate = (): Promise<void> => qc.invalidateQueries({ queryKey: ['promotions'] });

  const [facets, setFacets] = useState<PromoFacetState>(EMPTY_PROMO_FACETS);
  const [sortMode, setSortMode] = useState<PromoSortMode>('estado');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<PromoForm | null>(null);
  const [dataModal, setDataModal] = useState<'export' | null>(null);
  const shellHeight = useTableShellHeight();

  // ── Filtrado + orden + selección ────────────────────────────────────────────
  const filtered = useMemo(
    () => sortPromotions(filterPromotions(promos, facets, today), sortMode, today),
    [promos, facets, today, sortMode],
  );
  const chips = useMemo(() => statusChips(filtered, today), [filtered, today]);
  const selected = useMemo(() => {
    const inFiltered = selectedId ? filtered.find((p) => p.id === selectedId) : undefined;
    return inFiltered ?? filtered[0] ?? null;
  }, [selectedId, filtered]);

  // ── Facetas + vistas guardadas (recuentos sobre la base de búsqueda) ─────────
  const base = useMemo(() => searchBase(promos, facets.search), [promos, facets.search]);
  const cnt = (pred: (p: Promotion) => boolean): number => base.filter(pred).length;

  const groups: PromoFacetGroupView[] = [
    {
      key: 'estados',
      title: 'Estado',
      options: [
        {
          key: 'activa',
          label: 'Activas',
          count: cnt((p) => promoStatus(p, today) === 'activa'),
          active: facets.estados.has('activa'),
        },
        {
          key: 'programada',
          label: 'Programadas',
          count: cnt((p) => promoStatus(p, today) === 'programada'),
          active: facets.estados.has('programada'),
        },
        {
          key: 'pausada',
          label: 'Pausadas',
          count: cnt((p) => promoStatus(p, today) === 'pausada'),
          active: facets.estados.has('pausada'),
        },
        {
          key: 'expirada',
          label: 'Expiradas',
          count: cnt((p) => promoStatus(p, today) === 'expirada'),
          active: facets.estados.has('expirada'),
        },
      ],
    },
    {
      key: 'condiciones',
      title: 'Condición',
      options: [
        {
          key: 'min_qty',
          label: 'Por nº de productos',
          count: cnt((p) => p.conditionType === 'min_qty'),
          active: facets.condiciones.has('min_qty'),
        },
        {
          key: 'min_ticket',
          label: 'Por importe de ticket',
          count: cnt((p) => p.conditionType === 'min_ticket'),
          active: facets.condiciones.has('min_ticket'),
        },
      ],
    },
    {
      key: 'descuentos',
      title: 'Descuento',
      options: [
        {
          key: 'percent',
          label: 'Porcentaje (%)',
          count: cnt((p) => p.discountType === 'percent'),
          active: facets.descuentos.has('percent'),
        },
        {
          key: 'amount',
          label: 'Importe fijo (€)',
          count: cnt((p) => p.discountType === 'amount'),
          active: facets.descuentos.has('amount'),
        },
      ],
    },
  ];

  const cntStatus = (s: PromoStatus): number =>
    promos.filter((p) => promoStatus(p, today) === s).length;
  const av = activeSavedView(facets);
  const savedViewDefs: Array<{ id: PromoSavedViewId; label: string; count: number }> = [
    { id: 'all', label: 'Todas', count: promos.length },
    { id: 'activas', label: 'Activas', count: cntStatus('activa') },
    { id: 'programadas', label: 'Programadas', count: cntStatus('programada') },
    { id: 'pausadas', label: 'Pausadas', count: cntStatus('pausada') },
    { id: 'expiradas', label: 'Expiradas', count: cntStatus('expirada') },
    {
      id: 'vencen',
      label: 'Vencen pronto',
      count: promos.filter((p) => isExpiringSoon(p, today)).length,
    },
  ];
  const savedViews = savedViewDefs.map((v) => ({ ...v, active: av === v.id }));

  // Alternar una faceta limpia la vista «vencen pronto» (son ejes distintos del mismo carril).
  const toggleFacet = (groupKey: PromoFacetGroupKey, optKey: string): void => {
    setFacets((f) => {
      if (groupKey === 'estados') {
        return { ...f, estados: toggleInSet(f.estados, optKey), soon: false };
      }
      if (groupKey === 'condiciones') {
        return { ...f, condiciones: toggleInSet(f.condiciones, optKey), soon: false };
      }
      return { ...f, descuentos: toggleInSet(f.descuentos, optKey), soon: false };
    });
  };
  const clearFilters = (): void =>
    setFacets((f) => ({
      ...EMPTY_PROMO_FACETS,
      estados: new Set(),
      condiciones: new Set(),
      descuentos: new Set(),
      search: f.search,
    }));

  // ── Mutaciones ───────────────────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: (f: PromoForm) =>
      f.id ? updatePromotion(f.id, toInput(f)) : createPromotion(toInput(f)),
    onSuccess: (saved, f) => {
      void invalidate();
      setForm(null);
      setSelectedId(saved.id);
      sileo.success({ title: f.id ? 'Promoción actualizada' : 'Promoción creada' });
    },
    onError: (e) => sileo.error({ title: formErrorMessage(e, 'No se pudo guardar la promoción') }),
  });
  const pauseMut = useMutation({
    mutationFn: (p: Promotion) => updatePromotion(p.id, { active: !p.active }),
    onSuccess: (_saved, p) => {
      void invalidate();
      sileo.success({ title: p.active ? 'Promoción pausada' : 'Promoción activada' });
    },
    onError: (e) => sileo.error({ title: formErrorMessage(e, 'No se pudo cambiar el estado') }),
  });
  const dupMut = useMutation({
    mutationFn: (p: Promotion) =>
      createPromotion({ ...promoToInput(p), name: `${p.name} (copia)` }),
    onSuccess: (created) => {
      void invalidate();
      setSelectedId(created.id);
      sileo.success({ title: 'Promoción duplicada' });
    },
    onError: (e) => sileo.error({ title: formErrorMessage(e, 'No se pudo duplicar la promoción') }),
  });
  const delMut = useMutation({
    mutationFn: (p: Promotion) => deletePromotion(p.id),
    onSuccess: (_data, p) => {
      void invalidate();
      setSelectedId((cur) => (cur === p.id ? null : cur));
      sileo.success({ title: 'Promoción eliminada' });
    },
    onError: (e) => sileo.error({ title: formErrorMessage(e, 'No se pudo eliminar la promoción') }),
  });

  const removePromo = async (p: Promotion): Promise<void> => {
    const ok = await confirm({
      title: 'Eliminar promoción',
      message: `¿Eliminar la promoción "${p.name}"? Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (ok) delMut.mutate(p);
  };

  // ── Cabecera + acciones flotantes (export · nueva) ───────────────────────────
  usePageHeader('Promociones', 'Descuentos y reglas programables');
  usePageActions(
    <>
      <CsvActionButton
        kind="export"
        label="Exportar"
        onClick={() => setDataModal('export')}
        testId="promotions-export"
      />
      <Button
        onClick={() => setForm({ ...EMPTY })}
        data-testid="new-promo"
        icon={<Plus size={16} aria-hidden="true" />}
      >
        Nueva promoción
      </Button>
    </>,
  );

  const exportHeaders = ['Promoción', 'Condición', 'Descuento', 'Vigencia', 'Estado'];
  const buildExportRows = (): string[][] =>
    filtered.map((p) => [
      p.name,
      condShort(p),
      discShort(p),
      dateRange(p.startDate, p.endDate),
      STATUS_LABEL[promoStatus(p, today)],
    ]);

  const hasFilters = activeFacetCount(facets) > 0 || facets.search.trim() !== '';

  return (
    <div className="promo-page" data-testid="promotions-page" style={{ height: shellHeight }}>
      <div className="promo-card">
        <div className="promo-layout">
          <PromotionFacets
            search={facets.search}
            onSearchChange={(v) => setFacets((f) => ({ ...f, search: v }))}
            savedViews={savedViews}
            onSavedView={(id) => setFacets((f) => ({ ...applySavedView(id), search: f.search }))}
            groups={groups}
            onToggleFacet={toggleFacet}
            showClear={activeFacetCount(facets) > 0}
            clearCount={activeFacetCount(facets)}
            onClear={clearFilters}
          />
          <PromotionList
            rows={filtered}
            total={promos.length}
            chips={chips}
            today={today}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
            sortMode={sortMode}
            onToggleSort={() => setSortMode((m) => (m === 'estado' ? 'vigencia' : 'estado'))}
            hasFilters={hasFilters}
            onClearFilters={clearFilters}
          />
          <PromotionDetail
            promo={selected}
            today={today}
            onEdit={(p) => setForm(toForm(p))}
            onTogglePause={(p) => pauseMut.mutate(p)}
            onDuplicate={(p) => dupMut.mutate(p)}
            onDelete={(p) => void removePromo(p)}
          />
        </div>
      </div>

      {form && (
        <PromoModal
          form={form}
          onChange={setForm}
          onClose={() => setForm(null)}
          onSave={(f) => saveMut.mutate(f)}
          saving={saveMut.isPending}
        />
      )}

      {dataModal && (
        <ImportExportModal
          title="Promociones"
          initialMode={dataModal}
          onClose={() => setDataModal(null)}
          testId="promotions-data-modal"
          exportConfig={{
            headers: exportHeaders,
            getRows: buildExportRows,
            filenameBase: 'promociones',
          }}
        />
      )}
    </div>
  );
}

function PromoModal({
  form,
  onChange,
  onClose,
  onSave,
  saving,
}: {
  form: PromoForm;
  onChange: (f: PromoForm) => void;
  onClose: () => void;
  onSave: (f: PromoForm) => void;
  saving: boolean;
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
        <Input
          required
          value={form.name}
          placeholder="Nombre de la promoción"
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
          <Input
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
              { value: 'percent', label: 'Descuento (%)' },
              { value: 'amount', label: 'Descuento (€)' },
            ]}
          />
        </label>
        <label>
          Valor
          <Input
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
          <Input
            type="date"
            value={form.startDate}
            onChange={(e) => onChange({ ...form, startDate: e.target.value })}
            data-testid="promo-start"
          />
        </label>
        <label>
          Fin
          <Input
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
        Activa (visible en el TPV mientras esté vigente)
      </label>

      <div className="promo-preview" data-testid="promo-preview">
        <span className="promo-preview-title">Previsualización del impacto</span>
        <p>
          {condClause(form)} → <strong>{discPhrase(form)}</strong>.
        </p>
        <p className="muted">
          Vigente del {form.startDate} al {form.endDate}.
        </p>
      </div>

      <div className="modal-foot">
        <button type="button" onClick={onClose}>
          Cancelar
        </button>
        <Button type="submit" disabled={!valid || saving} data-testid="promo-save">
          {form.id ? (saving ? 'Guardando…' : 'Guardar') : saving ? 'Creando…' : 'Crear'}
        </Button>
      </div>
    </Modal>
  );
}
