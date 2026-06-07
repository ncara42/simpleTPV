import { Module } from '@nestjs/common';

import { ZReportController } from './z-report.controller.js';
import { ZReportService } from './z-report.service.js';

@Module({
  controllers: [ZReportController],
  providers: [ZReportService],
})
export class ZReportModule {}
