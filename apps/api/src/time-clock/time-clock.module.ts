import { Module } from '@nestjs/common';

import { FeatureFlagsModule } from '../feature-flags/feature-flags.module.js';
import { TimeClockController } from './time-clock.controller.js';
import { TimeClockService } from './time-clock.service.js';

@Module({
  imports: [FeatureFlagsModule],
  controllers: [TimeClockController],
  providers: [TimeClockService],
})
export class TimeClockModule {}
