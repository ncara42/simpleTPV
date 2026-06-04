import { Module } from '@nestjs/common';

import { StockModule } from '../stock/stock.module.js';
import { TransfersService } from '../transfers/transfers.service.js';
import { StoreOrdersController } from './store-orders.controller.js';

@Module({
  imports: [StockModule],
  controllers: [StoreOrdersController],
  providers: [TransfersService],
})
export class StoreOrdersModule {}
