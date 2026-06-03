import { Module } from '@nestjs/common';

import { TimeClockController } from './time-clock.controller.js';
import { TimeClockService } from './time-clock.service.js';

@Module({
  controllers: [TimeClockController],
  providers: [TimeClockService],
})
export class TimeClockModule {}
