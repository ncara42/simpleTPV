import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';

import type { JwtPayload } from '../auth/jwt-payload.js';
import { Roles } from '../auth/roles.decorator.js';
import { CreateTransferDto, ReceiveTransferDto } from './transfers.dto.js';
import { TransfersService } from './transfers.service.js';

// Traspasos central→tienda (#31). AuthGuard global exige sesión. Crear/enviar
// desde la central = ADMIN/MANAGER; recibir en tienda lo puede hacer cualquier
// responsable presente (ADMIN/MANAGER/CLERK). Aislado por tenant (RLS).
@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Post()
  @Roles('ADMIN', 'MANAGER')
  create(@Body() body: CreateTransferDto, @Req() req: { user: JwtPayload }) {
    return this.transfers.create(body, req.user.sub);
  }

  @Get()
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  list(@Query('status') status?: string) {
    return this.transfers.list(status);
  }

  @Get(':id')
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.transfers.get(id);
  }

  @Post(':id/send')
  @Roles('ADMIN', 'MANAGER')
  send(@Param('id', ParseUUIDPipe) id: string, @Req() req: { user: JwtPayload }) {
    return this.transfers.send(id, req.user.sub);
  }

  // Recibir en tienda: lo puede hacer el responsable presente, incluido CLERK.
  @Post(':id/receive')
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  receive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReceiveTransferDto,
    @Req() req: { user: JwtPayload },
  ) {
    return this.transfers.receive(id, body, req.user.sub, req.user.role);
  }

  @Post(':id/close')
  @Roles('ADMIN', 'MANAGER')
  close(@Param('id', ParseUUIDPipe) id: string) {
    return this.transfers.close(id);
  }
}
