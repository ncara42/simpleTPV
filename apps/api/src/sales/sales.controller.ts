import { Body, Controller, Post, Req } from '@nestjs/common';

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
}
