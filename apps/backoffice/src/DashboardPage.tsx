import './dashboard.css';

import { Badge, Chart, Select, Sparkline } from '@simpletpv/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BarChart2, ChevronDown, LineChart, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { DaySelector } from './components/DaySelector.js';
import { listStores } from './lib/admin.js';
import {
  type DashboardPeriod,
  type FamilySales,
  getArchetypeRotation,
  getDiscountByEmployee,
  getMarginKpis,
  getProductRankings,
  getProductRotation,
  getSalesByEmployee,
  getSalesByFamily,
  getSalesByHourOnDay,
  getSalesKpis,
  getSalesToday,
  getStockoutKpis,
  type SalesByHour,
  type SalesCompareMode,
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
  { id: 'yesterday', label: 'Ayer' },
  { id: 'today', label: 'Hoy' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mes' },
  { id: 'year', label: 'Año' },
];

// Subtítulo de panel según el periodo seleccionado (más claro que "Periodo actual").
const PERIOD_SUBTITLE: Record<DashboardPeriod, string> = {
  today: 'Hoy',
  yesterday: 'Ayer',
  week: 'Esta semana',
  month: 'Este mes',
  year: 'Este año',
};

// Fecha completa del día elegido en "Ventas por hora" (subtítulo de la card).
const HOUR_DAY_FMT = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const formatHourDay = (iso: string): string => {
  const s = HOUR_DAY_FMT.format(new Date(`${iso}T00:00:00`));
  return s.charAt(0).toUpperCase() + s.slice(1);
};

// ── Comparativa del panel de ventas (hoy vs ayer / mes vs mes / año vs año) ──
const MONTHS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

// Nombre capitalizado del mes (índice 0..11, envuelto para meses anteriores).
const monthLabel = (m: number): string => {
  const name = MONTHS_ES[((m % 12) + 12) % 12]!;
  return name.charAt(0).toUpperCase() + name.slice(1);
};

interface CompareLabels {
  current: string;
  previous: string;
}

// Etiquetas "actual vs anterior" de cada modo, derivadas de la fecha de hoy.
// Alimentan el desplegable, la leyenda de color y el tooltip del panel.
const compareLabelsFor = (mode: SalesCompareMode, now: Date): CompareLabels => {
  if (mode === 'month') {
    return { current: monthLabel(now.getMonth()), previous: monthLabel(now.getMonth() - 1) };
  }
  if (mode === 'year') {
    return { current: String(now.getFullYear()), previous: String(now.getFullYear() - 1) };
  }
  return { current: 'Hoy', previous: 'Ayer' };
};

const COMPARE_MODES: SalesCompareMode[] = ['day', 'month', 'year'];

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

// Cards con toggle barras↔línea independiente. El tipo de gráfico es LOCAL a cada
// card: cambiarlo en "Ventas" no afecta a "Ventas por hora" ni viceversa.
type ChartCard = 'sales' | 'hour';

// Preferencia de layout (I-15, simplificada en U-03/D-18): preset activo y tipo de
// gráfico POR card. Las claves antiguas (hiddenByPreset, dashboard.cards y el
// `chartKind` global previo a la separación por card) se ignoran.
interface LayoutPref {
  preset?: PresetId;
  /** U-02: representación (barras o línea) de cada card con toggle, independiente. */
  chartKinds?: Partial<Record<ChartCard, 'bars' | 'line'>>;
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
  // Modo de comparación del panel "Ventas" (desplegable dentro de la card).
  const [compare, setCompare] = useState<SalesCompareMode>('day');
  // Búsqueda del panel "Ventas por familia" (la lista hace scroll vertical).
  const [familyQuery, setFamilyQuery] = useState('');
  // "Ventas por hora" muestra siempre UN día concreto (no un agregado del rango): su
  // día es independiente del selector de periodo y se elige con el calendario propio.
  const [hourDay, setHourDay] = useState<string>(() =>
    new Intl.DateTimeFormat('en-CA').format(new Date()),
  );
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
  // Comparativa del panel de ventas en mes/año. En `day` reusamos `salesToday`
  // (la misma query que la KPI card) para no duplicar el fetch del caso común.
  const salesComparison = useQuery({
    queryKey: ['dash-comparison', compare, store],
    queryFn: () => getSalesToday(store, compare),
    placeholderData: keepPreviousData,
    enabled: vis.has('dash-bars') && compare !== 'day',
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
  // Por DÍA (hourDay), no por periodo: refleja siempre horas reales de ese día.
  const byHour = useQuery({
    queryKey: ['dash-hour', hourDay, store],
    queryFn: () => getSalesByHourOnDay(hourDay, store),
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
  // U-02: toggle barras ↔ línea LOCAL a cada card (persistido por card en el layout).
  // Cambiar el de una card no toca el de la otra.
  const chartKindFor = (card: ChartCard): 'bars' | 'line' =>
    layout.chartKinds?.[card] === 'line' ? 'line' : 'bars';
  const setChartKind = (card: ChartCard, kind: 'bars' | 'line'): void =>
    setPref('dashboard.layout', {
      ...layout,
      chartKinds: { ...layout.chartKinds, [card]: kind },
    });
  const salesKind = chartKindFor('sales');
  const hourKind = chartKindFor('hour');

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
        {/* Ventas: comparativa por tienda (hoy vs ayer / mes vs mes / año vs año).
            El toggle barras↔línea y el desplegable de comparación viven DENTRO de
            la card, en su cabecera. */}
        {vis.has('dash-bars') &&
          (() => {
            const labels = compareLabelsFor(compare, new Date());
            const comparisonData = compare === 'day' ? salesToday.data : salesComparison.data;
            const stores = comparisonData?.byStore ?? [];
            return (
              <div className="dash-panel span-7" data-testid="dash-bars">
                <header className="dash-panel-head">
                  {/* Título + subtítulo en columna: el subtítulo queda pegado al
                      título y no lo arrastra hacia abajo la altura de los controles. */}
                  <div className="dash-panel-titles">
                    <h3>Ventas</h3>
                    <p className="dash-panel-sub">Facturación neta por tienda</p>
                  </div>
                  {/* Fila de pills a la derecha del título (toggle + desplegable),
                      centrada verticalmente con el título+subtítulo. */}
                  <div className="dash-bars-controls">
                    {/* U-02: toggle barras ↔ línea LOCAL a esta card (no afecta a otras). */}
                    <ChartKindToggle
                      chartKind={salesKind}
                      setChartKind={(k) => setChartKind('sales', k)}
                    />
                    {/* Desplegable de comparación. El triggerNode colorea cada
                        parte como leyenda implícita: gris = anterior, verde = actual. */}
                    <Select
                      className="dash-compare-select"
                      value={compare}
                      onChange={(value) => setCompare(value as SalesCompareMode)}
                      ariaLabel="Comparar"
                      data-testid="dash-compare"
                      triggerNode={
                        <>
                          <span className="dash-compare-prev">{labels.previous}</span>
                          {' vs '}
                          <span className="dash-compare-curr">{labels.current.toLowerCase()}</span>
                        </>
                      }
                      options={COMPARE_MODES.map((mode) => {
                        const l = compareLabelsFor(mode, new Date());
                        return {
                          value: mode,
                          label: `${l.previous} vs ${l.current.toLowerCase()}`,
                        };
                      })}
                    />
                  </div>
                </header>
                {/* U-01: Chart común (color constante, tooltip lateral actual/anterior/delta). */}
                <Chart
                  data={stores.map((s) => {
                    const tone = deltaTone(s.deltaPct);
                    const subTone = tone === 'flat' ? ('neutral' as const) : tone;
                    return {
                      label: s.storeName,
                      value: s.today,
                      compareValue: s.yesterday,
                      valueText: `${labels.current} ${fmtEur(s.today)}`,
                      compareText: `${labels.previous} ${fmtEur(s.yesterday)}`,
                      // Tooltip estructurado: periodo (etiqueta) ↔ importe (derecha).
                      tipValueLabel: labels.current,
                      tipValueAmount: fmtEur(s.today),
                      tipCompareLabel: labels.previous,
                      tipCompareAmount: fmtEur(s.yesterday),
                      tipExtra: fmtDelta(s.deltaPct),
                      tipExtraTone: subTone,
                      // Delta bajo el nombre de la tienda, coloreado por signo.
                      subValue: fmtDelta(s.deltaPct),
                      subTone,
                    };
                  })}
                  height={200}
                  formatValue={fmtEurCompact}
                  kind={salesKind}
                  showGrid={false}
                  barValues={salesKind === 'bars'}
                  // Modo línea a sangre: el trazo toca el filo de la card cancelando
                  // el padding del panel (1.5rem = 24px); puntos y nombres se reinsertan.
                  edgeBleed={24}
                  animated={false}
                  ariaLabel={`Ventas por tienda · ${labels.current} vs ${labels.previous}`}
                />
              </div>
            );
          })()}

        {/* Ventas por familia (barras CSS horizontales). Paginado de 5 en 5 con
            buscador + flechas arriba a la derecha: la card no crece en altura
            indefinidamente (antes arrastraba la card de Ventas a la izquierda). */}
        {vis.has('dash-family') &&
          (() => {
            const fams = byFamily.data ?? [];
            // Máximo sobre TODAS las familias: las barras son comparables al hacer scroll.
            const max = Math.max(1, ...fams.map((f) => f.total));
            const totalSum = fams.reduce((sum, f) => sum + f.total, 0);
            const q = familyQuery.trim().toLowerCase();
            const filtered = q ? fams.filter((f) => f.familyName.toLowerCase().includes(q)) : fams;
            return (
              <div className="dash-panel span-5 dash-panel--paged" data-testid="dash-family">
                <header className="dash-panel-head">
                  {/* Título + subtítulo apilados a la izquierda (como en Ventas),
                      buscador a la derecha y centrado verticalmente con ambos. */}
                  <div className="dash-panel-titles">
                    <h3>Ventas por familia</h3>
                    <p className="dash-panel-sub">{PERIOD_SUBTITLE[period]}</p>
                  </div>
                  {/* Buscador con el mismo diseño/tamaño que el lanzador del header. */}
                  <label className="dash-family-search">
                    <Search size={15} aria-hidden="true" />
                    <input
                      type="search"
                      value={familyQuery}
                      onChange={(e) => setFamilyQuery(e.target.value)}
                      placeholder="Buscar familia…"
                      aria-label="Buscar familia"
                      data-testid="dash-family-search"
                    />
                  </label>
                </header>
                {filtered.length === 0 ? (
                  <p className="catalog-empty">Sin familias que coincidan.</p>
                ) : (
                  <FamilyScrollList items={filtered} max={max} totalSum={totalSum} />
                )}
              </div>
            );
          })()}

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
            className={`dash-panel dash-panel--paged ${vis.has('rank-sales') ? 'span-5' : 'span-7'}`}
            data-testid="dash-rankings"
          >
            <Rankings
              key={preset.id}
              data={rankings.data}
              loading={rankings.isLoading}
              subtitle={PERIOD_SUBTITLE[period]}
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

        {/* Ventas por hora (STAT-02): card de UN día concreto (independiente del selector
            de periodo). Cabecera con título + la fecha del día; a la derecha, selector de
            día (flechas + calendario propio) y el toggle barras↔línea. Las 24 franjas se
            recorren arrastrando el gráfico o la barra fina. */}
        {vis.has('dash-hour') && (
          <div className="dash-panel span-7" data-testid="dash-hour">
            <header className="dash-panel-head">
              <div className="dash-panel-titles">
                <h3>Ventas por hora</h3>
                <p className="dash-panel-sub">{formatHourDay(hourDay)}</p>
              </div>
              <div className="dash-bars-controls">
                <DaySelector value={hourDay} onChange={setHourDay} />
                {/* U-02: toggle LOCAL a esta card (no afecta a "Ventas"). */}
                <ChartKindToggle
                  chartKind={hourKind}
                  setChartKind={(k) => setChartKind('hour', k)}
                />
              </div>
            </header>
            <HourChart data={byHour.data ?? []} chartKind={hourKind} />
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
                        />
                        <span className="dash-family-pct">{fmtEur(e.total)}</span>
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

// Contenedor con scroll vertical (lista completa) e indicadores de desbordamiento:
// degradado + chevron animado abajo cuando queda contenido por ver, y un degradado
// tenue arriba al haber bajado. El estado de los filos se recalcula al hacer scroll
// y cuando cambia `resetKey` (búsqueda/periodo/pestaña). Lo comparten "Ventas por
// familia" y "Rankings de producto", que muestran ~5 filas y el resto por scroll.
function ScrollFadeList({
  className,
  testId,
  resetKey,
  children,
}: {
  className: string;
  testId: string;
  resetKey: unknown;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLOListElement>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });
  const update = (): void => {
    const el = ref.current;
    if (!el) return;
    setEdges({
      top: el.scrollTop > 1,
      bottom: el.scrollTop + el.clientHeight < el.scrollHeight - 1,
    });
  };
  useEffect(update, [resetKey]);
  const cls = ['dash-family-scroll', edges.top && 'is-scrolled', edges.bottom && 'has-more']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls}>
      <ol ref={ref} onScroll={update} className={className} data-testid={testId}>
        {children}
      </ol>
      {/* Pista de scroll: chevron que rebota sobre el degradado inferior. */}
      <span className="dash-family-more" aria-hidden="true">
        <ChevronDown size={18} />
      </span>
    </div>
  );
}

// Lista de "Ventas por familia" (todas las familias, con scroll).
function FamilyScrollList({
  items,
  max,
  totalSum,
}: {
  items: FamilySales[];
  max: number;
  totalSum: number;
}) {
  return (
    <ScrollFadeList
      className="dash-family-list dash-family-list--scroll dash-family-list--fam"
      testId="dash-family-list"
      resetKey={items}
    >
      {items.map((f, i) => (
        <li key={f.familyId ?? `none-${i}`} style={{ '--i': i } as React.CSSProperties}>
          <span className="dash-family-pos">{i + 1}</span>
          <span className="dash-family-name">{f.familyName}</span>
          <span className="dash-family-amount">{fmtEur(f.total)}</span>
          <span className="dash-family-share">
            {fmtRate(totalSum > 0 ? f.total / totalSum : 0)}
          </span>
          <span className="dash-family-track">
            <span className="dash-family-fill" style={{ width: `${(f.total / max) * 100}%` }} />
          </span>
        </li>
      ))}
    </ScrollFadeList>
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

// U-02: toggle barras ↔ línea reutilizable. Es un control "tonto": cada card le pasa
// SU propio `chartKind` y `setChartKind`, de modo que el cambio es LOCAL a la card que
// lo monta (Ventas y Ventas por hora son independientes).
function ChartKindToggle({
  chartKind,
  setChartKind,
}: {
  chartKind: 'bars' | 'line';
  setChartKind: (kind: 'bars' | 'line') => void;
}) {
  return (
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
  );
}

// "Ventas por hora": 24 franjas (0..23) en una pista con scroll horizontal SIN barra
// nativa visible. Al montar dimensiona cada franja para que entren ~11 (de 7 a 17) en el
// ancho disponible y arranca desplazado a las 7h (comercio diurno). Para recorrer el día
// de forma granular y sin clics repetidos: se ARRASTRA el propio gráfico (grab-to-pan con
// ratón) y/o se arrastra una BARRA FINA debajo (pulgar arrastrable + clic en la pista
// para saltar). Rueda del ratón y flechas del teclado siguen disponibles. Las horas sin
// ventas quedan a 0 para que el eje temporal esté completo.
const HOUR_FIRST = 7;
const HOUR_VISIBLE = 11; // 7..17 visibles por defecto
const HOUR_COL_MIN = 42; // ancho mínimo por franja → barra cómoda (~24px)
const HOUR_KEY_FRACTION = 0.45; // cuánto del ancho visible avanza cada flecha del teclado

function HourChart({ data, chartKind }: { data: SalesByHour[]; chartKind: 'bars' | 'line' }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const didScroll = useRef(false);
  // Pulgar de la barra fina (en % del ancho de la pista) y estado de arrastre (cursor).
  const [thumb, setThumb] = useState({ left: 0, width: 100 });
  const [dragging, setDragging] = useState(false);
  // Origen del arrastre activo: el lienzo (grab-to-pan) o el pulgar de la barra.
  const panFrom = useRef<number | null>(null);
  const thumbFrom = useRef<number | null>(null);

  const revByHour = new Map(data.map((h) => [h.hour, h.revenue]));
  const hours = Array.from({ length: 24 }, (_, h) => ({
    label: `${h}h`,
    value: revByHour.get(h) ?? 0,
  }));

  // Recalcula tamaño y posición del pulgar a partir del scroll actual.
  const updateThumb = (): void => {
    const el = scrollRef.current;
    if (!el || el.scrollWidth <= 0) return;
    setThumb({
      left: (el.scrollLeft / el.scrollWidth) * 100,
      width: Math.min(100, (el.clientWidth / el.scrollWidth) * 100),
    });
  };

  // Dimensiona la pista (re-mide en cada resize) y, solo la primera vez, arranca en las 7h.
  useEffect(() => {
    const el = scrollRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    const size = (): void => {
      const col = Math.max(HOUR_COL_MIN, el.clientWidth / HOUR_VISIBLE);
      track.style.width = `${24 * col}px`;
      if (!didScroll.current) {
        el.scrollLeft = HOUR_FIRST * col;
        didScroll.current = true;
      }
      updateThumb();
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(el);
    return () => ro.disconnect();
  }, [chartKind, data.length]);

  // Rueda del ratón → desplazamiento horizontal. Listener nativo no pasivo para poder
  // cancelar el scroll vertical de la página; en los extremos deja que la página siga.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!delta) return;
      const atStart = el.scrollLeft <= 0;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
      if ((delta < 0 && !atStart) || (delta > 0 && !atEnd)) {
        el.scrollLeft += delta;
        e.preventDefault();
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ── Grab-to-pan: arrastrar el propio gráfico con el ratón (el táctil/trackpad usan el
  // scroll nativo, así que solo interceptamos puntero de ratón). ──
  const onCanvasPointerDown = (e: React.PointerEvent): void => {
    if (e.pointerType !== 'mouse') return;
    panFrom.current = e.clientX;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onCanvasPointerMove = (e: React.PointerEvent): void => {
    const el = scrollRef.current;
    if (panFrom.current == null || !el) return;
    el.scrollLeft -= e.clientX - panFrom.current;
    panFrom.current = e.clientX;
  };
  const endCanvasPan = (): void => {
    panFrom.current = null;
    setDragging(false);
  };

  // ── Barra fina: arrastrar el pulgar (mapeo px-barra → px-scroll) o clic en la pista
  // para saltar centrando esa posición. ──
  const onThumbPointerDown = (e: React.PointerEvent): void => {
    e.stopPropagation(); // no dispares el "saltar al clic" de la pista
    thumbFrom.current = e.clientX;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onThumbPointerMove = (e: React.PointerEvent): void => {
    const el = scrollRef.current;
    const bar = barRef.current;
    if (thumbFrom.current == null || !el || !bar) return;
    el.scrollLeft += (e.clientX - thumbFrom.current) * (el.scrollWidth / bar.clientWidth);
    thumbFrom.current = e.clientX;
  };
  const endThumbDrag = (): void => {
    thumbFrom.current = null;
    setDragging(false);
  };
  const onBarPointerDown = (e: React.PointerEvent): void => {
    const el = scrollRef.current;
    const bar = barRef.current;
    if (!el || !bar) return;
    const x = e.clientX - bar.getBoundingClientRect().left;
    el.scrollTo({
      left: (x / bar.clientWidth) * el.scrollWidth - el.clientWidth / 2,
      behavior: 'smooth',
    });
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    const el = scrollRef.current;
    if (!el) return;
    if (e.key === 'ArrowRight') {
      el.scrollBy({ left: el.clientWidth * HOUR_KEY_FRACTION, behavior: 'smooth' });
      e.preventDefault();
    } else if (e.key === 'ArrowLeft') {
      el.scrollBy({ left: -el.clientWidth * HOUR_KEY_FRACTION, behavior: 'smooth' });
      e.preventDefault();
    }
  };

  const wrapCls = ['dash-hour-wrap', dragging && 'is-dragging'].filter(Boolean).join(' ');
  // El pulgar solo tiene sentido si hay desbordamiento (si cabe todo, ocupa el 100%).
  const hasOverflow = thumb.width < 99.5;

  return (
    <div className={wrapCls}>
      {/* Lienzo desplazable: grab-to-pan con ratón + enfocable para teclado (accesible). */}
      <div
        className="dash-hour-scroll"
        ref={scrollRef}
        onScroll={updateThumb}
        onKeyDown={onKeyDown}
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={endCanvasPan}
        onPointerCancel={endCanvasPan}
        tabIndex={0}
        role="group"
        aria-label="Ventas por hora · arrastra para recorrer las 24 horas"
      >
        <div className="dash-hour-track" ref={trackRef} style={{ width: `${24 * HOUR_COL_MIN}px` }}>
          <Chart
            className="dash-hour-chart"
            data={hours}
            height={200}
            formatValue={fmtEurCompact}
            kind={chartKind}
            showGrid={false}
            // Mismo lenguaje que Ventas: en barras, el importe va rotulado dentro/encima
            // de la barra (y se desactiva el tooltip lateral, igual que en Ventas).
            barValues={chartKind === 'bars'}
            animated={false}
            ariaLabel="Ventas por hora"
          />
        </div>
      </div>
      {/* Barra fina arrastrable: indicador de posición + control directo. Clic en la
          pista salta; arrastrar el pulgar desplaza. Solo visible si hay más de lo que cabe. */}
      {hasOverflow && (
        <div
          className="dash-hour-bar"
          ref={barRef}
          onPointerDown={onBarPointerDown}
          data-testid="dash-hour-bar"
        >
          <div
            className="dash-hour-thumb"
            style={{ left: `${thumb.left}%`, width: `${thumb.width}%` }}
            onPointerDown={onThumbPointerDown}
            onPointerMove={onThumbPointerMove}
            onPointerUp={endThumbDrag}
            onPointerCancel={endThumbDrag}
            role="presentation"
          />
        </div>
      )}
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
  // Subtítulo de periodo (Hoy/Ayer/Esta semana/…), igual que el resto de paneles.
  subtitle?: string;
  // Pestaña inicial según el preset (D-08): top ventas / top margen / peor rotación.
  initialTab?: RankTab;
}) {
  const [tab, setTab] = useState<RankTab>(props.initialTab ?? 'sales');
  // Cabecera común: título + subtítulo apilados a la izquierda (como Ventas/familia),
  // selector de ranking a la derecha y centrado con ambos.
  const head = (disabled: boolean): React.ReactNode => (
    <header className="dash-panel-head">
      <div className="dash-panel-titles">
        <h3>Rankings de producto</h3>
        {props.subtitle != null && <p className="dash-panel-sub">{props.subtitle}</p>}
      </div>
      <Select
        className="dash-rank-select"
        value={tab}
        onChange={(v) => setTab(v as RankTab)}
        ariaLabel="Filtrar ranking"
        data-testid="rank-tabs"
        options={RANK_OPTIONS}
        disabled={disabled}
      />
    </header>
  );
  if (props.loading) {
    return (
      <>
        {head(true)}
        <p className="catalog-empty">Cargando…</p>
      </>
    );
  }
  // Cada fila lleva su importe formateado (value) y el valor numérico crudo (raw)
  // para dibujar la barra proporcional y el % de cuota, igual que "Ventas por familia".
  const rows =
    tab === 'sales'
      ? (props.data?.topSales ?? []).map((r) => ({
          name: r.name,
          raw: r.total,
          value: fmtEur(r.total),
        }))
      : tab === 'margin'
        ? (props.data?.topMargin ?? []).map((r) => ({
            name: r.name,
            raw: r.margin,
            value: fmtEur(r.margin),
          }))
        : (props.data?.worstRotation ?? []).map((r) => ({
            name: r.name,
            raw: r.units,
            value: `${fmtNum(r.units, 0)} ud`,
          }));
  // Máximo (escala de las barras) y suma (cuota %) sobre las filas mostradas.
  const max = Math.max(1, ...rows.map((r) => r.raw));
  const sum = rows.reduce((acc, r) => acc + r.raw, 0);

  return (
    <>
      {head(false)}
      {rows.length === 0 ? (
        <p className="catalog-empty">Sin datos.</p>
      ) : (
        <ScrollFadeList
          className="dash-family-list dash-family-list--scroll dash-family-list--fam"
          testId="rank-table"
          resetKey={`${tab}-${rows.length}`}
        >
          {rows.map((r, i) => (
            <li key={`${r.name}-${i}`} style={{ '--i': i } as React.CSSProperties}>
              <span className="dash-family-pos">{i + 1}</span>
              <span className="dash-family-name">{r.name}</span>
              <span className="dash-family-amount">{r.value}</span>
              <span className="dash-family-share">{fmtRate(sum > 0 ? r.raw / sum : 0)}</span>
              <span className="dash-family-track">
                <span className="dash-family-fill" style={{ width: `${(r.raw / max) * 100}%` }} />
              </span>
            </li>
          ))}
        </ScrollFadeList>
      )}
    </>
  );
}
