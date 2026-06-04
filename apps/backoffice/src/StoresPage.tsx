import { initials } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import {
  DEMO_STORE_OPS,
  DEMO_STORE_SALES,
  type StoreOps,
  type StoreSalesPeriod,
} from './demo/demoData.js';
import { createStore, deleteStore, listStores, type Store } from './lib/admin.js';
import { fmtEur } from './lib/format.js';

interface StoreForm {
  name: string;
  code: string;
  address: string;
}

type StatusFilter = 'all' | 'activa' | 'dormida';

const PERIODS: { id: StoreSalesPeriod; label: string }[] = [
  { id: 'today', label: 'Hoy' },
  { id: 'week', label: '7 días' },
  { id: 'month', label: 'Mes' },
];

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'activa', label: 'Activas' },
  { id: 'dormida', label: 'Dormidas' },
];

// Etiqueta de la cifra de ventas en lenguaje natural (la card es para no técnicos).
const SALES_LABEL: Record<StoreSalesPeriod, string> = {
  today: 'Ventas de hoy',
  week: 'Ventas · últimos 7 días',
  month: 'Ventas de este mes',
};

function salesOf(storeId: string, period: StoreSalesPeriod): number {
  return DEMO_STORE_SALES[storeId]?.[period] ?? 0;
}

