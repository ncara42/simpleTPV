import { Module } from '@nestjs/common';

import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';
import { TpvDashboardController } from './tpv-dashboard.controller.js';

// PrismaModule es @Global, así que PRISMA_BASE está disponible sin importarlo.
@Module({
  controllers: [DashboardController, TpvDashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
