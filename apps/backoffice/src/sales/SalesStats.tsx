import type { SalesQueryInput } from '@simpletpv/auth';
import { Chart, type ChartBar } from '@simpletpv/ui';
import { useQuery } from '@tanstack/react-query';

import { fmtDayMonth, fmtDelta, fmtEur, fmtEurCompact } from '../lib/format.js';
import { getSalesStats, type SalesStats as SalesStatsData } from '../lib/sales.js';

interface SalesStatsProps {
  // Misma query que alimenta la tabla de Ventas (tienda/vendedor/familia/estado +
  // rango temporal). El bloque se revalida con los mismos filtros (key propia, sin
  // waterfall con la tabla).
  query: SalesQueryInput;
}

// Delta porcentual entre dos valores (current vs previous) en puntos porcentuales:
// 150 vs 100 → +50 (%). null cuando no hay base previa (>0) con la que comparar.
function deltaPct(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

// Tono semántico del delta para una métrica donde "más es mejor" (facturación,
// tickets, ticket medio): sube → verde, baja → rojo, igual/sin base → neutro.
function tone(delta: number | null): 'up' | 'down' | 'neutral' {
  if (delta === null || delta === 0) return 'neutral';
  return delta > 0 ? 'up' : 'down';
}

interface KpiSpec {
  testid: string;
  label: string;
  value: string;
  delta: number | null;
}

// Tarjeta KPI con su comparativa (delta % + flecha coloreada). Sin comparativa
// (previous null o base 0) se omite el delta — no se inventa una flecha.
function KpiCard({ testid, label, value, delta }: KpiSpec) {
  const t = tone(delta);
  const arrow = t === 'up' ? '▲' : t === 'down' ? '▼' : '';
  return (
    <div className="sales-stats-kpi" data-testid={testid}>
      <span className="sales-stats-kpi-label">{label}</span>
      <strong className="sales-stats-kpi-value">{value}</strong>
      {delta !== null && (
        <span
          className={`sales-stats-kpi-delta is-${t}`}
          data-testid={`${testid}-delta`}
          title="Frente al periodo anterior"
        >
          {arrow} {fmtDelta(delta)}
        </span>
      )}
    </div>
  );
}

function buildKpis(data: SalesStatsData): KpiSpec[] {
  const curTotal = Number(data.current.totalAmount);
  const curCount = data.current.count;
  const curAvg = curCount > 0 ? curTotal / curCount : 0;

  const prev = data.previous;
  const prevTotal = prev ? Number(prev.totalAmount) : 0;
  const prevCount = prev ? prev.count : 0;
  const prevAvg = prevCount > 0 ? prevTotal / prevCount : 0;

  // Sin periodo anterior (filtro sin rango) → sin delta en ninguna tarjeta.
  const dTotal = prev ? deltaPct(curTotal, prevTotal) : null;
  const dCount = prev ? deltaPct(curCount, prevCount) : null;
  const dAvg = prev ? deltaPct(curAvg, prevAvg) : null;

  return [
    {
      testid: 'sales-stats-kpi-total',
      label: 'Total facturado',
      value: fmtEur(curTotal),
      delta: dTotal,
    },
    {
      testid: 'sales-stats-kpi-count',
      label: 'Nº de tickets',
      value: String(curCount),
      delta: dCount,
    },
    {
      testid: 'sales-stats-kpi-avg',
      label: 'Ticket medio',
      value: fmtEur(curAvg),
      delta: dAvg,
    },
  ];
}

// Serie temporal → barras del <Chart> común: una columna por día con ventas,
// etiquetada con el día/mes y el importe del bucket.
function buildChartData(data: SalesStatsData): ChartBar[] {
  return data.series.map((p) => ({
    label: fmtDayMonth(p.bucket),
    value: Number(p.total),
    valueText: fmtEur(Number(p.total)),
    subValue: `${p.count} ${p.count === 1 ? 'ticket' : 'tickets'}`,
    subTone: 'neutral',
  }));
}

/**
 * Bloque de estadísticas embebido en la page Ventas (S-10): tarjetas KPI (total
 * facturado, nº de tickets, ticket medio) con comparativa frente al periodo anterior
 * + gráfica de la serie temporal diaria. Refleja exactamente los mismos filtros que la
 * tabla (recibe la misma `query`). Estados loading/empty con testids propios.
 */
export function SalesStats({ query }: SalesStatsProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['sales-stats', query],
    queryFn: () => getSalesStats(query),
  });

  if (isLoading) {
    return (
      <section className="sales-stats" data-testid="sales-stats" aria-busy="true">
        <span data-testid="sales-stats-loading" className="sales-stats-loading">
          Cargando estadísticas…
        </span>
      </section>
    );
  }

  // Sin datos o serie vacía: bloque visible y rotulado, con estado vacío.
  if (!data || data.series.length === 0) {
    return (
      <section className="sales-stats" data-testid="sales-stats">
        <span data-testid="sales-stats-empty" className="sales-stats-empty">
          Sin datos de ventas para los filtros seleccionados.
        </span>
      </section>
    );
  }

  const kpis = buildKpis(data);
  const chartData = buildChartData(data);

  return (
    <section className="sales-stats" data-testid="sales-stats" aria-label="Estadísticas de ventas">
      <div className="sales-stats-kpis">
        {kpis.map((k) => (
          <KpiCard key={k.testid} {...k} />
        ))}
      </div>
      <div className="sales-stats-chart" data-testid="sales-stats-chart">
        <Chart
          data={chartData}
          height={160}
          kind="line"
          formatValue={fmtEurCompact}
          showGrid={false}
          animated={false}
          ariaLabel="Ventas por día del periodo"
        />
      </div>
    </section>
  );
}
