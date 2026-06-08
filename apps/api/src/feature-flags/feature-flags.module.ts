import { Module } from '@nestjs/common';

import { FeatureFlagService } from './feature-flags.service.js';

// Resolución de feature flags (#127 B). Exporta FeatureFlagService para que los
// módulos que gatean un módulo (returns, time-clock, sales export, b2b) y MeModule
// (/me/features) lo importen. PrismaModule es @Global → no hay que reimportarlo.
@Module({
  providers: [FeatureFlagService],
  exports: [FeatureFlagService],
})
export class FeatureFlagsModule {}
