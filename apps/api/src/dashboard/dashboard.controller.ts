import { Controller, Get, Query } from '@nestjs/common';

import { Roles } from '../auth/roles.decorator.js';
import {
  DashboardPeriodQueryDto,
  ProductRankingsQueryDto,
  SalesTodayQueryDto,
} from './dashboard.dto.js';
import { DashboardService } from './dashboard.service.js';

// KPIs operativos del backoffice (Semana 5). Solo central: ADMIN/MANAGER. Un
// CLERK recibe 403 por el RolesGuard global. Todo es solo lectura.
@Controller('dashboard')
@Roles('ADMIN', 'MANAGER')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('sales-today')
  salesToday(@Query() query: SalesTodayQueryDto) {
    return this.dashboard.salesToday(query.storeId);
  }

  @Get('sales-by-family')
  salesByFamily(@Query() query: DashboardPeriodQueryDto) {
    return this.dashboard.salesByFamily(query);
  }

  @Get('sales-by-hour')
  salesByHour(@Query() query: DashboardPeriodQueryDto) {
    return this.dashboard.salesByHour(query);
  }

  @Get('discount-by-employee')
  discountByEmployee(@Query() query: DashboardPeriodQueryDto) {
    return this.dashboard.discountByEmployee(query);
  }

  @Get('sales-kpis')
  salesKpis(@Query() query: DashboardPeriodQueryDto) {
    return this.dashboard.salesKpis(query);
  }

  @Get('margin-kpis')
  marginKpis(@Query() query: DashboardPeriodQueryDto) {
    return this.dashboard.marginKpis(query);
  }

  @Get('stockout-kpis')
  stockoutKpis(@Query() query: DashboardPeriodQueryDto) {
    return this.dashboard.stockoutKpis(query);
  }

  @Get('product-rankings')
  productRankings(@Query() query: ProductRankingsQueryDto) {
    return this.dashboard.productRankings(query);
  }

  @Get('product-rotation')
  productRotation(@Query() query: DashboardPeriodQueryDto) {
    return this.dashboard.productRotation(query);
  }

  @Get('archetype-rotation')
  archetypeRotation(@Query() query: DashboardPeriodQueryDto) {
    return this.dashboard.archetypeRotation(query);
  }
}
