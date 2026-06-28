import {
  DonutStat,
  HeroFigure,
  KpiGrid,
  Leaderboard,
  RibbonStat,
  SparkArea,
  Treemap,
} from '@simpletpv/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import {
  getMarginKpis,
  getSalesByEmployee,
  getSalesByFamily,
  getSalesKpis,
} from '../../lib/dashboard.js';
import { PanelShell } from './PanelShell.js';
import type { PanelProps } from './types.js';

// Sección 05 · Banda compacta (RibbonStat × 3): facturación, tickets y ticket medio (con mini-área).
export function CompactRibbon({ period, store }: PanelProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-sales-kpis', period, store],
    queryFn: () => getSalesKpis(period, store),
    placeholderData: keepPreviousData,
  });
  const s = q.data;
  const avg = s?.series?.avgTicket;

  return (
    <PanelShell id="cmp-ribbon" fill>
      <KpiGrid columns={1} bleed>
        <RibbonStat label="Facturación" value={s?.revenue ?? null} format="eur0" />
        <RibbonStat label="Tickets" value={s?.salesCount ?? null} format="integer" />
        <RibbonStat
          label="Ticket medio"
          value={s?.avgTicket ?? null}
          format="eur"
          {...(avg && avg.length >= 2 ? { aside: <SparkArea data={avg} height={28} /> } : {})}
        />
      </KpiGrid>
    </PanelShell>
  );
}

// Sección 05 · Donut de reparto por familia (DonutStat): anillo mono + total al centro + leyenda.
export function CompactDonut({ period, store }: PanelProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-family', period, store],
    queryFn: () => getSalesByFamily(period, store),
    placeholderData: keepPreviousData,
  });
  const data = q.data ?? [];
  const items = data.map((f) => ({ label: f.familyName, value: f.total }));

  return (
    <PanelShell id="cmp-donut" fill>
      <DonutStat
        items={items}
        format="eur0"
        centerCaption={`${data.length} familias`}
        isLoading={q.isLoading}
        isError={q.isError}
      />
    </PanelShell>
  );
}

// Sección 05 · Treemap compacto de familias (mismo reparto que la sección Listas, en tile pequeño).
export function CompactTreemap({ period, store }: PanelProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-family', period, store],
    queryFn: () => getSalesByFamily(period, store),
    placeholderData: keepPreviousData,
  });
  const items = (q.data ?? []).map((f) => ({ label: f.familyName, value: f.total }));

  return (
    <PanelShell id="cmp-treemap" fill>
      <Treemap items={items} format="eur0" isLoading={q.isLoading} isError={q.isError} />
    </PanelShell>
  );
}

// Sección 05 · Leaderboard de vendedores (getSalesByEmployee): puesto, facturación y tickets.
export function CompactLeaderboard({ period, store }: PanelProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-sales-emp', period, store],
    queryFn: () => getSalesByEmployee(period, store),
    placeholderData: keepPreviousData,
  });
  const items = (q.data ?? []).map((e) => ({
    label: e.userName,
    value: e.total,
    detail: `${e.salesCount} tickets`,
  }));

  return (
    <PanelShell id="cmp-leaderboard" fill>
      <Leaderboard items={items} format="eur" isLoading={q.isLoading} isError={q.isError} />
    </PanelShell>
  );
}

// Sección 05 · Cifra-héroe (HeroFigure): la facturación del periodo en grande + chip de tickets y
// área de tendencia (serie de beneficio). Para destacar LA cifra del panel.
export function CompactHero({ period, store }: PanelProps): ReactElement {
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
    <PanelShell id="cmp-hero" fill>
      <HeroFigure
        eyebrow="Facturación"
        value={s?.revenue ?? null}
        format="eur"
        {...(s ? { chips: [{ text: `${s.salesCount} tickets` }] } : {})}
        {...(m?.realMarginSeries ? { spark: m.realMarginSeries } : {})}
      />
    </PanelShell>
  );
}
