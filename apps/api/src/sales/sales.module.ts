import { Module } from '@nestjs/common';

import { StockModule } from '../stock/stock.module.js';
import { SalesController } from './sales.controller.js';
import { SalesService } from './sales.service.js';

@Module({
  imports: [StockModule],
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule {}
