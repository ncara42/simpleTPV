import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';

import type { JwtPayload } from '../auth/jwt-payload.js';
import { Roles } from '../auth/roles.decorator.js';
import { CreateSaleDto } from './sales.dto.js';
import { type SaleRole, SalesService } from './sales.service.js';

@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Post()
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  create(@Body() body: CreateSaleDto, @Req() req: { user: JwtPayload }) {
    return this.sales.create(body, req.user.sub, req.user.role as SaleRole);
  }

  // Ticket-resumen para impresión (datos formateados + IVA desglosado).
  @Get(':id/ticket')
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  getTicket(@Param('id', ParseUUIDPipe) id: string) {
    return this.sales.getTicket(id);
  }
}
