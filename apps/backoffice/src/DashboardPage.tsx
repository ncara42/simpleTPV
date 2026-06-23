import './dashboard.css';

import { Badge, Chart, Input, Select, Sparkline } from '@simpletpv/ui';
import { usePageHeader } from '@simpletpv/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BarChart2, ChevronDown, LineChart, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { DaySelector } from './components/DaySelector.js';
import { type CanvasMeta, FreeBoard, type FreeBoardHandle } from './components/FreeBoard.js';
import { useCanvasBridge } from './lib/canvas-bridge.js';
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
  type ChartCard,
  type FreeLayout,
  type LayoutPref,
  migrateLayoutPref,
  PRESETS,
  reconcileFreeLayout,
} from './lib/dashboard-layout.js';
import { useDashboardStore } from './lib/dashboard-store.js';
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
import { parsePeriod } from './lib/period.js';
import { readPref, usePreferences } from './lib/preferences.js';
import { listPurchaseOrders } from './lib/purchases.js';
import { listAlerts, listExpiringBatches } from './lib/stock.js';
import { compareSupplierPrices } from './lib/supplier-prices.js';
import { fmtMinutes, hhmm, listHistoryAll, msToMin } from './lib/time-clock.js';
import { STATUS_LABEL } from './purchases/labels.js';
import { ALERT_LABEL, df, EXPIRY_LABEL, expiryDaysText } from './stock/labels.js';
import { getWidgetLabel, getWidgetSpec } from './widgets/registry.js';

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

// La sparkline solo tiene tonos brand/up/down; 'flat' (sin tendencia) usa el
// neutro 'brand'. Convierte el tono semántico de una métrica al de la sparkline.
const toSparkTone = (tone: 'up' | 'down' | 'flat'): SparkTone => (tone === 'flat' ? 'brand' : tone);