export function StoresPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<StoreForm | null>(null);
  const [period, setPeriod] = useState<StoreSalesPeriod>('today');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  // Override local del estado activa/dormida (demo: no hay backend que persista).
  const [activeOverrides, setActiveOverrides] = useState<Record<string, boolean>>({});
  // Estado operativo (fichaje) y dispositivo por tienda; editable en local (demo).
  const [ops, setOps] = useState<Record<string, StoreOps>>(() =>
    Object.fromEntries(Object.entries(DEMO_STORE_OPS).map(([k, v]) => [k, { ...v }])),
  );
  const [detail, setDetail] = useState<Store | null>(null);

  const { data: stores = [], isLoading } = useQuery({
    queryKey: ['stores'],
    queryFn: listStores,
  });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['stores'] });

  const createMut = useMutation({
    mutationFn: (s: StoreForm) =>
      createStore(
        s.address
          ? { name: s.name, code: s.code, address: s.address }
          : { name: s.name, code: s.code },
      ),
    onSuccess: () => {
      setForm(null);
      invalidate();
    },
  });
  // La eliminación se conserva en lib (deleteStore) para el futuro; el mockup de
  // Tiendas no muestra el botón Borrar en las cards.
  void deleteStore;

  const isActive = (s: Store): boolean => activeOverrides[s.id] ?? s.active;
  const toggleActive = (s: Store): void =>
    setActiveOverrides((prev) => ({ ...prev, [s.id]: !(prev[s.id] ?? s.active) }));

  const opsOf = (id: string): StoreOps | undefined => ops[id];
  const patchOps = (id: string, patch: Partial<StoreOps>): void =>
    setOps((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...patch } } : prev));

  // Orden por ventas del periodo (desc) + filtro por estado administrativo (#101, #103).
  const visibleStores = useMemo(() => {
    return [...stores]
      .filter((s) => {
        const active = activeOverrides[s.id] ?? s.active;
        if (statusFilter === 'activa') return active;
        if (statusFilter === 'dormida') return !active;
        return true;
      })
      .sort((a, b) => salesOf(b.id, period) - salesOf(a.id, period));
  }, [stores, statusFilter, period, activeOverrides]);

  return (
    <section className="catalog">
      <header className="catalog-head">
        <div>
          <h2>Tiendas</h2>
          <p className="catalog-sub">{stores.length} ubicaciones</p>
        </div>
        <button
          className="btn-primary"
          onClick={() => setForm({ name: '', code: '', address: '' })}
          data-testid="new-store"
        >
          Nueva tienda
        </button>
      </header>

      <div className="stores-toolbar">
        <div className="bo-tabs" role="tablist" aria-label="Filtrar por estado">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`bo-tab ${statusFilter === f.id ? 'active' : ''}`}
              onClick={() => setStatusFilter(f.id)}
              data-testid={`store-filter-${f.id}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="stores-period">
          <div className="bo-tabs" role="tablist" aria-label="Ordenar por ventas del periodo">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`bo-tab ${period === p.id ? 'active' : ''}`}
                onClick={() => setPeriod(p.id)}
                data-testid={`store-period-${p.id}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <p className="catalog-empty">Cargando…</p>
      ) : stores.length === 0 ? (
        <p className="catalog-empty" data-testid="stores-empty">
          Sin tiendas. Crea la primera.
        </p>
      ) : visibleStores.length === 0 ? (
        <p className="catalog-empty" data-testid="stores-filter-empty">
          Ninguna tienda con ese estado.
        </p>
      ) : (
        <div className="store-grid" data-testid="stores-grid">
          {visibleStores.map((s) => {
            const active = isActive(s);
            const o = opsOf(s.id);
            const open = o?.open ?? false;
            const sales = salesOf(s.id, period);
            return (
              <div
                className={`store-card ${active ? '' : 'is-dormant'}`}
                key={s.id}
                data-testid="store-card"
                role="button"
                tabIndex={0}
                onClick={() => setDetail(s)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setDetail(s);
                  }
                }}
                title="Ver detalle de la tienda"
              >
                {/* Zona 1 — identidad: marca, nombre/dirección y si hay alguien ahora. */}
                <div className="store-card-head">
                  <span className="store-avatar" aria-hidden="true">
                    {initials(s.name)}
                  </span>
                  <span className="store-card-text">
                    <span className="store-card-name">{s.name}</span>
                    <span className="store-card-addr">{s.address ?? '—'}</span>
                  </span>
                  <span
                    className={`store-live ${open ? 'on' : 'off'}`}
                    data-testid="store-open"
                    title={
                      open
                        ? `Hay alguien trabajando ahora${o?.openedSince ? ` (desde las ${o.openedSince})` : ''}`
                        : 'Nadie ha fichado ahora mismo'
                    }
                  >
                    <span className="store-live-dot" />
                    {open ? 'Abierta' : 'Cerrada'}
                  </span>
                </div>

                {/* Zona 2 — el dato que importa al jefe: cuánto ha vendido. */}
                <div className="store-card-metric" data-testid="store-sales">
                  <span className="store-card-sales-value">{fmtEur(sales)}</span>
                  <span className="store-card-sales-label">{SALES_LABEL[period]}</span>
                </div>

                {/* Zona 3 — control: encender/apagar la tienda con consecuencia clara. */}
                <div className="store-card-foot">
                  <span className="store-foot-text">
                    <span
                      className={`store-status-text ${active ? '' : 'muted'}`}
                      data-testid="store-status"
                    >
                      {active ? 'Tienda activa' : 'Tienda en pausa'}
                    </span>
                    <span className="store-foot-hint">
                      {active ? 'El TPV puede vender' : 'El TPV no puede vender'}
                    </span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={active}
                    className={`store-switch ${active ? 'on' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleActive(s);
                    }}
                    data-testid="store-toggle"
                    aria-label={active ? `Pausar ${s.name}` : `Activar ${s.name}`}
                    title={active ? 'Pausar tienda' : 'Activar tienda'}
                  >
                    <span className="store-switch-knob" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {form && (
        <div className="modal-backdrop" onClick={() => setForm(null)}>
          <form
            className="modal modal--form"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              createMut.mutate(form);
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
            {createMut.isError && <p className="form-error">No se pudo crear.</p>}
            <div className="modal-foot">
              <button type="button" onClick={() => setForm(null)}>
                Cancelar
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={createMut.isPending || !form.name.trim() || !form.code.trim()}
                data-testid="store-save"
              >
                {createMut.isPending ? 'Guardando…' : 'Crear'}
              </button>
            </div>
          </form>
        </div>
      )}

      {detail &&
        (() => {
          const o = opsOf(detail.id);
          const active = isActive(detail);
          return (
            <div className="modal-backdrop" onClick={() => setDetail(null)}>
              <div
                className="modal modal--form"
                onClick={(e) => e.stopPropagation()}
                data-testid="store-detail"
              >
                <h3>{detail.name}</h3>
                <p className="muted">
                  {detail.address ?? '—'} · Código {detail.code}
                </p>

                <div className="store-detail-block">
                  <span className="store-detail-label">Estado administrativo</span>
                  <div className="store-detail-row">
                    <span className={`store-badge ${active ? 'active' : 'muted'}`}>
                      {active ? 'Activa' : 'Dormida'}
                    </span>
                    <button className="link-btn" onClick={() => toggleActive(detail)}>
                      {active ? 'Dormir' : 'Activar'}
                    </button>
                  </div>
                </div>

                <div className="store-detail-block">
                  <span className="store-detail-label">Estado operativo (fichaje)</span>
                  <div className="store-detail-row" data-testid="store-detail-open">
                    <span className={`store-open ${o?.open ? 'on' : 'off'}`}>
                      <span className="store-open-dot" />
                      {o?.open ? 'Abierta' : 'Cerrada'}
                    </span>
                    <span className="muted">
                      {o?.open
                        ? `Abrió ${o.openedBy} a las ${o.openedSince}`
                        : 'Sin fichajes activos'}
                    </span>
                  </div>
                  <button
                    className="link-btn"
                    onClick={() =>
                      patchOps(
                        detail.id,
                        o?.open
                          ? { open: false, openedBy: null, openedSince: null }
                          : { open: true, openedBy: 'Tú', openedSince: 'ahora' },
                      )
                    }
                    data-testid="store-open-toggle"
                  >
                    {o?.open ? 'Forzar cierre' : 'Marcar abierta'}
                  </button>
                </div>

                <div className="store-detail-block" data-testid="store-device">
                  <span className="store-detail-label">Dispositivo autorizado</span>
                  <label>
                    {o?.deviceType === 'ip'
                      ? 'IP del dispositivo'
                      : 'Identificador del dispositivo'}
                    <input
                      value={o?.deviceValue ?? ''}
                      placeholder={o?.deviceType === 'ip' ? 'p. ej. 83.45.12.7' : 'p. ej. TPV-01'}
                      onChange={(e) =>
                        patchOps(detail.id, { deviceValue: e.target.value, deviceVerified: false })
                      }
                      data-testid="store-device-value"
                    />
                  </label>
                  {o?.deviceVerified ? (
                    <p className="store-device-ok" data-testid="store-device-ok">
                      ✓ Dispositivo verificado.
                    </p>
                  ) : (
                    <p className="store-device-warn" data-testid="store-device-warn">
                      ⚠ Dispositivo no verificado: el TPV de esta tienda no podrá operar hasta
                      autorizarlo.
                    </p>
                  )}
                  {!o?.deviceVerified && (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => patchOps(detail.id, { deviceVerified: true })}
                      data-testid="store-device-authorize"
                    >
                      Autorizar dispositivo
                    </button>
                  )}
                </div>

                <div className="modal-foot">
                  <button type="button" onClick={() => setDetail(null)}>
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
    </section>
  );
}
