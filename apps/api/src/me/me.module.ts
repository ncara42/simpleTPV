import { Module } from '@nestjs/common';

import { StoresModule } from '../stores/stores.module.js';
import { MeController } from './me.controller.js';

// Recursos del usuario autenticado (cualquier rol). Reutiliza StoresService
// vía StoresModule, que lo exporta.
@Module({
  imports: [StoresModule],
  controllers: [MeController],
})
export class MeModule {}
