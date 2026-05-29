import { Module } from '@nestjs/common';

import { StockModule } from '../stock/stock.module.js';
import { VerifactuModule } from '../verifactu/verifactu.module.js';
import { SalesController } from './sales.controller.js';
import { SalesService } from './sales.service.js';

@Module({
  imports: [StockModule, VerifactuModule],
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule {}
