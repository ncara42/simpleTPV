import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const STORES = [
  {
    id: 's1',
    name: 'Tienda Sur',
    address: null,
    code: 'SUR',
    active: true,
    opsVerified: true,
    opsIncident: null,
    opsUpdatedAt: null,
    isCentral: false,
  },
  {
    id: 's2',
    name: 'Tienda Online',
    address: null,
    code: 'ON',
    active: true,
    opsVerified: true,
    opsIncident: null,
    opsUpdatedAt: null,
    isCentral: true,
  },
  {
    id: 's3',
    name: 'Tienda Cerrada',
    address: null,
    code: 'OLD',
    active: false, // inactiva → fuera del recuento
    opsVerified: false,
    opsIncident: null,
    opsUpdatedAt: null,
    isCentral: false,
  },
];
const ORDERS = [
  {
    id: 'po1',
    supplierId: 'sup1',
    storeId: 's1',
    status: 'CONFIRMED',
    notes: null,
    createdAt: '2026-06-29T10:00:00Z',
    confirmedAt: '2026-06-29T11:00:00Z',
    receivedAt: null,
    lines: [],
  },
  {
    id: 'po2',
    supplierId: 'sup1',
    storeId: 's1',
    status: 'RECEIVED',
    notes: null,
    createdAt: '2026-06-20T10:00:00Z',
    confirmedAt: null,
    receivedAt: null,
    lines: [],
  },
];
const CHAIN_OK = { total: 120, ok: true, brokenAt: null, detail: null };

vi.mock('../../lib/admin.js', () => ({ listStores: vi.fn(() => Promise.resolve(STORES)) }));
vi.mock('../../lib/cash.js', () => ({
  listPendingCashMovements: vi.fn(() => Promise.resolve([])),
}));
vi.mock('../../lib/purchases.js', () => ({
  listPurchaseOrders: vi.fn(() => Promise.resolve(ORDERS)),
}));
vi.mock('../../lib/verifactu.js', () => ({
  verifyVerifactuChain: vi.fn(() => Promise.resolve(CHAIN_OK)),
}));

import { listPendingCashMovements } from '../../lib/cash.js';
import { ITEM_SPECS } from '../../lib/dashboard-layout.js';
import { verifyVerifactuChain } from '../../lib/verifactu.js';
import { GALLERY_ENTRIES } from '../gallery-catalog.js';
import { WIDGET_LABELS } from '../registry.js';
import { ComplianceChecks, OperationalStatus, StepProgress } from './estado.js';
import { WIDGET_PANELS } from './index.js';

const ESTADO_IDS = ['estado-pasos', 'estado-operativo', 'estado-cumplimiento'];

function renderWidget(node: ReactNode): { container: HTMLElement } {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe('Widgets de panel · Sección 10 (Estado y progreso)', () => {
  it('los 3 widgets están cableados en render, catálogo y galería bajo «estado»', () => {
    const cat = GALLERY_ENTRIES.filter((e) => e.category === 'estado').map((e) => e.id);
    for (const id of ESTADO_IDS) {
      expect(WIDGET_PANELS[id], `WIDGET_PANELS falta ${id}`).toBeDefined();
      expect(ITEM_SPECS[id], `ITEM_SPECS falta ${id}`).toBeDefined();
      expect(WIDGET_LABELS[id], `WIDGET_LABELS falta ${id}`).toBeDefined();
      expect(cat, `galería falta ${id}`).toContain(id);
    }
  });

  it('pasos: el pedido CONFIRMED marca «Aprob.» como actual y «Pedido» como hecho', async () => {
    const { container } = renderWidget(<StepProgress period="month" store={undefined} />);
    expect(await screen.findByText('Pedido')).toBeInTheDocument();
    expect(screen.getByText('Recib.')).toBeInTheDocument();
    // Las etiquetas se pintan ya sin datos; esperamos a que el pedido cargue y fije el paso actual.
    await waitFor(() => expect(container.querySelectorAll('.st-dot--done')).toHaveLength(1)); // Pedido
    expect(container.querySelectorAll('.st-dot--current')).toHaveLength(1); // Aprob.
  });

  it('operativo: cuenta solo tiendas activas verificadas y sin incidencia', async () => {
    const { container } = renderWidget(<OperationalStatus period="today" store={undefined} />);
    expect(await screen.findByText('Operativo')).toBeInTheDocument();
    expect(screen.getByText('2/2 tiendas online')).toBeInTheDocument(); // s3 inactiva excluida
    expect(container.querySelector('.st-op-badge.st-tone-success')).not.toBeNull();
  });

  it('cumplimiento: cadena íntegra + sin pendientes → dos checks en verde', async () => {
    const { container } = renderWidget(<ComplianceChecks period="today" store={undefined} />);
    // «al día»/«cuadradas» son también el texto del estado de carga; esperamos al verde real.
    await waitFor(() =>
      expect(container.querySelectorAll('.st-check-badge.st-tone-success')).toHaveLength(2),
    );
    expect(screen.getByText('VeriFactu al día')).toBeInTheDocument();
    expect(screen.getByText('Cajas cuadradas')).toBeInTheDocument();
  });

  it('cumplimiento: cadena rota + cajas pendientes → avisos en ámbar', async () => {
    vi.mocked(verifyVerifactuChain).mockResolvedValueOnce({
      total: 5,
      ok: false,
      brokenAt: 'rec_3',
      detail: 'hash mismatch',
    });
    vi.mocked(listPendingCashMovements).mockResolvedValueOnce([{ id: 'm1' } as never]);
    const { container } = renderWidget(<ComplianceChecks period="today" store={undefined} />);
    expect(await screen.findByText('VeriFactu con incidencias')).toBeInTheDocument();
    expect(screen.getByText('1 movimiento(s) por aprobar')).toBeInTheDocument();
    expect(container.querySelectorAll('.st-check-badge.st-tone-warning')).toHaveLength(2);
  });
});
