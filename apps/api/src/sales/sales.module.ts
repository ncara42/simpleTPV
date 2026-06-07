import { Module } from '@nestjs/common';

import { StockModule } from '../stock/stock.module.js';
import { VerifactuModule } from '../verifactu/verifactu.module.js';
import { SalesController } from './sales.controller.js';
import { SalesService } from './sales.service.js';
import { SalesExportController } from './sales-export.controller.js';
import { SalesExportService } from './sales-export.service.js';

@Module({
  imports: [StockModule, VerifactuModule],
  controllers: [SalesController, SalesExportController],
  providers: [SalesService, SalesExportService],
})
export class SalesModule {}
