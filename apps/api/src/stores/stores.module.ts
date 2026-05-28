import { Module } from '@nestjs/common';

import { StoresController } from './stores.controller.js';
import { StoresService } from './stores.service.js';

@Module({
  controllers: [StoresController],
  providers: [StoresService],
  // Exportado para que MeModule lo reutilice en GET /me/stores sin duplicar lógica.
  exports: [StoresService],
})
export class StoresModule {}
