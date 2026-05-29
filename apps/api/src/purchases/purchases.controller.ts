import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';

import type { JwtPayload } from '../auth/jwt-payload.js';
import { Roles } from '../auth/roles.decorator.js';
import {
  CreatePurchaseOrderDto,
  ReceivePurchaseOrderDto,
  SuggestPurchaseOrderDto,
} from './purchases.dto.js';
import { PurchasesService } from './purchases.service.js';

// Pedidos a proveedor. Crear/confirmar = ADMIN/MANAGER; lectura cualquier rol.
// Aislado por tenant (RLS).
@Controller('purchase-orders')
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  @Post()
  @Roles('ADMIN', 'MANAGER')
  create(@Body() body: CreatePurchaseOrderDto, @Req() req: { user: JwtPayload }) {
    return this.purchases.create(body, req.user.sub);
  }

  // Propuesta de pedido (#45). POST porque recibe parámetros en el body.
  @Post('suggest')
  @Roles('ADMIN', 'MANAGER')
  suggest(@Body() body: SuggestPurchaseOrderDto) {
    return this.purchases.suggest(body);
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

  // Exportación del pedido a CSV (#48). format=csv (por ahora el único formato).
  @Get(':id/export')
  @Roles('ADMIN', 'MANAGER')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  exportCsv(@Param('id', ParseUUIDPipe) id: string): Promise<string> {
    return this.purchases.exportCsv(id);
  }

  @Post(':id/confirm')
  @Roles('ADMIN', 'MANAGER')
  confirm(@Param('id', ParseUUIDPipe) id: string) {
    return this.purchases.confirm(id);
  }

  // Recepción de pedido (parcial o completa) (#46). Incrementa el stock destino.
  @Post(':id/receive')
  @Roles('ADMIN', 'MANAGER')
  receive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReceivePurchaseOrderDto,
    @Req() req: { user: JwtPayload },
  ) {
    return this.purchases.receive(id, body, req.user.sub);
  }
}
