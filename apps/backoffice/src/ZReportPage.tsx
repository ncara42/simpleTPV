import { Select } from '@simpletpv/ui';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { useState } from 'react';

import { listStores } from './lib/admin.js';
import { fmtEur } from './lib/format.js';
import { usePageHeader } from './lib/pageHeader.js';
import { getZReport, type ZReport } from './lib/z-report.js';

const PAYMENT_LABEL: Record<string, string> = { CASH: 'Efectivo', CARD: 'Tarjeta' };

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ZReportPage() {
  usePageHeader('Cierre Z', 'Arqueo fiscal diario por tienda');
  const [storeId, setStoreId] = useState('');
  const [date, setDate] = useState(today());

  const { data: stores = [] } = useQuery({ queryKey: ['stores'], queryFn: listStores });
  // Selecciona la primera tienda en cuanto se cargan, si no hay ninguna elegida.
  const effectiveStoreId = storeId || stores[0]?.id || '';

  const report = useQuery({
    queryKey: ['z-report', effectiveStoreId, date],
    queryFn: () => getZReport(effectiveStoreId, date),
    enabled: effectiveStoreId !== '' && date !== '',
  });

  return (
    <div className="zreport-page" data-testid="zreport-page">
      <div className="zreport-toolbar">
        <Select
          className="zreport-store"
          value={effectiveStoreId}
          onChange={setStoreId}
          ariaLabel="Tienda"
          data-testid="zreport-store"
          options={stores.map((s) => ({ value: s.id, label: s.name }))}
        />
        <input
          type="date"
          className="zreport-date"
          value={date}
          max={today()}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Día"
          data-testid="zreport-date"
        />
        <button
          className="zreport-print-btn"
          onClick={() => window.print()}
          disabled={!report.data}
          data-testid="zreport-print"
        >
          <Printer size={16} />
          Imprimir
        </button>
      </div>

      {report.isLoading ? (
        <p className="zreport-empty">Cargando cierre Z…</p>
      ) : report.data ? (
        <ZReportDocument report={report.data} />
      ) : (
        <p className="zreport-empty">Selecciona una tienda y un día.</p>
      )}
    </div>
  );
}

function ZReportDocument({ report }: { report: ZReport }) {
  return (
    <article className="zreport" data-testid="zreport-doc">
      <header className="zreport-head">
        <div>
          <p className="zreport-eyebrow">Cierre Z · Arqueo fiscal diario</p>
          <h2 className="zreport-store-name">
            {report.store.name} <span className="zreport-code">({report.store.code})</span>
          </h2>
        </div>
        <div className="zreport-date-label" data-testid="zreport-date-label">
          {report.date}
        </div>
      </header>

      <section className="zreport-meta">
        <MetaCell label="Tickets" value={String(report.ticketCount)} testId="zreport-count" />
        <MetaCell label="Anuladas" value={String(report.voidedCount)} />
        <MetaCell label="Primer nº" value={report.firstTicketNumber ?? '—'} />
        <MetaCell label="Último nº" value={report.lastTicketNumber ?? '—'} />
      </section>

      <section className="zreport-section">
        <h3>Desglose de IVA</h3>
        <table className="zreport-table" data-testid="zreport-tax">
          <thead>
            <tr>
              <th>Tipo</th>
              <th className="num">Base</th>
              <th className="num">Cuota</th>
            </tr>
          </thead>
          <tbody>
            {report.taxBreakdown.length === 0 ? (
              <tr>
                <td colSpan={3} className="zreport-muted">
                  Sin ventas
                </td>
              </tr>
            ) : (
              report.taxBreakdown.map((t) => (
                <tr key={t.taxRate}>
                  <td>IVA {t.taxRate}%</td>
                  <td className="num">{fmtEur(t.base)}</td>
                  <td className="num">{fmtEur(t.cuota)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="zreport-section">
        <h3>Desglose por método de pago</h3>
        <table className="zreport-table" data-testid="zreport-payments">
          <thead>
            <tr>
              <th>Método</th>
              <th className="num">Tickets</th>
              <th className="num">Importe</th>
            </tr>
          </thead>
          <tbody>
            {report.paymentBreakdown.length === 0 ? (
              <tr>
                <td colSpan={3} className="zreport-muted">
                  Sin ventas
                </td>
              </tr>
            ) : (
              report.paymentBreakdown.map((p) => (
                <tr key={p.paymentMethod}>
                  <td>{PAYMENT_LABEL[p.paymentMethod] ?? p.paymentMethod}</td>
                  <td className="num">{p.count}</td>
                  <td className="num">{fmtEur(p.total)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <footer className="zreport-totals">
        <div className="zreport-total-row">
          <span>Subtotal</span>
          <span className="num">{fmtEur(report.subtotal)}</span>
        </div>
        {report.discountTotal > 0 && (
          <div className="zreport-total-row">
            <span>Descuentos</span>
            <span className="num">−{fmtEur(report.discountTotal)}</span>
          </div>
        )}
        <div className="zreport-total-row grand">
          <span>Total del día</span>
          <span className="num" data-testid="zreport-total">
            {fmtEur(report.total)}
          </span>
        </div>
      </footer>
    </article>
  );
}

function MetaCell({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="zreport-meta-cell">
      <span className="zreport-meta-label">{label}</span>
      <span className="zreport-meta-value" {...(testId ? { 'data-testid': testId } : {})}>
        {value}
      </span>
    </div>
  );
}
