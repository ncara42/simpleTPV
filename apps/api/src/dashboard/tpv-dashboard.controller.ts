import { Controller, ForbiddenException, Get, Query, Req } from '@nestjs/common';

import type { JwtPayload } from '../auth/jwt-payload.js';
import { Roles } from '../auth/roles.decorator.js';
import { assertStoreAccess, isOrgWideRole } from '../auth/store-access.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SalesTodayQueryDto } from './dashboard.dto.js';
import { DashboardService } from './dashboard.service.js';

// Recuento diario del TPV (STAT-01 para cajeros): expone SOLO la comparativa de
// facturación hoy vs ayer y la deja accesible también al CLERK, que en el panel
// de backoffice recibe 403. A diferencia del Z-report (ADMIN/MANAGER, minimización
// de datos), aquí el cajero SÍ ve su recuento, pero acotado a SU tienda: nunca el
// de otra tienda ni el agregado de la organización.
@Controller('tpv/dashboard')
@Roles('ADMIN', 'MANAGER', 'CLERK')
export class TpvDashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('sales-today')
  async salesToday(@Req() req: { user: JwtPayload }, @Query() query: SalesTodayQueryDto) {
    const { sub: userId, role } = req.user;
    if (query.storeId) {
      // Cierra el IDOR horizontal entre tiendas (SEC-01): un CLERK solo puede ver el
      // recuento de una tienda a la que está asignado; ADMIN/MANAGER quedan exentos.
      await assertStoreAccess(this.prisma, { userId, role, storeId: query.storeId });
    } else if (!isOrgWideRole(role)) {
      // Sin storeId, el servicio agregaría TODA la organización: un CLERK no puede
      // ver ese agregado, así que debe acotar a su tienda.
      throw new ForbiddenException('Indica la tienda para el recuento diario.');
    }
    // El TPV solo necesita la comparativa por día; reusa el mismo servicio que el
    // backoffice (misma forma de respuesta SalesTodayResponse).
    return this.dashboard.salesToday(query.storeId, query.compare ?? 'day');
  }
}
