import { Module } from '@nestjs/common';

import { StockModule } from '../stock/stock.module.js';
import { VerifactuModule } from '../verifactu/verifactu.module.js';
import { ReturnsController } from './returns.controller.js';
import { ReturnsService } from './returns.service.js';

@Module({
  imports: [StockModule, VerifactuModule],
  controllers: [ReturnsController],
  providers: [ReturnsService],
})
export class ReturnsModule {}
