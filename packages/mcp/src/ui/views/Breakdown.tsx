import { ChartLegend, ComparisonBars, formatValue, SectionHeader, TrendArea } from '@simpletpv/ui';

import { CumulativeChart } from '../components/CumulativeChart';
import { DeltaPill, ReportStatCard } from '../components/report-bits';
import type {
  BreakdownData,
  BreakdownReport,
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

/** Variación porcentual de `a` respecto a `b` (null si `b` es 0 → la UI muestra "—"). */
function pctDelta(a: number, b: number): number | null {
  return b === 0 ? null : ((a - b) / b) * 100;
}

const eur = (n: number) => formatValue(n, 'eur');
const num = (n: number) => formatValue(n, 'decimal');

/** Sección "Resumen del periodo": comparativa EN BRUTO mes en curso vs mes anterior. */
function SummarySection({ r }: { r: BreakdownReport }) {
  const marginPts = (r.current.marginPct - r.previous.marginPct) * 100;
  const stableMargin = Math.abs(marginPts) < 0.5;
  return (
    <section className="mcp-section">
      <SectionHeader
        title={`Resumen — ${r.current.label} vs ${r.previous.label}`}
        subtitle={`hasta hoy, día ${r.current.daysElapsed} de ${r.current.daysInMonth}`}
      />
      <div className="mcp-cards mcp-cards--3">
        <ReportStatCard
          label="Facturación"
          value={r.current.revenue}
          format="eur"
          caption={`vs ${eur(r.previous.revenue)} en ${r.previous.label.toLowerCase()}`}
          pill={
            <DeltaPill delta={pctDelta(r.current.revenue, r.previous.revenue)} suffix="en bruto" />
          }
        />
        <ReportStatCard
          label="Tickets"
          value={r.current.salesCount}
          format="integer"
          caption={`vs ${num(r.previous.salesCount)} en ${r.previous.label.toLowerCase()}`}
          pill={
            <DeltaPill
              delta={pctDelta(r.current.salesCount, r.previous.salesCount)}
              suffix="en bruto"
            />
          }
        />
        <ReportStatCard
          label="Margen"
          value={r.current.marginPct}
          format="percentRatio"
          caption={`vs ${formatValue(r.previous.marginPct, 'percentRatio')} en ${r.previous.label.toLowerCase()}`}
          pill={<DeltaPill delta={stableMargin ? 0 : marginPts} unit="pts" flatLabel="estable" />}
        />
      </div>
    </section>
  );
}

/** Sección "Media diaria (comparable)": medias por día + proyección a fin de mes. */
function DailyAverageSection({ r }: { r: BreakdownReport }) {
  const rev = r.dailyAvg.revenue;
  const tk = r.dailyAvg.tickets;
  return (
    <section className="mcp-section">
      <SectionHeader title="Media diaria (comparable)" />
      <div className="mcp-cards mcp-cards--3">
        <ReportStatCard
          label={`€ / día ${r.current.label.toLowerCase()}`}
          value={rev.current}
          format="eur"
          caption={`vs ${eur(rev.previous)}/día en ${r.previous.label.toLowerCase()}`}
          pill={<DeltaPill delta={pctDelta(rev.current, rev.previous)} />}
        />
        <ReportStatCard
          label={`Tickets / día ${r.current.label.toLowerCase()}`}
          value={tk.current}
          format="decimal"
          caption={`vs ${num(tk.previous)}/día en ${r.previous.label.toLowerCase()}`}
          pill={<DeltaPill delta={pctDelta(tk.current, tk.previous)} />}
        />
        <ReportStatCard
          label={`Proyección ${r.current.label.toLowerCase()}`}
          value={rev.projection}
          format="eur"
          caption="si el ritmo se mantiene"
          pill={
            <DeltaPill
              delta={pctDelta(rev.projection, r.previous.revenue)}
              suffix={`vs ${r.previous.label.toLowerCase()}`}
            />
          }
        />
      </div>
    </section>
  );
}

/** Sección "Acumulado diario": gráfico de dos series (mes en curso vs anterior). */
function CumulativeSection({ r }: { r: BreakdownReport }) {
  return (
    <section className="mcp-section">
      <SectionHeader title="Facturación diaria acumulada" />
      <div className="mcp-card mcp-card--chart">
        <ChartLegend
          items={[
            { label: r.current.label, colorVar: '--ui-success' },
            { label: r.previous.label, colorVar: '--ui-chart-accent' },
          ]}
        />
        <CumulativeChart current={r.cumulative.current} previous={r.cumulative.previous} />
        <p className="mcp-foot">
          {`${r.current.label} con ${r.current.daysElapsed} días transcurridos. `}
          {`${r.previous.label} con ${r.previous.daysInMonth} días completos. `}
          La comparativa justa es por media diaria.
        </p>
      </div>
    </section>
  );
}

/** Panel "analízame las ventas": informe mensual (si procede) + desglose dimensional. */
export function Breakdown({ data }: { data: BreakdownData }) {
  const kpis = asObject<SalesKpis>(data.kpis);
  const margin = asObject<MarginKpis>(data.margin);
  const report = data.report;

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
    <div className="mcp-report">
      {report ? (
        <>
          <SummarySection r={report} />
          <DailyAverageSection r={report} />
          <CumulativeSection r={report} />
        </>
      ) : (
        // Sin informe mensual (periodo no-mes): KPIs sueltos del periodo.
        <section className="mcp-section">
          <SectionHeader title="Análisis de ventas" />
          <div className="mcp-cards mcp-cards--4">
            <ReportStatCard label="Facturación" value={kpis.revenue} format="eur" />
            <ReportStatCard label="Tickets" value={kpis.salesCount} format="integer" />
            <ReportStatCard label="Ticket medio" value={kpis.avgTicket} format="eur" />
            <ReportStatCard label="Margen" value={margin.marginPct} format="percentRatio" />
          </div>
        </section>
      )}

      <section className="mcp-section">
        <SectionHeader title="Desglose" />
        <div className="mcp-charts">
          <div className="mcp-card mcp-card--chart">
            <ComparisonBars
              title="Por tienda"
              items={byStore.items}
              isError={byStore.isError}
              format="eur"
            />
          </div>
          <div className="mcp-card mcp-card--chart">
            <ComparisonBars
              title="Por familia"
              items={byFamily.items}
              isError={byFamily.isError}
              format="eur"
            />
          </div>
          <div className="mcp-card mcp-card--chart">
            <ComparisonBars
              title="Por empleado"
              items={byEmployee.items}
              isError={byEmployee.isError}
              format="eur"
            />
          </div>
          <div className="mcp-card mcp-card--chart">
            <TrendArea
              title="Por franja horaria"
              items={byHour.items}
              isError={byHour.isError}
              format="eur"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
