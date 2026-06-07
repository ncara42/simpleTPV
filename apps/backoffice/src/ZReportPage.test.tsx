import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./lib/admin.js', () => ({
  listStores: vi.fn(() =>
    Promise.resolve([{ id: 's-centro', name: 'Centro', code: 'CENTRO', active: true }]),
  ),
}));

vi.mock('./lib/z-report.js', () => ({
  getZReport: vi.fn(() =>
    Promise.resolve({
      store: { id: 's-centro', name: 'Centro', code: 'CENTRO' },
      date: '2026-06-07',
      ticketCount: 42,
      voidedCount: 2,
      firstTicketNumber: 'TCENTRO-000101',
      lastTicketNumber: 'TCENTRO-000144',
      subtotal: 1893.5,
      discountTotal: 64.2,
      total: 1829.3,
      taxBreakdown: [
        { taxRate: 10, base: 480, cuota: 48 },
        { taxRate: 21, base: 1241.57, cuota: 261.73 },
      ],
      paymentBreakdown: [
        { paymentMethod: 'CARD', count: 27, total: 1187.4 },
        { paymentMethod: 'CASH', count: 15, total: 641.9 },
      ],
    }),
  ),
}));

import { ZReportPage } from './ZReportPage.js';

function renderPage(): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ZReportPage />
    </QueryClientProvider>,
  );
}

describe('ZReportPage', () => {
  it('renderiza la vista de cierre Z', () => {
    renderPage();
    expect(screen.getByTestId('zreport-page')).toBeInTheDocument();
  });

  it('muestra el informe con tickets, IVA, métodos de pago y total', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('zreport-doc')).toBeInTheDocument());

    expect(screen.getByTestId('zreport-count')).toHaveTextContent('42');
    expect(screen.getByTestId('zreport-tax')).toHaveTextContent('IVA 21%');
    expect(screen.getByTestId('zreport-tax')).toHaveTextContent('IVA 10%');
    expect(screen.getByTestId('zreport-payments')).toHaveTextContent('Efectivo');
    expect(screen.getByTestId('zreport-payments')).toHaveTextContent('Tarjeta');
    // Total formateado en es-ES (coma decimal).
    expect(screen.getByTestId('zreport-total')).toHaveTextContent('1829,30');
  });
});
