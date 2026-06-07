import { Controller, Get, Query, Req } from '@nestjs/common';

import type { JwtPayload } from '../auth/jwt-payload.js';
import { Roles } from '../auth/roles.decorator.js';
import { ZReportQueryDto } from './z-report.dto.js';
import { ZReportService } from './z-report.service.js';

// Cierre Z (arqueo fiscal diario por tienda, #124). Informe fiscal de gestión:
// restringido a central (ADMIN/MANAGER), igual que el dashboard de KPIs. Un CLERK
// recibe 403 por el RolesGuard global (minimización de datos: el Z agrega totales
// del día, descuentos y desglose por método de pago, más de lo que un CLERK opera
// en el TPV). El servicio mantiene assertStoreAccess como defensa en profundidad.
@Controller('z-report')
export class ZReportController {
  constructor(private readonly zReport: ZReportService) {}

  @Get()
  @Roles('ADMIN', 'MANAGER')
  getZReport(@Query() query: ZReportQueryDto, @Req() req: { user: JwtPayload }) {
    return this.zReport.getZReport(query.storeId, query.date, req.user.sub, req.user.role);
  }
}
