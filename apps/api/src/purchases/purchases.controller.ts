import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';

import type { JwtPayload } from '../auth/jwt-payload.js';
import { Roles } from '../auth/roles.decorator.js';
import { CreatePurchaseOrderDto } from './purchases.dto.js';
import { PurchasesService } from './purchases.service.js';

// Pedidos a proveedor (#44). Crear/confirmar = ADMIN/MANAGER; lectura cualquier
// rol. Aislado por tenant (RLS). Recepción y propuesta en issues posteriores.
@Controller('purchase-orders')
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  @Post()
  @Roles('ADMIN', 'MANAGER')
  create(@Body() body: CreatePurchaseOrderDto, @Req() req: { user: JwtPayload }) {
    return this.purchases.create(body, req.user.sub);
  }

  @Get()
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  list(@Query('status') status?: string) {
    return this.purchases.list(status);
  }

  @Get(':id')
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.purchases.get(id);
  }

  @Post(':id/confirm')
  @Roles('ADMIN', 'MANAGER')
  confirm(@Param('id', ParseUUIDPipe) id: string) {
    return this.purchases.confirm(id);
  }
}
