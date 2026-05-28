import { Module } from '@nestjs/common';

import { StockService } from './stock.service.js';

@Module({
  providers: [StockService],
  exports: [StockService],
})
export class StockModule {}
