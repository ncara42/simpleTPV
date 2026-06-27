import { KpiGrid, KpiStat } from '@simpletpv/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import { getMarginKpis, getSalesKpis, getStockoutKpis } from '../../lib/dashboard.js';
import { PanelShell } from './PanelShell.js';
import type { PanelProps } from './types.js';

// Estado de carga/error para las moléculas presentacionales (que reciben `state`, no isLoading).
type LoadState = 'loading' | 'error' | undefined;
function loadState(q: { isLoading: boolean; isError: boolean }): LoadState {
  if (q.isError) return 'error';
  if (q.isLoading) return 'loading';
  return undefined;
}

// Sección 01 · Rejilla conectada de 6 KPIs — banda full-bleed estilo Vercel Analytics (KpiGrid bleed):
// Facturación, Ticket medio, Uds/ticket, % Margen, Beneficio y Venta perdida estimada. Cada celda
// muestra su mini-sparkline cuando hay serie disponible (ticket, UPT, beneficio, margen).
export function ConnectedKpiGrid({ period, store }: PanelProps): ReactElement {
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
  const stockout = useQuery({
    queryKey: ['dash-stockout', period, store],
    queryFn: () => getStockoutKpis(period, store),
    placeholderData: keepPreviousData,
  });

  const s = sales.data;
  const m = margin.data;
  const so = stockout.data;
  const ss = s?.series;
  const sSt = loadState(sales);
  const mSt = loadState(margin);
  const soSt = loadState(stockout);

  return (
    <PanelShell id="kpi-grid-connected" fill>
      <KpiGrid columns={6} bleed>
        <KpiStat
          label="Facturación"
          value={s?.revenue ?? null}
          format="eur"
          {...(s ? { chip: { text: `${s.salesCount} tickets`, tone: 'neutral' as const } } : {})}
          {...(sSt ? { state: sSt } : {})}
        />
        <KpiStat
          label="Ticket medio"
          value={s?.avgTicket ?? null}
          format="eur"
          {...(ss?.avgTicket ? { spark: ss.avgTicket } : {})}
          {...(sSt ? { state: sSt } : {})}
        />
        <KpiStat
          label="Uds. / ticket"
          value={s?.upt ?? null}
          format="decimal"
          {...(ss?.upt ? { spark: ss.upt } : {})}
          {...(sSt ? { state: sSt } : {})}
        />
        <KpiStat
          label="% Margen"
          value={m?.marginPct ?? null}
          format="percentRatio"
          {...(m?.series ? { spark: m.series } : {})}
          {...(mSt ? { state: mSt } : {})}
        />
        <KpiStat
          label="Beneficio"
          value={m?.realMargin ?? null}
          format="eur"
          {...(m?.realMarginSeries ? { spark: m.realMarginSeries } : {})}
          {...(mSt ? { state: mSt } : {})}
        />
        <KpiStat
          label="Venta perdida est."
          value={so?.estimatedLostSales ?? null}
          format="eur"
          {...(so ? { chip: { text: `${so.open} roturas`, tone: 'danger' as const } } : {})}
          {...(soSt ? { state: soSt } : {})}
        />
      </KpiGrid>
    </PanelShell>
  );
}

// Sección 01 · Tarjeta clásica — tratamiento «A · Clásica» de una sola cifra (Facturación del periodo)
// con chip de contexto y sparkline a sangre. Variante card (borde + cifra grande + etiqueta de esquina).
export function ClassicKpiCard({ period, store }: PanelProps): ReactElement {
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
  const st = loadState(sales);

  return (
    <PanelShell id="kpi-classic">
      <KpiStat
        variant="card"
        corner="Clásica"
        label="Facturación"
        value={s?.revenue ?? null}
        format="eur"
        {...(s ? { chip: { text: `${s.salesCount} tickets`, tone: 'neutral' as const } } : {})}
        {...(m?.series ? { spark: m.series } : {})}
        {...(st ? { state: st } : {})}
      />
    </PanelShell>
  );
}
