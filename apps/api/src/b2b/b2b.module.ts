import { Module } from '@nestjs/common';

import { CustomersController } from './customers.controller.js';
import { CustomersService } from './customers.service.js';
import { PriceListsController } from './price-lists.controller.js';
import { PriceListsService } from './price-lists.service.js';
import { WholesaleOrdersController } from './wholesale-orders.controller.js';
import { WholesaleOrdersService } from './wholesale-orders.service.js';

// B2B mayorista saliente (IT-17): clientes, tarifas y pedidos mayoristas.
@Module({
  controllers: [CustomersController, PriceListsController, WholesaleOrdersController],
  providers: [CustomersService, PriceListsService, WholesaleOrdersService],
})
export class B2bModule {}
