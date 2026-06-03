import { Body, Controller, Get, Post, Query } from '@nestjs/common';

import { Roles } from '../auth/roles.decorator.js';
import { CreateDeviceDto, PairDeviceDto } from './devices.dto.js';
import { DevicesService } from './devices.service.js';

@Controller('devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get('current')
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  current(@Query('pairingToken') pairingToken?: string) {
    return this.devices.status(pairingToken);
  }

  @Post()
  @Roles('ADMIN', 'MANAGER')
  create(@Body() body: CreateDeviceDto) {
    return this.devices.create(body);
  }

  @Post('pair')
  @Roles('ADMIN', 'MANAGER')
  pair(@Body() body: PairDeviceDto) {
    return this.devices.pair(body.pairingToken);
  }
}
