import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';

import { Roles } from '../auth/roles.decorator.js';
import {
  CreateWholesaleOrderDto,
  ListWholesaleOrdersQueryDto,
  UpdateWholesaleOrderStatusDto,
} from './b2b.dto.js';
import { WholesaleOrdersService } from './wholesale-orders.service.js';

// Pedidos mayoristas salientes (IT-17). Función de central → ADMIN/MANAGER.
@Controller('wholesale-orders')
export class WholesaleOrdersController {
  constructor(private readonly orders: WholesaleOrdersService) {}

  @Get()
  @Roles('ADMIN', 'MANAGER')
  list(@Query() query: ListWholesaleOrdersQueryDto) {
    return this.orders.list(query);
  }

  @Get(':id')
  @Roles('ADMIN', 'MANAGER')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.get(id);
  }

  @Post()
  @Roles('ADMIN', 'MANAGER')
  create(@Body() body: CreateWholesaleOrderDto) {
    return this.orders.create(body);
  }

  @Patch(':id/status')
  @Roles('ADMIN', 'MANAGER')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateWholesaleOrderStatusDto,
  ) {
    return this.orders.updateStatus(id, body.status);
  }
}
