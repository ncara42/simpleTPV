import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';

import type { JwtPayload } from '../auth/jwt-payload.js';
import { Roles } from '../auth/roles.decorator.js';
import { TransfersService } from '../transfers/transfers.service.js';
import type { CreateStoreOrderDto, ReceiveStoreOrderDto } from './store-orders.dto.js';

@Controller('store-orders')
export class StoreOrdersController {
  constructor(private readonly storeOrders: TransfersService) {}

  @Post()
  @Roles('ADMIN', 'MANAGER')
  create(@Body() body: CreateStoreOrderDto, @Req() req: { user: JwtPayload }) {
    return this.storeOrders.create(body, req.user.sub);
  }

  @Get()
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  list(@Query('status') status?: string) {
    return this.storeOrders.list(status);
  }

  @Get(':id')
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.storeOrders.get(id);
  }

  @Post(':id/send')
  @Roles('ADMIN', 'MANAGER')
  send(@Param('id', ParseUUIDPipe) id: string, @Req() req: { user: JwtPayload }) {
    return this.storeOrders.send(id, req.user.sub);
  }

  @Post(':id/receive')
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  receive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReceiveStoreOrderDto,
    @Req() req: { user: JwtPayload },
  ) {
    return this.storeOrders.receive(id, body, req.user.sub, req.user.role);
  }

  @Post(':id/close')
  @Roles('ADMIN', 'MANAGER')
  close(@Param('id', ParseUUIDPipe) id: string) {
    return this.storeOrders.close(id);
  }
}
