import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';

import type { JwtPayload } from '../auth/jwt-payload.js';
import { Roles } from '../auth/roles.decorator.js';
import { CreateSaleDto, ListSalesQueryDto } from './sales.dto.js';
import { type SaleRole, SalesService } from './sales.service.js';

@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Post()
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  create(@Body() body: CreateSaleDto, @Req() req: { user: JwtPayload }) {
    return this.sales.create(body, req.user.sub, req.user.role as SaleRole);
  }

  // Historial de ventas paginado con totales (#14). Visibilidad de central:
  // ADMIN/MANAGER (no CLERK), coherente con /stores. El @Get() sin path es la
  // raíz del recurso, así que no colisiona con @Get(':id/ticket').
  @Get()
  @Roles('ADMIN', 'MANAGER')
  findSales(@Query() query: ListSalesQueryDto) {
    return this.sales.findSales(query);
  }

  // Ticket-resumen para impresión (datos formateados + IVA desglosado).
  @Get(':id/ticket')
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  getTicket(@Param('id', ParseUUIDPipe) id: string) {
    return this.sales.getTicket(id);
  }

  // Anulación de venta: solo MANAGER/ADMIN (un CLERK recibe 403 por el RolesGuard
  // global). 200 porque es una mutación sobre un recurso existente, no creación.
  @Post(':id/void')
  @Roles('ADMIN', 'MANAGER')
  @HttpCode(200)
  voidSale(@Param('id', ParseUUIDPipe) id: string, @Req() req: { user: JwtPayload }) {
    return this.sales.voidSale(id, req.user.sub);
  }
}
