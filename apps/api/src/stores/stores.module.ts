import { Module } from '@nestjs/common';

import { StorePricesController } from './store-prices.controller.js';
import { StorePricesService } from './store-prices.service.js';
import { StoresController } from './stores.controller.js';
import { StoresService } from './stores.service.js';

@Module({
  controllers: [StoresController, StorePricesController],
  providers: [StoresService, StorePricesService],
  // Exportado para que MeModule lo reutilice en GET /me/stores sin duplicar lógica.
  exports: [StoresService],
})
export class StoresModule {}
