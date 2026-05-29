import { Module } from '@nestjs/common';

import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

// PrismaModule es @Global, así que PRISMA_BASE está disponible sin importarlo.
@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
