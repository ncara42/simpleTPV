import { KpiDual, KpiStat } from '@simpletpv/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import { getMarginKpis, getSalesKpis, getStockoutKpis } from '../../lib/dashboard.js';
import { PanelShell } from './PanelShell.js';
import type { PanelProps } from './types.js';

type LoadState = 'loading' | 'error' | undefined;
function loadState(q: { isLoading: boolean; isError: boolean }): LoadState {
  if (q.isError) return 'error';
  if (q.isLoading) return 'loading';
  return undefined;
}

// Sección 07 · KPI dual — dos métricas apiladas (Facturación + Beneficio) en una tarjeta.
export function DualKpi({ period, store }: PanelProps): ReactElement {
  const sales = useQuery({
    queryKey: ['dash-sales-kpis', period, store],
    queryFn: () => getSalesKpis(period, store),
    placeholderData: keepPreviousData,
  });
  const margin = useQuery({
    queryKey: ['dash-margin', period, store],
    queryFn: () => getMarginKpis(period, store),
    placeholderData: keepPreviousData,
  });
  const s = sales.data;
  const m = margin.data;

  return (
    <PanelShell id="kpi-dual" fit="stretch" bare>
      <KpiDual
        corner="Dual"
        top={{ label: 'Facturación', value: s?.revenue ?? null, format: 'eur' }}
        bottom={{ label: 'Beneficio', value: m?.realMargin ?? null, format: 'eur' }}
      />
    </PanelShell>
  );
}

// Sección 07 · KPI con área — % Margen del periodo con sparkline de área a sangre (tarjeta).
export function AreaKpi({ period, store }: PanelProps): ReactElement {
  const margin = useQuery({
    queryKey: ['dash-margin', period, store],
    queryFn: () => getMarginKpis(period, store),
    placeholderData: keepPreviousData,
  });
  const m = margin.data;
  const st = loadState(margin);

  return (
    <PanelShell id="kpi-area" fit="stretch" bare>
      <KpiStat
        variant="card"
        corner="Área"
        label="% Margen"
        value={m?.marginPct ?? null}
        format="percentRatio"
        {...(m?.series ? { spark: m.series } : {})}
        {...(st ? { state: st } : {})}
      />
    </PanelShell>
  );
}

// Sección 07 · KPI de alerta — venta perdida estimada por roturas, tarjeta teñida de rojo (tone danger).
export function AlertKpi({ period, store }: PanelProps): ReactElement {
  const stockout = useQuery({
    queryKey: ['dash-stockout', period, store],
    queryFn: () => getStockoutKpis(period, store),
    placeholderData: keepPreviousData,
  });
  const so = stockout.data;
  const st = loadState(stockout);

  return (
    <PanelShell id="kpi-alerta" fit="stretch" bare>
      <KpiStat
        variant="card"
        tone="danger"
        corner="Alerta"
        label="Venta perdida est."
        value={so?.estimatedLostSales ?? null}
        format="eur"
        {...(so ? { chip: { text: `${so.open} roturas`, tone: 'danger' as const } } : {})}
        {...(st ? { state: st } : {})}
      />
    </PanelShell>
  );
}

// Sección 07 · KPI de 7 días — beneficio con mini-barras de la serie reciente (SparkBars, último resaltado).
export function SevenDayKpi({ period, store }: PanelProps): ReactElement {
  const margin = useQuery({
    queryKey: ['dash-margin', period, store],
    queryFn: () => getMarginKpis(period, store),
    placeholderData: keepPreviousData,
  });
  const m = margin.data;
  const st = loadState(margin);
  const bars = m?.realMarginSeries ? m.realMarginSeries.slice(-7) : undefined;

  return (
    <PanelShell id="kpi-7dias" fit="stretch" bare>
      <KpiStat
        variant="card"
        corner="7 días"
        label="Beneficio"
        value={m?.realMargin ?? null}
        format="eur"
        {...(bars && bars.length >= 2 ? { bars, barsAccent: 'last' as const } : {})}
        {...(st ? { state: st } : {})}
      />
    </PanelShell>
  );
}
