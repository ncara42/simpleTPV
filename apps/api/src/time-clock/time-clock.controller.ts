import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';

import type { JwtPayload } from '../auth/jwt-payload.js';
import { Roles } from '../auth/roles.decorator.js';
import { CreateTimeClockEntryDto } from './time-clock.dto.js';
import { TimeClockService } from './time-clock.service.js';

@Controller('time-clock')
export class TimeClockController {
  constructor(private readonly timeClock: TimeClockService) {}

  @Get('current')
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  current(@Query('storeId') storeId: string, @Req() req: { user: JwtPayload }) {
    return this.timeClock.current(storeId, req.user.sub);
  }

  @Post()
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  create(@Body() body: CreateTimeClockEntryDto, @Req() req: { user: JwtPayload }) {
    return this.timeClock.create(body, req.user.sub);
  }
}
