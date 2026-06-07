import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module.js';
import { StoresModule } from '../stores/stores.module.js';
import { MeController } from './me.controller.js';
import { PreferencesService } from './preferences.service.js';

// Recursos del usuario autenticado (cualquier rol). Reutiliza StoresService
// vía StoresModule, que lo exporta.
@Module({
  imports: [StoresModule, PrismaModule],
  controllers: [MeController],
  providers: [PreferencesService],
})
export class MeModule {}
