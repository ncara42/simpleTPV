import { Body, Controller, Get, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';

import type { JwtPayload } from '../auth/jwt-payload.js';
import { Roles } from '../auth/roles.decorator.js';
import { CreateBlindReturnDto, CreateReturnDto } from './returns.dto.js';
import { ReturnsService } from './returns.service.js';

@Controller('returns')
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  // Crear devolución parcial contra un ticket. Cualquier operario del TPV puede
  // hacerlo (ADMIN/MANAGER/CLERK). 201 por defecto (creación de recurso).
  @Post()
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  create(@Body() body: CreateReturnDto, @Req() req: { user: JwtPayload }) {
    return this.returns.create(body, req.user.sub, req.user.role);
  }

  // Devolución SIN ticket (#59): el operario (incluido CLERK) la inicia, pero
  // requiere el PIN de un MANAGER/ADMIN para autorizarla (validado en el servicio).
  @Post('blind')
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  createBlind(@Body() body: CreateBlindReturnDto, @Req() req: { user: JwtPayload }) {
    return this.returns.createBlind(body, req.user.sub, req.user.role);
  }

  // Devoluciones de una venta (para mostrar lo ya devuelto). El saleId se valida
  // como UUID con ParseUUIDPipe sobre el query param.
  @Get()
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  list(@Query('saleId', new ParseUUIDPipe()) saleId: string) {
    return this.returns.list(saleId);
  }
}