export function DashboardPage({
  onNavigate,
  onOpenSupplierComparison,
}: {
  // Links a otras pages (I-16/I-17): paneles → Proveedores/Stock; pie → Ventas.
  onNavigate?: ((tab: 'suppliers' | 'stock' | 'sales') => void) | undefined;
  // S-25: el widget de comparativa abre el deep-link a la comparativa de precios
  // (`/suppliers?vista=comparativa`), no la página Proveedores genérica. Va como
  // callback propio para no generalizar `onNavigate` a destinos arbitrarios antes
  // de F0/S-06 (esa migración pertenece a esas fases).
  onOpenSupplierComparison?: (() => void) | undefined;
} = {}) {
  // El periodo se fija al cargar (desde ?period= si está; fallback 'today') y NO se cambia desde la
  // UI: el filtro de tiempo (selector de periodo S-11) se retiró del dashboard por preferencia del
  // usuario. `period` sigue alimentando todas las queries/getters; solo desaparece su control.
  const [searchParams] = useSearchParams();
  const [period] = useState<DashboardPeriod>(() =>
    parsePeriod(searchParams.get('period'), 'today'),
  );
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

  // Preferencias ANTES de las queries: el preset activo decide qué se pinta Y
  // qué endpoints se consultan (enabled por visibilidad). D-18: la composición
  // (tarjetas y paneles) la dictan exclusivamente los presets; D-19 añade el orden
  // personalizable DENTRO de cada preset (no cambia qué aparece, solo en qué orden).
  const { prefs, setPref, loaded: prefsLoaded } = usePreferences();
  // F4.1 (#188): el store es la fuente de verdad del layout; `usePreferences` queda como capa
  // de persistencia debajo. Se hidrata una vez desde el servidor y luego el store sincroniza
  // con `setPref` (debounce 500ms) mediante un persister inyectado.
  const layout = useDashboardStore((s) => s.layout);
  const hydrated = useDashboardStore((s) => s.hydrated);
  const setStoreLayout = useDashboardStore((s) => s.setLayout);
  // `setPref` se recrea en cada render (arrow inline en usePreferences); lo leemos vía ref para
  // registrar el persister una sola vez sin re-suscribir.
  const setPrefRef = useRef(setPref);
  setPrefRef.current = setPref;
  useEffect(() => {
    useDashboardStore.getState().setPersister((l) => setPrefRef.current('dashboard.layout', l));
    return () => {
      // Vuelca una escritura pendiente del debounce antes de soltar el persister (evita perder
      // un cambio al navegar fuera dentro de la ventana de 500ms).
      useDashboardStore.getState().flushPersist();
      useDashboardStore.getState().setPersister(null);
    };
  }, []);
  useEffect(() => {
    if (!prefsLoaded || hydrated) return;
    useDashboardStore.getState().hydrate(readPref<LayoutPref>(prefs, 'dashboard.layout', {}));
  }, [prefsLoaded, hydrated, prefs]);
  // Único preset activo: «personalizado». Los presets anteriores se migraron en F0.
  const preset = PRESETS[0]!;
  const vis = new Set([...preset.cards, ...preset.panels]);
  // El dashboard es siempre un lienzo libre (D-20): los widgets viven en `freeLayouts` del
  // preset activo. Habilita las queries de cada widget presente en el lienzo.
  const savedFree = reconcileFreeLayout(layout.freeLayouts?.[preset.id] ?? [], preset);
  for (const el of savedFree) {
    if (el.kind === 'widget') vis.add(el.widgetId);
  }

  // ── Asistente (dock del shell) ↔ lienzo ─────────────────────────────────────────────
  // El ChatDock vive ahora en el shell (visible en todas las views). El menú «+» de herramientas
  // necesita el handle imperativo de FreeBoard y su `canvasMeta` (deshacer/dibujo): se registran en
  // el canvas-bridge mientras esta página está montada y se limpian al desmontar. Las canvas_ops
  // del agente van directas al dashboard-store (ver AssistantDock), no por aquí.
  const freeBoardRef = useRef<FreeBoardHandle>(null);
  const [canvasMeta, setCanvasMeta] = useState<CanvasMeta>({
    canUndo: false,
    canRedo: false,
    drawOpen: false,
    mode: 'select',
  });
  // Registra/actualiza el binding al montar y cuando cambia `canvasMeta` (deshacer/dibujo).
  useEffect(() => {
    useCanvasBridge.getState().setBinding({ canvasRef: freeBoardRef, canvasMeta });
  }, [canvasMeta]);
  // Limpia el binding solo al desmontar (al salir del Dashboard → el dock pasa a chat puro).
  useEffect(() => () => useCanvasBridge.getState().setBinding(null), []);

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

  // Migración única: si el usuario tenía un preset antiguo (ventas/beneficio/inventario/equipo),
  // copia su composición a 'personalizado' y fija el preset. Idempotente.
  const migrationDone = useRef(false);
  useEffect(() => {
    // Espera a la hidratación: el layout del store es `{}` hasta sembrarse desde el servidor.
    if (!hydrated || migrationDone.current) return;
    migrationDone.current = true;
    const migrated = migrateLayoutPref(layout);
    // `migrateLayoutPref` devuelve el mismo objeto si no hay nada que migrar.
    if (migrated !== layout) setStoreLayout(migrated);
  }, [hydrated, layout, setStoreLayout]);
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

  // D-20: persiste la disposición libre del preset activo (al soltar una card).
  const onFreeChange = (next: FreeLayout): void =>
    setStoreLayout({
      ...layout,
      freeLayouts: { ...layout.freeLayouts, [preset.id]: next },
    });
  // D-20: persiste pan/zoom del lienzo libre por preset (evita zoom inconsistente al cambiar).
  const onFreeViewChange = (v: { panX: number; panY: number; zoom: number }): void =>
    setStoreLayout({
      ...layout,
      freeViews: { ...layout.freeViews, [preset.id]: v },
    });
  // U-02: toggle barras ↔ línea LOCAL a cada card (persistido por card en el layout).
  // Cambiar el de una card no toca el de la otra.
  const chartKindFor = (card: ChartCard): 'bars' | 'line' =>
    layout.chartKinds?.[card] === 'line' ? 'line' : 'bars';
  const setChartKind = (card: ChartCard, kind: 'bars' | 'line'): void =>
    setStoreLayout({
      ...layout,
      chartKinds: { ...layout.chartKinds, [card]: kind },
    });
  const salesKind = chartKindFor('sales');
  const hourKind = chartKindFor('hour');

  // Etiqueta legible de un elemento del lienzo (tarjeta KPI o panel) para el aria-label.
  const boardItemLabel = (id: string): string =>
    cardDefs.find((c) => c.id === id)?.label ?? getWidgetLabel(id);

  // El bloque de rankings se monta para la pestaña inicial que fije el preset (D-08);
  // su data-testid histórico (dash-rankings) y el selector interno se conservan.
  const rankingsNode = (initialTab: RankTab): React.ReactNode => (
    <div className="dash-panel dash-panel--paged" data-testid="dash-rankings">
      <Rankings
        key={preset.id}
        data={rankings.data}
        loading={rankings.isLoading}
        subtitle={PERIOD_SUBTITLE[period]}
        initialTab={initialTab}
      />
    </div>
  );

  // Construye un panel por id (solo se invoca para los del preset, en su orden). El span
  // de columnas viaja al wrapper sortable; el panel ya no lleva la clase span-*.
  const renderPanel = (id: string): { span: 5 | 7 | 12; node: React.ReactNode } | null => {
    switch (id) {
      // Ventas: comparativa por tienda. El toggle barras↔línea y el desplegable de
      // comparación viven DENTRO de la card, en su cabecera.
      case 'dash-bars':
        return {
          span: 7,
          node: (() => {
            const labels = compareLabelsFor(compare, new Date());
            const comparisonData = compare === 'day' ? salesToday.data : salesComparison.data;
            const barStores = comparisonData?.byStore ?? [];
            return (
              <div className="dash-panel" data-testid="dash-bars">
                <header className="dash-panel-head">
                  <div className="dash-panel-titles">
                    <h3>Ventas</h3>
                    <p className="dash-panel-sub">Facturación neta por tienda</p>
                  </div>
                  <div className="dash-bars-controls">
                    <ChartKindToggle
                      chartKind={salesKind}
                      setChartKind={(k) => setChartKind('sales', k)}
                    />
                    <Select
                      className="dash-compare-select"
                      value={compare}
                      onChange={(value) => setCompare(value as SalesCompareMode)}
                      ariaLabel="Comparar"
                      data-testid="dash-compare"
                      triggerNode={
                        <>
                          <span className="dash-compare-curr">{labels.current}</span>
                          {' vs '}
                          <span className="dash-compare-prev">{labels.previous.toLowerCase()}</span>
                        </>
                      }
                      options={COMPARE_MODES.map((mode) => {
                        const l = compareLabelsFor(mode, new Date());
                        return {
                          value: mode,
                          label: `${l.current} vs ${l.previous.toLowerCase()}`,
                        };
                      })}
                    />
                  </div>
                </header>
                <Chart
                  data={barStores.map((s) => {
                    const tone = deltaTone(s.deltaPct);
                    const subTone = tone === 'flat' ? ('neutral' as const) : tone;
                    return {
                      label: s.storeName,
                      value: s.today,
                      compareValue: s.yesterday,
                      valueText: `${labels.current} ${fmtEur(s.today)}`,
                      compareText: `${labels.previous} ${fmtEur(s.yesterday)}`,
                      tipValueLabel: labels.current,
                      tipValueAmount: fmtEur(s.today),
                      tipCompareLabel: labels.previous,
                      tipCompareAmount: fmtEur(s.yesterday),
                      tipExtra: fmtDelta(s.deltaPct),
                      tipExtraTone: subTone,
                      subValue: fmtDelta(s.deltaPct),
                      subTone,
                    };
                  })}
                  height={200}
                  formatValue={fmtEurCompact}
                  kind={salesKind}
                  showGrid={false}
                  barValues={salesKind === 'bars'}
                  edgeBleed={24}
                  animated={false}
                  ariaLabel={`Ventas por tienda · ${labels.current} vs ${labels.previous}`}
                />
              </div>
            );
          })(),
        };

      // Ventas por familia (barras CSS horizontales) con buscador y scroll vertical.
      case 'dash-family':
        return {
          span: 5,
          node: (() => {
            const fams = byFamily.data ?? [];
            const max = Math.max(1, ...fams.map((f) => f.total));
            const totalSum = fams.reduce((sum, f) => sum + f.total, 0);
            const q = familyQuery.trim().toLowerCase();
            const filtered = q ? fams.filter((f) => f.familyName.toLowerCase().includes(q)) : fams;
            return (
              <div className="dash-panel dash-panel--paged" data-testid="dash-family">
                <header className="dash-panel-head">
                  <div className="dash-panel-titles">
                    <h3>Ventas por familia</h3>
                    <p className="dash-panel-sub">{PERIOD_SUBTITLE[period]}</p>
                  </div>
                  <label className="dash-family-search">
                    <Search size={15} aria-hidden="true" />
                    <Input
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
          })(),
        };

      // Panel de roturas: alertas activas (GET /stock/alerts) + venta perdida est.
      case 'dash-stockout':
        return {
          span: 5,
          node: (
            <div className="dash-panel" data-testid="dash-stockout">
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
                <strong className="dash-lost">
                  {fmtEur(stockoutKpis.data?.estimatedLostSales)}
                </strong>
              </div>
            </div>
          ),
        };

      // Rankings: pestaña inicial según el preset (D-08). span-5 en Ventas para
      // completar fila con "Ventas por hora"; span-7 en Beneficio/Inventario.
      case 'rank-sales':
        return { span: 5, node: rankingsNode('sales') };
      case 'rank-margin':
        return { span: 7, node: rankingsNode('margin') };
      case 'rank-rotation':
        return { span: 7, node: rankingsNode('rotation') };

      // Lotes por caducar (I-16/D-08b, preset Inventario).
      case 'dash-expiring':
        return {
          span: 7,
          node: (
            <div className="dash-panel" data-testid="dash-expiring">
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
          ),
        };

      // Pedidos de compra pendientes (I-16/D-08b, preset Inventario).
      case 'dash-purchase-orders':
        return {
          span: 5,
          node: (
            <div className="dash-panel" data-testid="dash-purchase-orders">
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
                          <span className="dash-po-supplier">
                            {o.supplier?.name ?? 'Proveedor'}
                          </span>
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
          ),
        };

      // Ventas por hora (STAT-02): card de UN día concreto, navegable por arrastre.
      case 'dash-hour':
        return {
          span: 7,
          node: (
            <div className="dash-panel dash-panel--fill" data-testid="dash-hour">
              <header className="dash-panel-head">
                <div className="dash-panel-titles">
                  <h3>Ventas por hora</h3>
                  <p className="dash-panel-sub">{formatHourDay(hourDay)}</p>
                </div>
                <div className="dash-bars-controls">
                  <DaySelector value={hourDay} onChange={setHourDay} />
                  <ChartKindToggle
                    chartKind={hourKind}
                    setChartKind={(k) => setChartKind('hour', k)}
                  />
                </div>
              </header>
              <HourChart data={byHour.data ?? []} chartKind={hourKind} />
            </div>
          ),
        };

      // Ventas por vendedor (preset Equipo, D-08): facturación por empleado.
      case 'dash-sales-emp':
        return {
          span: 7,
          node: (
            <div className="dash-panel" data-testid="dash-sales-emp">
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
          ),
        };

      // Descuento medio por empleado (STAT-04).
      case 'dash-discount-emp':
        return {
          span: 5,
          node: (
            <div className="dash-panel" data-testid="dash-discount-emp">
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
          ),
        };

      // Comparativa de proveedores (I-16/D-08b, preset Beneficio).
      case 'dash-suppliers':
        return {
          span: 12,
          node: (
            <div className="dash-panel" data-testid="dash-suppliers">
              <header className="dash-panel-head">
                <h3>Comparativa de proveedores</h3>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => onOpenSupplierComparison?.()}
                  data-testid="dash-suppliers-link"
                >
                  Ver comparativa →
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
          ),
        };

      // Rotación (STAT-05/06): por arquetipo por defecto; conmutador a producto (IT-13).
      case 'dash-rotation':
        return {
          span: 12,
          node: (
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
          ),
        };

      // Fichajes de hoy (preset Equipo, D-08): jornadas registradas hoy.
      case 'dash-timeclock':
        return {
          span: 12,
          node: (
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
          ),
        };

      default:
        return null;
    }
  };

  // Nodo de un elemento del tablero por id (tarjeta KPI o panel, o widget genérico del agente).
  // Los `gen:*` (creados por el chatbot, #188/#189) los resuelve el registry vía su `render`;
  // sin esto, ningún widget genérico —simple o compuesto— sería visible en el lienzo.
  const renderItem = (id: string): React.ReactNode => {
    if (id.startsWith('gen:')) {
      return getWidgetSpec(id)?.render?.() ?? null;
    }
    const card = cardDefs.find((c) => c.id === id);
    return card ? card.node : (renderPanel(id)?.node ?? null);
  };

  return (
    <section className="catalog dashboard--free" data-testid="dashboard">
      {/* D-20: el dashboard es siempre un lienzo libre (edgeless). Sus propias herramientas
          (paleta de widgets, dibujo, deshacer, minimapa…) viven dentro de FreeBoard. El nombre de
          la view y el dock del asistente los pone el shell (ver App.tsx / AssistantDock). */}
      {/* `FreeBoard` siembra su estado interno desde `elements` SOLO al montar. Si monta antes de
          que el store hidrate las preferencias, arranca vacío y no se re-sincroniza. Incluir
          `hydrated` en la key lo re-monta una vez al hidratar, ya con el lienzo guardado. */}
      <FreeBoard
        key={`${preset.id}:${hydrated}`}
        ref={freeBoardRef}
        elements={savedFree}
        renderItem={renderItem}
        itemLabel={boardItemLabel}
        onChange={onFreeChange}
        {...(layout.freeViews?.[preset.id] ? { initialView: layout.freeViews[preset.id] } : {})}
        onViewChange={onFreeViewChange}
        onCanvasMeta={setCanvasMeta}
      />
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
      className="dash-chart-kind"
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
        aria-label="Barras"
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
        aria-label="Línea"
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
const HOUR_CHART_MIN_H = 180; // alto mínimo del gráfico (fallback hasta medir el tile)

function HourChart({ data, chartKind }: { data: SalesByHour[]; chartKind: 'bars' | 'line' }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const didScroll = useRef(false);
  // Pulgar de la barra fina (en % del ancho de la pista) y estado de arrastre (cursor).
  const [thumb, setThumb] = useState({ left: 0, width: 100 });
  const [dragging, setDragging] = useState(false);
  // Alto del gráfico: llena el alto disponible del tile (lo mide el ResizeObserver) para no
  // dejar hueco inferior. Arranca en un fallback razonable hasta la primera medida.
  const [chartH, setChartH] = useState(HOUR_CHART_MIN_H);
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
      // El scroll es flex:1 (min-height:0): su clientHeight es el alto que el tile deja
      // libre bajo la cabecera (y sobre la barra fina). El gráfico se dimensiona a él.
      if (el.clientHeight > 0) setChartH(Math.max(HOUR_CHART_MIN_H, el.clientHeight));
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
            height={chartH}
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
          id: r.productId,
          name: r.name,
          raw: r.total,
          value: fmtEur(r.total),
        }))
      : tab === 'margin'
        ? (props.data?.topMargin ?? []).map((r) => ({
            id: r.productId,
            name: r.name,
            raw: r.margin,
            value: fmtEur(r.margin),
          }))
        : (props.data?.worstRotation ?? []).map((r) => ({
            id: r.productId,
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
            <li key={r.id} style={{ '--i': i } as React.CSSProperties}>
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
