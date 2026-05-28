import { Body, Controller, Get, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';

import type { JwtPayload } from '../auth/jwt-payload.js';
import { Roles } from '../auth/roles.decorator.js';
import { CreateReturnDto } from './returns.dto.js';
import { ReturnsService } from './returns.service.js';

@Controller('returns')
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  // Crear devolución parcial contra un ticket. Cualquier operario del TPV puede
  // hacerlo (ADMIN/MANAGER/CLERK). 201 por defecto (creación de recurso).
  @Post()
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  create(@Body() body: CreateReturnDto, @Req() req: { user: JwtPayload }) {
    return this.returns.create(body, req.user.sub);
  }

  // Devoluciones de una venta (para mostrar lo ya devuelto). El saleId se valida
  // como UUID con ParseUUIDPipe sobre el query param.
  @Get()
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  list(@Query('saleId', new ParseUUIDPipe()) saleId: string) {
    return this.returns.list(saleId);
  }
}
