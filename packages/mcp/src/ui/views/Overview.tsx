import { InsightCard, KpiRow, KpiTile, PanelShell, StatusPill } from '@simpletpv/ui';

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

  return (
    <PanelShell title="Resumen del negocio">
      <KpiRow columns={4}>
        <KpiTile
          label="Ventas hoy"
          value={salesDay?.today?.total}
          format="eur"
          delta={salesDay?.deltaPct ?? null}
          deltaFormat="percent"
        />
        <KpiTile label="Tickets hoy" value={salesDay?.today?.count} format="integer" />
        <KpiTile label="Ticket medio" value={kpis?.avgTicket} format="eur" />
        <KpiTile label="Roturas abiertas" value={stockoutKpis?.open} format="integer" />
      </KpiRow>

      <InsightCard title={`Alertas de stock (${alerts.length})`}>
        {alerts.length === 0 ? (
          <p className="mcp-state">Sin alertas activas.</p>
        ) : (
          alerts.slice(0, 12).map((a, i) => (
            <div className="mcp-alert-row" key={a.id ?? i}>
              <span>
                <span className="mcp-alert-row__name">{a.productName ?? '—'}</span>{' '}
                <span className="mcp-alert-row__store">· {a.storeName ?? ''}</span>
              </span>
              <StatusPill label={alertLabel(a.alertType)} tone={alertTone(a.severity)} />
            </div>
          ))
        )}
      </InsightCard>

      <InsightCard title="Rotura de stock (mes)">
        <KpiRow columns={3}>
          <KpiTile label="Eventos" value={stockoutKpis?.events} format="integer" />
          <KpiTile label="Sin resolver" value={stockoutKpis?.open} format="integer" />
          <KpiTile label="Venta perdida" value={stockoutKpis?.estimatedLostSales} format="eur" />
        </KpiRow>
      </InsightCard>
    </PanelShell>
  );
}
