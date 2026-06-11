import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';

import { Roles } from '../auth/roles.decorator.js';
import { CreateDeviceDto, ListDevicesQueryDto, PairDeviceDto } from './devices.dto.js';
import { DevicesService } from './devices.service.js';

@Controller('devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get('current')
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  current(@Query('pairingToken') pairingToken?: string) {
    return this.devices.status(pairingToken);
  }

  @Get()
  @Roles('ADMIN', 'MANAGER')
  findAll(@Query() query: ListDevicesQueryDto) {
    return this.devices.findAll(query.storeId);
  }

  @Post()
  @Roles('ADMIN', 'MANAGER')
  create(@Body() body: CreateDeviceDto) {
    return this.devices.create(body);
  }

  // El emparejamiento lo hace quien está delante del TPV (normalmente un CLERK)
  // tecleando el token que le da el encargado: el token ES la autorización.
  @Post('pair')
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  pair(@Body() body: PairDeviceDto) {
    return this.devices.pair(body.pairingToken);
  }

  @Delete(':id')
  @Roles('ADMIN', 'MANAGER')
  @HttpCode(204)
  revoke(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.devices.revoke(id);
  }
}
