import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { assertStoreAccess } from '../auth/store-access.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { requireTenant } from '../prisma/tenant-context.js';
import { dayRange } from '../sales/sales.domain.js';
import { buildZReport, type ZReport, type ZReportSale } from './z-report.domain.js';

/**
 * Cierre Z (arqueo fiscal diario por tienda, #124). Carga las ventas del día de
 * una tienda del tenant y delega el cálculo en el dominio puro. RLS aísla por
 * tenant; `assertStoreAccess` restringe a un CLERK a sus tiendas (SEC-01).
 *
 * El "día" se interpreta en UTC vía `dayRange` (misma deuda conocida del MVP que
 * el filtro `date` del historial de ventas): al internacionalizar habrá que
 * normalizar a Europe/Madrid en todo el sistema de forma coherente.
 */
@Injectable()
export class ZReportService {
  constructor(private readonly prisma: PrismaService) {}

  async getZReport(storeId: string, date: string, userId: string, role: string): Promise<ZReport> {
    const tenant = requireTenant();
    // Aislamiento por tienda (SEC-01): un CLERK solo consulta el Z de sus tiendas.
    await assertStoreAccess(this.prisma, { userId, role, storeId });

    // Defensa en profundidad: además de RLS, filtra por organizationId explícito.
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, organizationId: tenant.organizationId },
      select: { id: true, name: true, code: true },
    });
    if (!store) {
      throw new NotFoundException(`Tienda ${storeId} no encontrada`);
    }

    // El regex del DTO valida la FORMA (YYYY-MM-DD) pero no el valor: una fecha
    // imposible (p.ej. 2026-13-45) produce un Date inválido. Lo rechazamos como
    // 400 en vez de dejar que llegue un NaN a la query (que sería un 500).
    const { gte, lt } = dayRange(date);
    if (Number.isNaN(gte.getTime())) {
      throw new BadRequestException('date no es una fecha válida');
    }

    const sales = await this.prisma.sale.findMany({
      where: { organizationId: tenant.organizationId, storeId, createdAt: { gte, lt } },
      select: {
        ticketNumber: true,
        status: true,
        paymentMethod: true,
        subtotal: true,
        total: true,
        discountTotal: true,
        lines: { select: { taxRate: true, lineTotal: true } },
      },
    });

    const mapped: ZReportSale[] = sales.map((s) => ({
      ticketNumber: s.ticketNumber,
      status: s.status,
      paymentMethod: s.paymentMethod,
      subtotal: Number(s.subtotal),
      total: Number(s.total),
      discountTotal: Number(s.discountTotal),
      lines: s.lines.map((l) => ({ taxRate: Number(l.taxRate), lineTotal: Number(l.lineTotal) })),
    }));

    return buildZReport(store, date, mapped);
  }
}
