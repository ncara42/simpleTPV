import { ChartGrid, ComparisonBars, KpiRow, KpiTile, PanelShell, TrendLine } from '@simpletpv/ui';

import type {
  BreakdownData,
  MarginKpis,
  SalesByEmployeeItem,
  SalesByFamilyItem,
  SalesByHourItem,
  SalesByStoreItem,
  SalesKpis,
} from '../types';

type Series = { items: { label: string; value: number }[]; isError: boolean };

function isErr(v: unknown): boolean {
  return typeof v === 'object' && v !== null && 'error' in v;
}

/** Normaliza una rama (array de datos | {error} | ausente) a series para el gráfico. */
function toSeries<T>(v: unknown, map: (x: T) => { label: string; value: number }): Series {
  if (Array.isArray(v)) return { items: (v as T[]).map(map), isError: false };
  return { items: [], isError: isErr(v) };
}

function asObject<T>(v: unknown): T {
  return v != null && typeof v === 'object' && !('error' in v) ? (v as T) : ({} as T);
}

/** Panel "analízame las ventas": KPIs + desgloses por tienda/familia/empleado/hora. */
export function Breakdown({ data }: { data: BreakdownData }) {
  const kpis = asObject<SalesKpis>(data.kpis);
  const margin = asObject<MarginKpis>(data.margin);

  const byStore = toSeries<SalesByStoreItem>(data.byStore, (s) => ({
    label: s.storeName ?? '—',
    value: s.revenue ?? 0,
  }));
  const byFamily = toSeries<SalesByFamilyItem>(data.byFamily, (f) => ({
    label: f.familyName ?? '—',
    value: f.total ?? 0,
  }));
  const byEmployee = toSeries<SalesByEmployeeItem>(data.byEmployee, (e) => ({
    label: e.userName ?? '—',
    value: e.total ?? 0,
  }));
  const byHour = toSeries<SalesByHourItem>(data.byHour, (h) => ({
    label: `${h.hour ?? 0}h`,
    value: h.revenue ?? 0,
  }));

  return (
    <PanelShell title="Análisis de ventas">
      <KpiRow columns={4}>
        <KpiTile label="Facturación" value={kpis.revenue} format="eur" />
        <KpiTile label="Tickets" value={kpis.salesCount} format="integer" />
        <KpiTile label="Ticket medio" value={kpis.avgTicket} format="eur" />
        <KpiTile label="Margen" value={margin.marginPct} format="percentRatio" />
      </KpiRow>

      <ChartGrid columns={2}>
        <ComparisonBars
          title="Por tienda"
          items={byStore.items}
          isError={byStore.isError}
          format="eur"
        />
        <ComparisonBars
          title="Por familia"
          items={byFamily.items}
          isError={byFamily.isError}
          format="eur"
        />
        <ComparisonBars
          title="Por empleado"
          items={byEmployee.items}
          isError={byEmployee.isError}
          format="eur"
        />
        <TrendLine
          title="Por franja horaria"
          items={byHour.items}
          isError={byHour.isError}
          format="eur"
        />
      </ChartGrid>
    </PanelShell>
  );
}
