import { SectionHeader, type StockAlertItem, StockAlertList } from '@simpletpv/ui';

import { DeltaPill, ReportStatCard } from '../components/report-bits';
import type { OverviewData, StockAlert } from '../types';

function alertTone(severity?: string): 'ok' | 'warn' | 'danger' {
  if (severity === 'critical') return 'danger';
  if (severity === 'soft') return 'warn';
  return 'ok';
}

function alertLabel(alertType?: string): string {
  return alertType === 'OUT_OF_STOCK' ? 'Agotado' : 'Stock bajo';
}

/** Panel "¿cómo va mi empresa?": KPIs de hoy + alertas de stock + rotura del mes. */
export function Overview({ data }: { data: OverviewData }) {
  const { salesDay, kpis, stockoutKpis } = data;
  const alerts: StockAlert[] = Array.isArray(data.alerts) ? data.alerts : [];

  const alertItems: StockAlertItem[] = alerts.slice(0, 12).map((a) => {
    const item: StockAlertItem = {
      name: a.productName ?? '—',
      tone: alertTone(a.severity),
      status: alertLabel(a.alertType),
    };
    if (a.storeName) item.detail = a.storeName;
    return item;
  });

  return (
    <div className="mcp-report">
      <section className="mcp-section">
        <SectionHeader title="Resumen de hoy" />
        <div className="mcp-cards mcp-cards--4">
          <ReportStatCard
            label="Ventas hoy"
            value={salesDay?.today?.total ?? null}
            format="eur"
            caption="vs ayer"
            pill={salesDay?.deltaPct != null ? <DeltaPill delta={salesDay.deltaPct} /> : undefined}
          />
          <ReportStatCard
            label="Tickets hoy"
            value={salesDay?.today?.count ?? null}
            format="integer"
          />
          <ReportStatCard label="Ticket medio" value={kpis?.avgTicket ?? null} format="eur" />
          <ReportStatCard
            label="Roturas abiertas"
            value={stockoutKpis?.open ?? null}
            format="integer"
          />
        </div>
      </section>

      <section className="mcp-section">
        <SectionHeader title={`Alertas de stock (${alerts.length})`} />
        <div className="mcp-card mcp-card--chart">
          {alertItems.length === 0 ? (
            <p className="mcp-state">Sin alertas activas.</p>
          ) : (
            <StockAlertList items={alertItems} />
          )}
        </div>
      </section>

      <section className="mcp-section">
        <SectionHeader title="Rotura de stock (mes)" />
        <div className="mcp-cards mcp-cards--3">
          <ReportStatCard label="Eventos" value={stockoutKpis?.events ?? null} format="integer" />
          <ReportStatCard
            label="Sin resolver"
            value={stockoutKpis?.open ?? null}
            format="integer"
          />
          <ReportStatCard
            label="Venta perdida"
            value={stockoutKpis?.estimatedLostSales ?? null}
            format="eur"
          />
        </div>
      </section>
    </div>
  );
}
