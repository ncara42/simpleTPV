import { Module } from '@nestjs/common';

import { SupplierPricesController } from './supplier-prices.controller.js';
import { SupplierPricesService } from './supplier-prices.service.js';
import { SuppliersController } from './suppliers.controller.js';
import { SuppliersService } from './suppliers.service.js';

@Module({
  controllers: [SuppliersController, SupplierPricesController],
  providers: [SuppliersService, SupplierPricesService],
})
export class SuppliersModule {}
