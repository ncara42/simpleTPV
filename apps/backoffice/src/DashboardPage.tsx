import './dashboard.css';

import { Badge, Chart, Select, Sparkline } from '@simpletpv/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BarChart2, LineChart } from 'lucide-react';
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

// Preferencia de layout (I-15, simplificada en U-03/D-18): preset activo y tipo
// de gráfico. Las claves antiguas (hiddenByPreset, dashboard.cards) se ignoran.
interface LayoutPref {
  preset?: PresetId;
  /** U-02: representación de los gráficos del dashboard (barras o línea). */
  chartKind?: 'bars' | 'line';
}

// La sparkline solo tiene tonos brand/up/down; 'flat' (sin tendencia) usa el
// neutro 'brand'. Convierte el tono semántico de una métrica al de la sparkline.
const toSparkTone = (tone: 'up' | 'down' | 'flat'): SparkTone => (tone === 'flat' ? 'brand' : tone);

export function DashboardPage({
  onNavigate,
}: {
  // Links a otras pages (I-16/I-17): paneles → Proveedores/Stock; pie → Ventas.
  onNavigate?: ((tab: 'suppliers' | 'stock' | 'sales') => void) | undefined;
} = {}) {
  const [period, setPeriod] = useState<DashboardPeriod>('today');
  const [storeId, setStoreId] = useState('');
  const store = storeId || undefined;

  const { data: stores = [] } = useQuery({ queryKey: ['stores'], queryFn: listStores });

  // Preferencias ANTES de las queries: el preset activo decide qué se pinta Y
  // qué endpoints se consultan (enabled por visibilidad). D-18: la composición
  // (tarjetas y paneles) la dictan exclusivamente los presets — no hay
  // personalización manual; las preferencias antiguas de ocultos se ignoran.
  const { prefs, setPref, loaded: prefsLoaded } = usePreferences();
  const layout = readPref<LayoutPref>(prefs, 'dashboard.layout', {});
  const preset = PRESETS.find((p) => p.id === layout.preset) ?? PRESETS[0]!;
  const visibleCardIds = preset.cards;
  const vis = new Set([...preset.cards, ...preset.panels]);

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
  const setPreset = (id: PresetId): void => setPref('dashboard.layout', { ...layout, preset: id });
  // U-02: toggle global barras ↔ línea, persistido con el resto del layout.
  const chartKind: 'bars' | 'line' = layout.chartKind === 'line' ? 'line' : 'bars';
  const setChartKind = (kind: 'bars' | 'line'): void =>
    setPref('dashboard.layout', { ...layout, chartKind: kind });

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
          {/* U-02: toggle barras ↔ línea para los gráficos del dashboard. */}
          <div
            className="dash-preset-switch dash-chart-kind"
            role="tablist"
            aria-label="Tipo de gráfico"
            data-testid="dash-chart-kind"
          >
            <button
              type="button"
              role="tab"
              aria-selected={chartKind === 'bars'}
              className={chartKind === 'bars' ? 'is-active' : ''}
              onClick={() => setChartKind('bars')}
              data-testid="dash-chart-kind-bars"
              title="Barras"
            >
              <BarChart2 size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={chartKind === 'line'}
              className={chartKind === 'line' ? 'is-active' : ''}
              onClick={() => setChartKind('line')}
              data-testid="dash-chart-kind-line"
              title="Línea"
            >
              <LineChart size={15} aria-hidden="true" />
            </button>
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

      {/* D-18 (U-03): sin personalización manual de tarjetas — el preset manda. */}
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
              // Sin tiendas con ventas (p. ej. almacén filtrado): estado vacío en vez
              // de un panel en blanco.
              if (stores.length === 0) {
                return <p className="catalog-empty">Sin ventas hoy ni ayer.</p>;
              }
              // U-01: Chart común (color constante, tooltip lateral con Hoy/Ayer/delta).
              return (
                <>
                  <Chart
                    data={stores.map((s) => ({
                      label: s.storeName,
                      value: s.today,
                      compareValue: s.yesterday,
                      valueText: `Hoy ${fmtEur(s.today)}`,
                      compareText: `Ayer ${fmtEur(s.yesterday)}`,
                      tipExtra: fmtDelta(s.deltaPct),
                    }))}
                    height={200}
                    formatValue={fmtEurCompact}
                    kind={chartKind}
                    showValues
                    ariaLabel="Ventas hoy vs ayer por tienda"
                  />
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
                        <BarTrack pct={(f.total / max) * 100} value={fmtEur(f.total)} />
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
            {(byHour.data ?? []).length === 0 ? (
              <p className="catalog-empty">Sin ventas en el periodo.</p>
            ) : (
              <Chart
                data={(byHour.data ?? []).map((h) => ({ label: `${h.hour}h`, value: h.revenue }))}
                height={200}
                formatValue={fmtEurCompact}
                kind={chartKind}
                showValues
                ariaLabel="Ventas por hora"
              />
            )}
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
                      <BarTrack pct={(e.total / max) * 100} value={fmtEur(e.total)} />
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
                      <BarTrack
                        pct={(e.avgDiscountPct / max) * 100}
                        value={fmtRate(e.avgDiscountPct)}
                      />
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

      {/* I-17/D-06: la tabla de ventas ya no se embebe — el dashboard cierra
          con el acceso a la page de Ventas (DataTable completo). */}
      <footer className="dash-foot">
        <button
          type="button"
          className="link-btn"
          onClick={() => onNavigate?.('sales')}
          data-testid="dash-to-sales"
        >
          Ver todas las ventas →
        </button>
      </footer>
    </section>
  );
}

// Pista de barra horizontal con el valor SIEMPRE visible (sin hover) y CENTRADO en
// el carril (mismo eje para todas las filas → coherencia visual). El color se parte
// según el fondo para contrastar aunque la punta de la barra caiga en mitad del
// número: dos capas superpuestas y centradas — una oscura (sobre el carril claro) y
// otra blanca recortada exactamente a la zona del relleno azul (clip-path al pct%).
// Compartida por familia, ventas por vendedor y descuento por empleado.
function BarTrack({ pct, value }: { pct: number; value: string }) {
  return (
    <span className="dash-family-track">
      <span
        className={`dash-family-fill${pct === 0 ? ' is-zero' : ''}`}
        style={{ width: `${pct}%` }}
      />
      <span className="dash-family-val dash-family-val-base">{value}</span>
      <span className="dash-family-clip" style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}>
        <span className="dash-family-val dash-family-val-fill">{value}</span>
      </span>
    </span>
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
      {/* Sin delta calculable (null) el chip se oculta: un "—" flotante parece roto. */}
      {props.delta != null && (
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
      ? (props.data?.topSales ?? []).map((r) => ({ name: r.name, value: fmtEur(r.total) }))
      : tab === 'margin'
        ? (props.data?.topMargin ?? []).map((r) => ({ name: r.name, value: fmtEur(r.margin) }))
        : (props.data?.worstRotation ?? []).map((r) => ({
            name: r.name,
            value: `${fmtNum(r.units, 0)} ud`,
          }));

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
            <li key={`${r.name}-${i}`} className="dash-rank-row">
              <span className="dash-rank-pos">{i + 1}</span>
              <span className="dash-rank-name">{r.name}</span>
              <span className="dash-rank-value">{r.value}</span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
