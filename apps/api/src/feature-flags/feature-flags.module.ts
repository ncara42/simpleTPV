import { Module } from '@nestjs/common';

import { FeatureFlagsController } from './feature-flags.controller.js';
import { FeatureFlagService } from './feature-flags.service.js';

// Feature flags (#127 B). Exporta FeatureFlagService para que los módulos que gatean
// un módulo (returns, time-clock, sales export, b2b) y MeModule (/me/features) lo
// importen. El controller expone la gestión (ADMIN/MANAGER). PrismaModule es @Global.
@Module({
  controllers: [FeatureFlagsController],
  providers: [FeatureFlagService],
  exports: [FeatureFlagService],
})
export class FeatureFlagsModule {}
