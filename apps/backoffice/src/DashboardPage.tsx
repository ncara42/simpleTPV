import './dashboard.css';

import { Badge, Chart, Select, Sparkline } from '@simpletpv/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { listStores } from './lib/admin.js';
import {
  type DashboardPeriod,
  getArchetypeRotation,
  getDiscountByEmployee,
  getMarginKpis,
  getProductRankings,
  getProductRotation,
  getSalesByEmployee,
  getSalesByFamily,
  getSalesByHour,
  getSalesKpis,
  getSalesToday,
  getStockoutKpis,
} from './lib/dashboard.js';
import {
  deltaTone,
  fmtDelta,
  fmtEur,
  fmtEurCompact,
  fmtNum,
  fmtRate,
  invertTone,
  seriesTrend,
} from './lib/format.js';
import { usePageHeader } from './lib/pageHeader.js';
import { readPref, usePreferences } from './lib/preferences.js';
import { listPurchaseOrders } from './lib/purchases.js';
import { listAlerts, listExpiringBatches } from './lib/stock.js';
import { compareSupplierPrices } from './lib/supplier-prices.js';
import { fmtMinutes, hhmm, listHistoryAll, msToMin } from './lib/time-clock.js';
import { STATUS_LABEL } from './purchases/labels.js';
import { ALERT_LABEL, df, EXPIRY_LABEL, expiryDaysText } from './stock/labels.js';

// Personalización de las KPI cards (IT-16): orden + visibilidad por usuario.
interface CardsPref {
  order: string[];
  hidden: string[];
}

