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
import {
  CloseCashSessionDto,
  CreateCashMovementDto,
  OpenCashSessionDto,
} from './cash-sessions.dto.js';
import { CashSessionsService } from './cash-sessions.service.js';

@Controller('cash-sessions')
export class CashSessionsController {
  constructor(private readonly cashSessions: CashSessionsService) {}

  // Apertura de caja: cualquier rol operativo puede abrir su turno.
  @Post('open')
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  open(@Body() body: OpenCashSessionDto, @Req() req: { user: JwtPayload }) {
    return this.cashSessions.open(body, req.user.sub);
  }

  // Cierre de caja con cuadre. 200 porque es una mutación sobre un recurso
  // existente, no una creación.
  @Post(':id/close')
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  @HttpCode(200)
  close(@Param('id', ParseUUIDPipe) id: string, @Body() body: CloseCashSessionDto) {
    return this.cashSessions.close(id, body);
  }

  @Get(':id/movements')
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  movements(@Param('id', ParseUUIDPipe) id: string) {
    return this.cashSessions.movements(id);
  }

  @Post(':id/movements')
  @Roles('ADMIN', 'MANAGER')
  createMovement(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateCashMovementDto,
    @Req() req: { user: JwtPayload },
  ) {
    return this.cashSessions.createMovement(id, body, req.user.sub);
  }

  // Estado de la caja de una tienda: devuelve la sesión OPEN o null.
  @Get('current')
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  current(@Query('storeId', ParseUUIDPipe) storeId: string) {
    return this.cashSessions.current(storeId);
  }
}
