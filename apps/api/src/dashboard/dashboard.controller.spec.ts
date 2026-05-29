import { describe, expect, it, vi } from 'vitest';

import { DashboardController } from './dashboard.controller.js';
import type { DashboardService } from './dashboard.service.js';

// El controller es una fachada fina: delega cada ruta en el método homónimo del
// service y reenvía la query. Verificamos ese cableado con un service mockeado.
function makeController(): {
  controller: DashboardController;
  service: Record<string, ReturnType<typeof vi.fn>>;
} {
  const service = {
    salesToday: vi.fn().mockResolvedValue('salesToday'),
    salesByFamily: vi.fn().mockResolvedValue('salesByFamily'),
    salesKpis: vi.fn().mockResolvedValue('salesKpis'),
    marginKpis: vi.fn().mockResolvedValue('marginKpis'),
    stockoutKpis: vi.fn().mockResolvedValue('stockoutKpis'),
    productRankings: vi.fn().mockResolvedValue('productRankings'),
  };
  return {
    controller: new DashboardController(service as unknown as DashboardService),
    service,
  };
}

describe('DashboardController', () => {
  it('sales-today delega pasando solo el storeId', async () => {
    const { controller, service } = makeController();
    await expect(controller.salesToday({ storeId: 's1' })).resolves.toBe('salesToday');
    expect(service.salesToday).toHaveBeenCalledWith('s1');
  });

  it('sales-by-family reenvía la query de periodo', async () => {
    const { controller, service } = makeController();
    const q = { period: 'week' as const };
    await expect(controller.salesByFamily(q)).resolves.toBe('salesByFamily');
    expect(service.salesByFamily).toHaveBeenCalledWith(q);
  });

  it('sales-kpis, margin-kpis y stockout-kpis delegan con la misma query', async () => {
    const { controller, service } = makeController();
    const q = { period: 'month' as const, storeId: 's2' };
    await controller.salesKpis(q);
    await controller.marginKpis(q);
    await controller.stockoutKpis(q);
    expect(service.salesKpis).toHaveBeenCalledWith(q);
    expect(service.marginKpis).toHaveBeenCalledWith(q);
    expect(service.stockoutKpis).toHaveBeenCalledWith(q);
  });

  it('product-rankings reenvía la query con límite', async () => {
    const { controller, service } = makeController();
    const q = { period: 'today' as const, limit: 5 };
    await expect(controller.productRankings(q)).resolves.toBe('productRankings');
    expect(service.productRankings).toHaveBeenCalledWith(q);
  });
});