const PERIODS: Array<{ id: DashboardPeriod; label: string }> = [
  { id: 'today', label: 'Hoy' },
  { id: 'yesterday', label: 'Ayer' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mes' },
];

// Subtítulo de panel según el periodo seleccionado (más claro que "Periodo actual").
const PERIOD_SUBTITLE: Record<DashboardPeriod, string> = {
  today: 'Hoy',
  yesterday: 'Ayer',
  week: 'Esta semana',
  month: 'Este mes',
};

// ── Presets del dashboard (I-15 / D-08) ──
// Cada preset define sus tarjetas KPI Y sus paneles (D-08d), con el reparto
// EXACTO cerrado en informe_decisiones. 'ventas' es el default. El preset
// activo y los ocultos POR preset persisten en la preferencia
// `dashboard.layout` (D-03); el orden de tarjetas sigue en `dashboard.cards`.
type PresetId = 'ventas' | 'beneficio' | 'inventario' | 'equipo';

interface PresetDef {
  id: PresetId;
  label: string;
  cards: string[];
  panels: string[];
}

const PRESETS: PresetDef[] = [
  {
    id: 'ventas',
    label: 'Ventas',
    cards: ['kpi-today', 'kpi-avg-ticket', 'kpi-upt'],
    panels: ['dash-bars', 'dash-hour', 'dash-family', 'rank-sales'],
  },
  {
    id: 'beneficio',
    label: 'Beneficio',
    cards: ['kpi-margin', 'kpi-profit', 'kpi-discount', 'kpi-return'],
    panels: ['rank-margin', 'dash-discount-emp', 'dash-suppliers'],
  },
  {
    id: 'inventario',
    label: 'Inventario',
    cards: ['kpi-lost-sales'],
    panels: [
      'dash-stockout',
      'dash-rotation',
      'rank-rotation',
      'dash-expiring',
      'dash-purchase-orders',
    ],
  },
  {
    id: 'equipo',
    label: 'Equipo',
    cards: [],
    panels: ['dash-sales-emp', 'dash-discount-emp', 'dash-timeclock'],
  },
];

// Etiquetas de los paneles para el editor de personalización.
const PANEL_LABEL: Record<string, string> = {
  'dash-bars': 'Ventas hoy vs ayer',
  'dash-hour': 'Ventas por hora',
  'dash-family': 'Ventas por familia',
  'rank-sales': 'Ranking top ventas',
  'rank-margin': 'Ranking top margen',
  'rank-rotation': 'Peor rotación',
  'dash-discount-emp': 'Descuento por empleado',
  'dash-stockout': 'Roturas de stock',
  'dash-rotation': 'Rotación',
  'dash-sales-emp': 'Ventas por vendedor',
  'dash-timeclock': 'Fichajes de hoy',
  'dash-suppliers': 'Comparativa de proveedores',
  'dash-expiring': 'Lotes por caducar',
  'dash-purchase-orders': 'Pedidos de compra pendientes',
};

// Preferencia de layout (I-15): preset activo + ids ocultos POR preset —
// ocultar un panel o tarjeta solo afecta al preset donde se ocultó.
interface LayoutPref {
  preset?: PresetId;
  hiddenByPreset?: Partial<Record<PresetId, string[]>>;
}

// La sparkline solo tiene tonos brand/up/down; 'flat' (sin tendencia) usa el
// neutro 'brand'. Convierte el tono semántico de una métrica al de la sparkline.
const toSparkTone = (tone: 'up' | 'down' | 'flat'): SparkTone => (tone === 'flat' ? 'brand' : tone);

export function DashboardPage({
  onNavigate,
}: {
  // Links de los paneles a su page de gestión (I-16): Proveedores y Stock.
  onNavigate?: ((tab: 'suppliers' | 'stock') => void) | undefined;
} = {}) {
  const [period, setPeriod] = useState<DashboardPeriod>('today');
  const [storeId, setStoreId] = useState('');
  const store = storeId || undefined;

  const { data: stores = [] } = useQuery({ queryKey: ['stores'], queryFn: listStores });

  // Preferencias ANTES de las queries: el preset activo y sus ocultos deciden
  // qué se pinta Y qué endpoints se consultan (enabled por visibilidad).
  const { prefs, setPref, loaded: prefsLoaded } = usePreferences();
  const [cardsEditorOpen, setCardsEditorOpen] = useState(false);
  const layout = readPref<LayoutPref>(prefs, 'dashboard.layout', {});
  const preset = PRESETS.find((p) => p.id === layout.preset) ?? PRESETS[0]!;
  // Migración tolerante de la preferencia previa a presets (IT-16): si el preset
  // aún no tiene su lista de ocultos, hereda los de `dashboard.cards.hidden`.
  const cardsPref = readPref<CardsPref>(prefs, 'dashboard.cards', { order: [], hidden: [] });
  const legacyHidden = Array.isArray(cardsPref.hidden) ? cardsPref.hidden : [];
  const knownIds = new Set([...preset.cards, ...preset.panels]);
  const hidden = new Set(
    (layout.hiddenByPreset?.[preset.id] ?? legacyHidden).filter((id) => knownIds.has(id)),
  );
  // Orden de tarjetas: respeta el guardado y añade al final las nuevas del preset.
  const savedOrder = (Array.isArray(cardsPref.order) ? cardsPref.order : []).filter((id) =>
    preset.cards.includes(id),
  );
  const cardOrder = [...savedOrder, ...preset.cards.filter((id) => !savedOrder.includes(id))];
  const visibleCardIds = cardOrder.filter((id) => !hidden.has(id));
  const visiblePanelIds = preset.panels.filter((id) => !hidden.has(id));
  const vis = new Set([...visibleCardIds, ...visiblePanelIds]);

  // placeholderData: al cambiar de tienda/periodo se conservan los datos previos
  // durante el refetch en vez de vaciarse. Así los nodos del DOM (key estable por
  // tienda/familia) persisten y las gráficas no vuelven a montar ni re-animan.
  // `enabled` por visibilidad: un panel oculto (o de otro preset) no consulta.
  const salesToday = useQuery({
    queryKey: ['dash-today', store],
    queryFn: () => getSalesToday(store),
    placeholderData: keepPreviousData,
    enabled: vis.has('kpi-today') || vis.has('dash-bars'),
  });
  const salesKpis = useQuery({
    queryKey: ['dash-sales-kpis', period, store],
    queryFn: () => getSalesKpis(period, store),
    placeholderData: keepPreviousData,
    enabled: ['kpi-avg-ticket', 'kpi-upt', 'kpi-discount', 'kpi-return'].some((id) => vis.has(id)),
  });
  const marginKpis = useQuery({
    queryKey: ['dash-margin', period, store],
    queryFn: () => getMarginKpis(period, store),
    placeholderData: keepPreviousData,
    enabled: vis.has('kpi-margin') || vis.has('kpi-profit'),
  });
  const byFamily = useQuery({
    queryKey: ['dash-family', period, store],
    queryFn: () => getSalesByFamily(period, store),
    placeholderData: keepPreviousData,
    enabled: vis.has('dash-family'),
  });
  const byHour = useQuery({
    queryKey: ['dash-hour', period, store],
    queryFn: () => getSalesByHour(period, store),
    placeholderData: keepPreviousData,
    enabled: vis.has('dash-hour'),
  });
  const discountByEmp = useQuery({
    queryKey: ['dash-discount-emp', period, store],
    queryFn: () => getDiscountByEmployee(period, store),
    placeholderData: keepPreviousData,
    enabled: vis.has('dash-discount-emp'),
  });
  // Ventas por vendedor (preset Equipo, D-08).
  const salesByEmp = useQuery({
    queryKey: ['dash-sales-emp', period, store],
    queryFn: () => getSalesByEmployee(period, store),
    placeholderData: keepPreviousData,
    enabled: vis.has('dash-sales-emp'),
  });
  // Fichajes de hoy (preset Equipo, D-08): jornadas de hoy, en hora local.
  const todayIso = new Intl.DateTimeFormat('en-CA').format(new Date());
  const timeclockToday = useQuery({
    queryKey: ['dash-timeclock', todayIso, store],
    queryFn: () =>
      listHistoryAll({ from: todayIso, to: todayIso, ...(store ? { storeId: store } : {}) }),
    placeholderData: keepPreviousData,
    enabled: vis.has('dash-timeclock'),
  });
  // Comparativa de proveedores (I-16/D-08b, preset Beneficio).
  const supplierComparison = useQuery({
    queryKey: ['dash-supplier-comparison'],
    queryFn: () => compareSupplierPrices(),
    placeholderData: keepPreviousData,
    enabled: vis.has('dash-suppliers'),
  });
  // Lotes por caducar (I-16/D-08b, preset Inventario).
  const expiring = useQuery({
    queryKey: ['dash-expiring', store],
    queryFn: () => listExpiringBatches(store),
    placeholderData: keepPreviousData,
    enabled: vis.has('dash-expiring'),
  });
  // Pedidos de compra pendientes (I-16/D-08b, preset Inventario). El endpoint
  // filtra por UN status y "pendiente" son tres → se trae todo y se filtra aquí.
  const purchaseOrders = useQuery({
    queryKey: ['dash-purchase-orders'],
    queryFn: () => listPurchaseOrders(),
    placeholderData: keepPreviousData,
    enabled: vis.has('dash-purchase-orders'),
  });
  const rotation = useQuery({
    queryKey: ['dash-rotation', period, store],
    queryFn: () => getProductRotation(period, store),
    placeholderData: keepPreviousData,
    enabled: vis.has('dash-rotation'),
  });
  // Rotación: por defecto AGREGADA POR ARQUETIPO (más sólida); 'product' es el
  // drill-down al SKU concreto (IT-13).
  const [rotationLevel, setRotationLevel] = useState<'archetype' | 'product'>('archetype');
  const archetypeRotation = useQuery({
    queryKey: ['dash-arch-rotation', period, store],
    queryFn: () => getArchetypeRotation(period, store),
    placeholderData: keepPreviousData,
    enabled: vis.has('dash-rotation'),
  });
  const rankings = useQuery({
    queryKey: ['dash-rankings', period, store],
    queryFn: () => getProductRankings(period, store),
    placeholderData: keepPreviousData,
    enabled: ['rank-sales', 'rank-margin', 'rank-rotation'].some((id) => vis.has(id)),
  });
  // Roturas de stock: lista de alertas activas + KPI de venta perdida estimada.
  const stockoutKpis = useQuery({
    queryKey: ['dash-stockout-kpis', period, store],
    queryFn: () => getStockoutKpis(period, store),
    placeholderData: keepPreviousData,
    enabled: vis.has('dash-stockout') || vis.has('kpi-lost-sales'),
  });
  const alerts = useQuery({
    queryKey: ['dash-alerts', store],
    queryFn: () => listAlerts(store),
    placeholderData: keepPreviousData,
    enabled: vis.has('dash-stockout'),
  });

  usePageHeader('Resumen', 'Actualizado hace 2 min');

  // Periodo y tienda por defecto (IT-16): el dashboard recuerda el último elegido. Se
  // aplica UNA vez tras cargar las preferencias; los cambios del usuario lo reescriben.
  const defaultsApplied = useRef(false);
  useEffect(() => {
    if (!prefsLoaded || defaultsApplied.current) return;
    defaultsApplied.current = true;
    const d = readPref<{ period?: DashboardPeriod; storeId?: string }>(
      prefs,
      'dashboard.defaults',
      {},
    );
    if (d.period && PERIODS.some((p) => p.id === d.period)) setPeriod(d.period);
    if (typeof d.storeId === 'string') setStoreId(d.storeId);
  }, [prefsLoaded, prefs]);
  const saveDashboardDefault = (patch: { period?: DashboardPeriod; storeId?: string }): void => {
    const cur = readPref<{ period?: DashboardPeriod; storeId?: string }>(
      prefs,
      'dashboard.defaults',
      {},
    );
    setPref('dashboard.defaults', { ...cur, ...patch });
  };
  const cardDefs: Array<{ id: string; label: string; node: React.ReactNode }> = [
    {
      id: 'kpi-today',
      label: 'Facturación hoy',
      node: (
        <KpiCard
          key="kpi-today"
          label="Facturación hoy"
          value={fmtEur(salesToday.data?.today.total)}
          delta={salesToday.data?.deltaPct ?? null}
          series={salesToday.data?.intraday}
          sparkTone={deltaTone(salesToday.data?.deltaPct ?? null) === 'down' ? 'down' : 'up'}
          testid="kpi-today"
        />
      ),
    },
    {
      id: 'kpi-avg-ticket',
      label: 'Ticket medio',
      node: (
        <KpiCard
          key="kpi-avg-ticket"
          label="Ticket medio"
          value={fmtEur(salesKpis.data?.avgTicket)}
          series={salesKpis.data?.series?.avgTicket}
          sparkTone={toSparkTone(seriesTrend(salesKpis.data?.series?.avgTicket))}
          testid="kpi-avg-ticket"
        />
      ),
    },
    {
      id: 'kpi-upt',
      label: 'UPT',
      node: (
        <KpiCard
          key="kpi-upt"
          label="UPT"
          value={fmtNum(salesKpis.data?.upt)}
          series={salesKpis.data?.series?.upt}
          sparkTone={toSparkTone(seriesTrend(salesKpis.data?.series?.upt))}
          testid="kpi-upt"
        />
      ),
    },
    {
      id: 'kpi-margin',
      label: '% Margen',
      node: (
        <KpiCard
          key="kpi-margin"
          label="% Margen"
          value={fmtRate(marginKpis.data?.marginPct)}
          series={marginKpis.data?.series}
          sparkTone={toSparkTone(seriesTrend(marginKpis.data?.series))}
          testid="kpi-margin"
        />
      ),
    },
    {
      id: 'kpi-profit',
      label: 'Beneficio',
      node: (
        <KpiCard
          key="kpi-profit"
          label="Beneficio"
          value={fmtEur(marginKpis.data?.realMargin)}
          series={marginKpis.data?.realMarginSeries}
          sparkTone={toSparkTone(seriesTrend(marginKpis.data?.realMarginSeries))}
          testid="kpi-profit"
        />
      ),
    },
    {
      id: 'kpi-discount',
      label: 'Tasa descuento',
      node: (
        <KpiCard
          key="kpi-discount"
          label="Tasa descuento"
          value={fmtRate(salesKpis.data?.discountRate)}
          series={salesKpis.data?.series?.discountRate}
          // Más descuento es peor: el tono se invierte (subir → rojo).
          sparkTone={toSparkTone(invertTone(seriesTrend(salesKpis.data?.series?.discountRate)))}
          testid="kpi-discount"
        />
      ),
    },
    {
      id: 'kpi-return',
      label: 'Tasa devolución',
      node: (
        <KpiCard
          key="kpi-return"
          label="Tasa devolución"
          value={fmtRate(salesKpis.data?.returnRate)}
          series={salesKpis.data?.series?.returnRate}
          // Más devoluciones es peor: el tono se invierte (subir → rojo).
          sparkTone={toSparkTone(invertTone(seriesTrend(salesKpis.data?.series?.returnRate)))}
          testid="kpi-return"
        />
      ),
    },
    {
      id: 'kpi-lost-sales',
      label: 'Venta perdida est.',
      node: (
        <KpiCard
          key="kpi-lost-sales"
          label="Venta perdida est."
          value={fmtEur(stockoutKpis.data?.estimatedLostSales)}
          testid="kpi-lost-sales"
        />
      ),
    },
  ];
  const visibleCards = visibleCardIds
    .map((id) => cardDefs.find((c) => c.id === id))
    .filter((c): c is (typeof cardDefs)[number] => Boolean(c));

  // Ocultar/mostrar SOLO afecta al preset activo (D-03): se escribe entera la
  // lista efectiva de ocultos del preset en dashboard.layout.
  const toggleHidden = (id: string): void => {
    const next = hidden.has(id) ? [...hidden].filter((h) => h !== id) : [...hidden, id];
    setPref('dashboard.layout', {
      ...layout,
      preset: preset.id,
      hiddenByPreset: { ...layout.hiddenByPreset, [preset.id]: next },
    });
  };
  // El orden global de dashboard.cards conserva las tarjetas de otros presets al
  // final: cada preset solo lee las suyas, así que su orden relativo no le afecta.
  const moveCard = (i: number, dir: -1 | 1): void => {
    const j = i + dir;
    if (j < 0 || j >= cardOrder.length) return;
    const order = [...cardOrder];
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
    const others = (Array.isArray(cardsPref.order) ? cardsPref.order : []).filter(
      (id) => !preset.cards.includes(id),
    );
    setPref('dashboard.cards', { order: [...order, ...others], hidden: legacyHidden });
  };
  const setPreset = (id: PresetId): void => setPref('dashboard.layout', { ...layout, preset: id });

  return (
    <section className="catalog" data-testid="dashboard">
      <header className="catalog-head is-actions-only">
        <div className="catalog-actions">
          {/* Selector de preset en la cabecera (D-08c): cambiar de foco = 1 clic. */}
          <div
            className="dash-preset-switch"
            role="tablist"
            aria-label="Preset del dashboard"
            data-testid="dash-preset"
          >
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={preset.id === p.id}
                className={preset.id === p.id ? 'is-active' : ''}
                onClick={() => setPreset(p.id)}
                data-testid={`dash-preset-${p.id}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Select
            className="dash-period-select"
            value={period}
            onChange={(value) => {
              setPeriod(value as DashboardPeriod);
              saveDashboardDefault({ period: value as DashboardPeriod });
            }}
            ariaLabel="Periodo"
            data-testid="dash-period"
            options={PERIODS.map((p) => ({ value: p.id, label: p.label }))}
          />
          <Select
            className="dash-store"
            value={storeId}
            onChange={(value) => {
              setStoreId(value);
              saveDashboardDefault({ storeId: value });
            }}
            ariaLabel="Tienda"
            data-testid="dash-store"
            options={[
              { value: '', label: 'Todas las tiendas' },
              ...stores.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
        </div>
      </header>

      {/* Personalización del preset activo (IT-16 + I-15): tarjetas y paneles. */}
      <div className="dash-cards-head">
        <button
          type="button"
          className="dash-customize"
          onClick={() => setCardsEditorOpen((o) => !o)}
          data-testid="dash-customize"
          aria-expanded={cardsEditorOpen}
        >
          Personalizar
        </button>
      </div>
      {cardsEditorOpen && (
        <LayoutEditor
          cards={cardOrder.map((id) => ({
            id,
            label: cardDefs.find((c) => c.id === id)?.label ?? id,
          }))}
          panels={preset.panels.map((id) => ({ id, label: PANEL_LABEL[id] ?? id }))}
          hidden={hidden}
          onToggle={toggleHidden}
          onMoveCard={moveCard}
        />
      )}
      {visibleCards.length > 0 && (
        <div className="dash-cards" data-testid="dash-cards">
          {visibleCards.map((c) => c.node)}
        </div>
      )}

      {/* La rejilla solo monta los paneles del preset activo (D-08d); cada uno
          conserva su data-testid histórico. Los spans están elegidos para que
          cada preset complete filas de 12 columnas. */}
      <div className="dash-grid">
        {/* Ventas hoy vs ayer por tienda (líneas + área, coherente con las sparklines) */}
        {vis.has('dash-bars') && (
          <div className="dash-panel span-7" data-testid="dash-bars">
            <h3>Ventas hoy vs ayer</h3>
            <p className="dash-panel-sub">Facturación neta por tienda</p>
            {(() => {
              const stores = salesToday.data?.byStore ?? [];
              // Escala a la facturación máxima (Hoy o Ayer) de cualquier tienda → la
              // barra más alta llena el lienzo y las alturas comparan de un vistazo.
              const top = Math.max(1, ...stores.flatMap((s) => [s.today, s.yesterday]));
              // Si la tienda del filtro está en el gráfico, se resalta su columna y
              // se atenúan las demás (mismo gesto que el hover).
              const focused = !!storeId && stores.some((s) => s.storeId === storeId);
              return (
                <>
                  <div className={`dash-bars-chart${focused ? ' has-selection' : ''}`}>
                    {stores.map((s, i) => {
                      const tone = deltaTone(s.deltaPct);
                      return (
                        <div
                          className={`dash-bars-group${s.storeId === storeId ? ' is-selected' : ''}`}
                          key={s.storeId}
                          style={{ '--i': i } as React.CSSProperties}
                        >
                          <div className="dash-bars-cap">
                            <strong className="dash-bars-cap-val">{fmtEur(s.today)}</strong>
                            <span className={`dash-bars-cap-delta dash-delta-${tone}`}>
                              {fmtDelta(s.deltaPct)}
                            </span>
                          </div>
                          <div className="dash-bars-pair">
                            <span
                              className="dash-bars-bar dash-bars-bar-prev"
                              style={{ height: `${(s.yesterday / top) * 100}%` }}
                            >
                              <span className="dash-bars-bar-val">
                                {fmtEurCompact(s.yesterday)}
                              </span>
                            </span>
                            <span
                              className="dash-bars-bar dash-bars-bar-now"
                              style={{ height: `${(s.today / top) * 100}%` }}
                            >
                              <span className="dash-bars-bar-val">{fmtEurCompact(s.today)}</span>
                            </span>
                          </div>
                          <span className="dash-bars-name">{s.storeName}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="dash-bars-legend">
                    <span>
                      <span className="dash-legend-dot dash-swatch-prev" /> Ayer
                    </span>
                    <span>
                      <span className="dash-legend-dot dash-swatch-now" /> Hoy
                    </span>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* Ventas por familia (barras CSS horizontales) */}
        {vis.has('dash-family') && (
          <div className="dash-panel span-5" data-testid="dash-family">
            <h3>Ventas por familia</h3>
            <p className="dash-panel-sub">{PERIOD_SUBTITLE[period]}</p>
            {(() => {
              const fams = byFamily.data ?? [];
              const max = Math.max(1, ...fams.map((f) => f.total));
              return (
                <ul className="dash-family-list">
                  {fams.map((f, i) => {
                    return (
                      <li
                        key={f.familyId ?? `none-${i}`}
                        style={{ '--i': i } as React.CSSProperties}
                      >
                        <span className="dash-family-name">{f.familyName}</span>
                        <span className="dash-family-track">
                          <span
                            className="dash-family-fill"
                            style={{ width: `${(f.total / max) * 100}%` }}
                          >
                            <span className="dash-family-pct">{fmtEur(f.total)}</span>
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              );
            })()}
          </div>
        )}

        {/* Panel de roturas: alertas activas (GET /stock/alerts) + venta perdida est. */}
        {vis.has('dash-stockout') && (
          <div className="dash-panel span-5" data-testid="dash-stockout">
            <h3>Roturas de stock</h3>
            <p className="dash-panel-sub">Productos en alerta ahora</p>
            {(() => {
              const items = alerts.data ?? [];
              if (items.length === 0) {
                return <p className="catalog-empty">Sin roturas ahora.</p>;
              }
              return (
                <ul className="dash-stockout-list">
                  {items.map((a) => (
                    <li
                      key={a.id}
                      className={`dash-stockout-item lvl-${a.alertType === 'OUT_OF_STOCK' ? 'red' : 'yellow'}`}
                    >
                      <span className="dash-stockout-info">
                        <span className="dash-stockout-name">{a.productName}</span>
                        <span className="dash-stockout-store">{a.storeName}</span>
                      </span>
                      <span className="dash-stockout-tag">{ALERT_LABEL[a.alertType]}</span>
                    </li>
                  ))}
                </ul>
              );
            })()}
            <div className="dash-stockout-foot">
              <span>Venta perdida est.</span>
              <strong className="dash-lost">{fmtEur(stockoutKpis.data?.estimatedLostSales)}</strong>
            </div>
          </div>
        )}

        {/* Rankings: cada preset fija su pestaña inicial (D-08 los reparte como
            paneles distintos: top ventas / top margen / peor rotación); el
            selector interno sigue permitiendo explorar. span-5 en Ventas para
            completar la fila con "Ventas por hora". */}
        {(['rank-sales', 'rank-margin', 'rank-rotation'] as const).some((id) => vis.has(id)) && (
          <div
            className={`dash-panel ${vis.has('rank-sales') ? 'span-5' : 'span-7'}`}
            data-testid="dash-rankings"
          >
            <Rankings
              key={preset.id}
              data={rankings.data}
              loading={rankings.isLoading}
              initialTab={
                vis.has('rank-sales') ? 'sales' : vis.has('rank-margin') ? 'margin' : 'rotation'
              }
            />
          </div>
        )}

        {/* Lotes por caducar (I-16/D-08b, preset Inventario): reusa el lenguaje
            de la lista de roturas (rojo caducado, amarillo por caducar). */}
        {vis.has('dash-expiring') && (
          <div className="dash-panel span-7" data-testid="dash-expiring">
            <header className="dash-panel-head">
              <h3>Lotes por caducar</h3>
              <button
                type="button"
                className="link-btn"
                onClick={() => onNavigate?.('stock')}
                data-testid="dash-expiring-link"
              >
                Ver stock →
              </button>
            </header>
            <p className="dash-panel-sub">Caducados y próximos a caducar</p>
            {(() => {
              const rows = (expiring.data ?? []).slice(0, 6);
              if (rows.length === 0) {
                return <p className="catalog-empty">Nada caduca pronto.</p>;
              }
              return (
                <ul className="dash-stockout-list">
                  {rows.map((b) => (
                    <li
                      key={b.id}
                      className={`dash-stockout-item lvl-${b.status === 'expired' ? 'red' : 'yellow'}`}
                      data-testid="dash-expiring-row"
                    >
                      <span className="dash-stockout-info">
                        <span className="dash-stockout-name">{b.productName}</span>
                        <span className="dash-stockout-store">
                          {b.storeName} · lote {b.lotCode} · {b.quantity} ud
                        </span>
                      </span>
                      <span className="dash-stockout-tag">
                        {EXPIRY_LABEL[b.status]} · {expiryDaysText(b.daysToExpiry)}
                      </span>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </div>
        )}

        {/* Pedidos de compra pendientes (I-16/D-08b, preset Inventario). */}
        {vis.has('dash-purchase-orders') && (
          <div className="dash-panel span-5" data-testid="dash-purchase-orders">
            <header className="dash-panel-head">
              <h3>Pedidos de compra</h3>
              <button
                type="button"
                className="link-btn"
                onClick={() => onNavigate?.('suppliers')}
                data-testid="dash-po-link"
              >
                Ver proveedores →
              </button>
            </header>
            <p className="dash-panel-sub">Pendientes de recibir</p>
            {(() => {
              const rows = (purchaseOrders.data ?? [])
                .filter((o) => o.status !== 'RECEIVED')
                .slice(0, 6);
              if (rows.length === 0) {
                return <p className="catalog-empty">Sin pedidos pendientes.</p>;
              }
              return (
                <ul className="dash-po-list">
                  {rows.map((o) => (
                    <li key={o.id} className="dash-po-row" data-testid="dash-po-row">
                      <span className="dash-po-info">
                        <span className="dash-po-supplier">{o.supplier?.name ?? 'Proveedor'}</span>
                        <span className="dash-po-meta">
                          {df.format(new Date(o.createdAt))} · {o.lines.length}{' '}
                          {o.lines.length === 1 ? 'línea' : 'líneas'}
                        </span>
                      </span>
                      <Badge
                        variant={
                          o.status === 'DRAFT'
                            ? 'muted'
                            : o.status === 'PARTIALLY_RECEIVED'
                              ? 'warning'
                              : 'default'
                        }
                      >
                        {STATUS_LABEL[o.status]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </div>
        )}

        {/* Ventas por hora (STAT-02): barras con el Chart reutilizable (IT-02) */}
        {vis.has('dash-hour') && (
          <div className="dash-panel span-7" data-testid="dash-hour">
            <h3>Ventas por hora</h3>
            <p className="dash-panel-sub">{PERIOD_SUBTITLE[period]} · importe por franja</p>
            <Chart
              data={(byHour.data ?? []).map((h) => ({ label: `${h.hour}h`, value: h.revenue }))}
              height={200}
              formatValue={fmtEurCompact}
              ariaLabel="Ventas por hora"
            />
          </div>
        )}

        {/* Ventas por vendedor (preset Equipo, D-08): facturación por empleado. */}
        {vis.has('dash-sales-emp') && (
          <div className="dash-panel span-7" data-testid="dash-sales-emp">
            <h3>Ventas por vendedor</h3>
            <p className="dash-panel-sub">{PERIOD_SUBTITLE[period]} · facturación por empleado</p>
            {(() => {
              const emps = salesByEmp.data ?? [];
              if (emps.length === 0) {
                return <p className="catalog-empty">Sin ventas en el periodo.</p>;
              }
              const max = Math.max(1, ...emps.map((e) => e.total));
              return (
                <ul className="dash-family-list">
                  {emps.map((e, i) => (
                    <li key={e.userId} style={{ '--i': i } as React.CSSProperties}>
                      <span className="dash-family-name">
                        {e.userName}
                        <span className="dash-rotation-arch"> · {e.salesCount} tickets</span>
                      </span>
                      <span className="dash-family-track">
                        <span
                          className="dash-family-fill"
                          style={{ width: `${(e.total / max) * 100}%` }}
                        >
                          <span className="dash-family-pct">{fmtEur(e.total)}</span>
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </div>
        )}

        {/* Descuento medio por empleado (STAT-04) */}
        {vis.has('dash-discount-emp') && (
          <div className="dash-panel span-5" data-testid="dash-discount-emp">
            <h3>Descuento por empleado</h3>
            <p className="dash-panel-sub">
              {PERIOD_SUBTITLE[period]} · descuento voluntario medio (sin promociones)
            </p>
            {(() => {
              const emps = discountByEmp.data ?? [];
              const max = Math.max(0.0001, ...emps.map((e) => e.avgDiscountPct));
              return (
                <ul className="dash-family-list">
                  {emps.map((e, i) => (
                    <li key={e.userId} style={{ '--i': i } as React.CSSProperties}>
                      <span className="dash-family-name">{e.userName}</span>
                      <span className="dash-family-track">
                        <span
                          className="dash-family-fill"
                          style={{ width: `${(e.avgDiscountPct / max) * 100}%` }}
                        >
                          <span className="dash-family-pct">{fmtRate(e.avgDiscountPct)}</span>
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </div>
        )}

        {/* Comparativa de proveedores (I-16/D-08b, preset Beneficio): mejor precio
            de compra marcado por producto; reusa los chips de Proveedores. */}
        {vis.has('dash-suppliers') && (
          <div className="dash-panel" data-testid="dash-suppliers">
            <header className="dash-panel-head">
              <h3>Comparativa de proveedores</h3>
              <button
                type="button"
                className="link-btn"
                onClick={() => onNavigate?.('suppliers')}
                data-testid="dash-suppliers-link"
              >
                Ver proveedores →
              </button>
            </header>
            <p className="dash-panel-sub">Precios de compra por proveedor · mejor marcado</p>
            {(() => {
              const rows = (supplierComparison.data ?? [])
                .filter((r) => r.prices.length > 0)
                .slice(0, 6);
              if (rows.length === 0) {
                return (
                  <p className="catalog-empty">
                    Sin tarifas de proveedor todavía. Impórtalas en Proveedores.
                  </p>
                );
              }
              return (
                <ul className="dash-suppliers-list">
                  {rows.map((r) => (
                    <li
                      key={r.productId}
                      className="dash-suppliers-row"
                      data-testid="dash-suppliers-row"
                    >
                      <span className="dash-suppliers-name">{r.productName}</span>
                      <span className="sp-price-chips">
                        {r.prices.map((pr) => (
                          <span
                            key={pr.supplierId}
                            className={`sp-price-chip${r.best?.supplierId === pr.supplierId ? ' is-best' : ''}`}
                          >
                            {pr.supplierName}: {fmtEur(pr.price)}
                          </span>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </div>
        )}

        {/* Rotación (STAT-05/06): por defecto AGREGADA POR ARQUETIPO (familia) — más
            sólida estadísticamente; el conmutador baja al detalle por producto (IT-13). */}
        {vis.has('dash-rotation') && (
          <div className="dash-panel" data-testid="dash-rotation">
            <div className="dash-toggle" role="tablist" aria-label="Nivel de rotación">
              <button
                type="button"
                role="tab"
                aria-selected={rotationLevel === 'archetype'}
                className={rotationLevel === 'archetype' ? 'is-active' : ''}
                onClick={() => setRotationLevel('archetype')}
                data-testid="rotation-by-archetype"
              >
                Arquetipo
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={rotationLevel === 'product'}
                className={rotationLevel === 'product' ? 'is-active' : ''}
                onClick={() => setRotationLevel('product')}
                data-testid="rotation-by-product"
              >
                Producto
              </button>
            </div>
            <h3>Rotación</h3>
            <p className="dash-panel-sub">
              {PERIOD_SUBTITLE[period]} ·{' '}
              {rotationLevel === 'archetype'
                ? 'por arquetipo · media/día sobre días con tienda abierta'
                : 'por producto · unidades, días sin venta y evolución'}
            </p>
            <ul className="dash-rotation-list">
              {(rotationLevel === 'archetype'
                ? (archetypeRotation.data ?? []).map((a) => ({
                    key: a.familyId ?? 'none',
                    label: a.familyName,
                    sub: `${a.productCount} productos · ${fmtNum(a.ventaMediaDiaria, 1)} ud/día`,
                    units: a.units,
                    days: a.daysSinceLastSale,
                    trend: a.trend,
                    isNew: false,
                    archeAvg: null as number | null,
                  }))
                : (rotation.data ?? []).map((p) => ({
                    key: p.productId,
                    label: p.name,
                    sub: null as string | null,
                    units: p.units,
                    days: p.daysSinceLastSale,
                    trend: p.trend,
                    isNew: p.isNew,
                    archeAvg: p.archetypeAvgDaily,
                  }))
              ).map((r) => (
                <li key={r.key} className="dash-rotation-row">
                  <span className="dash-rotation-name">
                    {r.label}
                    {r.sub && <span className="dash-rotation-arch"> · {r.sub}</span>}
                    {r.isNew && <span className="dash-new-tag">nuevo</span>}
                  </span>
                  <span className="dash-rotation-units">{fmtNum(r.units, 0)} ud</span>
                  <span className="dash-rotation-days">
                    {/* Producto nuevo: su día-a-día propio es poco fiable → mostramos la
                      referencia de su arquetipo (IT-15). */}
                    {r.isNew && r.archeAvg != null
                      ? `~${fmtNum(r.archeAvg, 1)}/día · arquetipo`
                      : r.days == null
                        ? 'sin ventas'
                        : r.days <= 0
                          ? 'hoy'
                          : `hace ${r.days} d`}
                  </span>
                  <span className="dash-rotation-spark">
                    {r.trend.length > 1 && (
                      <Sparkline data={r.trend} tone="brand" height={28} ariaLabel="Evolución" />
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Fichajes de hoy (preset Equipo, D-08): jornadas registradas hoy. */}
        {vis.has('dash-timeclock') && (
          <div className="dash-panel" data-testid="dash-timeclock">
            <h3>Fichajes de hoy</h3>
            <p className="dash-panel-sub">
              {storeId ? 'Tienda filtrada' : 'Todas las tiendas'} · entrada, salida y tiempo
              trabajado
            </p>
            {(() => {
              const rows = timeclockToday.data ?? [];
              if (rows.length === 0) {
                return <p className="catalog-empty">Nadie ha fichado hoy todavía.</p>;
              }
              return (
                <ul className="dash-timeclock-list">
                  {rows.map((r) => (
                    <li key={`${r.userId}-${r.storeId}`} className="dash-timeclock-row">
                      <span className="dash-timeclock-name">{r.userName}</span>
                      <span className="dash-timeclock-store">{r.storeName}</span>
                      <span className="dash-timeclock-times tabular-nums">
                        {hhmm(r.firstIn)} → {r.lastOut ? hhmm(r.lastOut) : 'en curso'}
                      </span>
                      <span className="dash-timeclock-worked tabular-nums">
                        {fmtMinutes(msToMin(r.workedMs))}
                      </span>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </div>
        )}
      </div>
    </section>
  );
}

// Editor del preset activo (IT-16 → I-15): visibilidad de tarjetas Y paneles,
// más flechas de orden para las tarjetas. Ocultar solo afecta a este preset.
function LayoutEditor(props: {
  cards: Array<{ id: string; label: string }>;
  panels: Array<{ id: string; label: string }>;
  hidden: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onMoveCard: (i: number, dir: -1 | 1) => void;
}) {
  return (
    <div className="dash-cards-editor" data-testid="dash-cards-editor">
      <p className="dash-cards-editor-title">Tarjetas del preset</p>
      {props.cards.length === 0 && <p className="catalog-empty">Este preset no tiene tarjetas.</p>}
      <ul>
        {props.cards.map((c, i) => (
          <li key={c.id}>
            <label>
              <input
                type="checkbox"
                checked={!props.hidden.has(c.id)}
                onChange={() => props.onToggle(c.id)}
                data-testid={`card-toggle-${c.id}`}
              />
              {c.label}
            </label>
            <span className="dash-cards-editor-move">
              <button
                type="button"
                onClick={() => props.onMoveCard(i, -1)}
                disabled={i === 0}
                aria-label={`Subir ${c.label}`}
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => props.onMoveCard(i, 1)}
                disabled={i === props.cards.length - 1}
                aria-label={`Bajar ${c.label}`}
              >
                ↓
              </button>
            </span>
          </li>
        ))}
      </ul>
      <p className="dash-cards-editor-title">Paneles del preset</p>
      <ul>
        {props.panels.map((p) => (
          <li key={p.id}>
            <label>
              <input
                type="checkbox"
                checked={!props.hidden.has(p.id)}
                onChange={() => props.onToggle(p.id)}
                data-testid={`panel-toggle-${p.id}`}
              />
              {p.label}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

type SparkTone = 'brand' | 'up' | 'down';

function KpiCard(props: {
  label: string;
  value: string;
  delta?: number | null;
  series?: number[] | undefined;
  sparkTone?: SparkTone;
  testid: string;
}) {
  const tone = deltaTone(props.delta);
  return (
    <div className="dash-card-wrap">
      {props.delta !== undefined && (
        <span className={`dash-card-trend dash-trend-${tone}`}>{fmtDelta(props.delta)}</span>
      )}
      <div className="dash-card" data-testid={props.testid}>
        <span className="dash-card-label">{props.label}</span>
        <span className="dash-card-value">{props.value}</span>
        {/* Sparkline reutilizable de @simpletpv/ui (IT-02), a sangre al pie de la
            card. Si aún no hay serie (<2 puntos) se muestra una línea base tenue
            para que la tarjeta nunca quede vacía (render garantizado, P0-4). */}
        <div className="dash-card-spark">
          {props.series && props.series.length > 1 ? (
            <Sparkline data={props.series} tone={props.sparkTone ?? 'brand'} height={44} />
          ) : (
            <span className="dash-spark-empty" aria-hidden="true" />
          )}
        </div>
      </div>
    </div>
  );
}

type RankTab = 'sales' | 'margin' | 'rotation';

const RANK_OPTIONS = [
  { value: 'sales', label: 'Top ventas' },
  { value: 'margin', label: 'Top margen' },
  { value: 'rotation', label: 'Peor rotación' },
];

function Rankings(props: {
  data: import('./lib/dashboard.js').ProductRankings | undefined;
  loading: boolean;
  // Pestaña inicial según el preset (D-08): top ventas / top margen / peor rotación.
  initialTab?: RankTab;
}) {
  const [tab, setTab] = useState<RankTab>(props.initialTab ?? 'sales');
  if (props.loading) {
    return (
      <>
        <header className="dash-panel-head">
          <h3>Rankings de producto</h3>
          <Select
            className="dash-rank-select"
            value={tab}
            onChange={(v) => setTab(v as RankTab)}
            ariaLabel="Filtrar ranking"
            data-testid="rank-tabs"
            options={RANK_OPTIONS}
            disabled
          />
        </header>
        <p className="catalog-empty">Cargando…</p>
      </>
    );
  }
  const rows =
    tab === 'sales'
      ? (props.data?.topSales ?? []).map((r) => ({
          name: r.name,
          value: fmtEur(r.total),
          num: r.total,
        }))
      : tab === 'margin'
        ? (props.data?.topMargin ?? []).map((r) => ({
            name: r.name,
            value: fmtEur(r.margin),
            num: r.margin,
          }))
        : (props.data?.worstRotation ?? []).map((r) => ({
            name: r.name,
            value: `${fmtNum(r.units, 0)} ud`,
            num: r.units,
          }));
  const max = Math.max(1, ...rows.map((r) => r.num));

  return (
    <>
      <header className="dash-panel-head">
        <h3>Rankings de producto</h3>
        <Select
          className="dash-rank-select"
          value={tab}
          onChange={(v) => setTab(v as RankTab)}
          ariaLabel="Filtrar ranking"
          data-testid="rank-tabs"
          options={RANK_OPTIONS}
        />
      </header>
      {rows.length === 0 ? (
        <p className="catalog-empty">Sin datos.</p>
      ) : (
        <ol className="dash-rank-list" data-testid="rank-table">
          {rows.map((r, i) => (
            <li
              key={`${r.name}-${i}`}
              className="dash-rank-row"
              style={{ '--i': i } as React.CSSProperties}
            >
              <span className="dash-rank-pos">{i + 1}</span>
              <span className="dash-rank-name">{r.name}</span>
              <span className="dash-rank-value">{r.value}</span>
              <span
                className="dash-rank-meter"
                style={{ '--w': `${(r.num / max) * 100}%` } as React.CSSProperties}
              />
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
