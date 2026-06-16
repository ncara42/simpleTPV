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
  ListClosedCashSessionsDto,
  OpenCashSessionDto,
  RequestCashMovementDto,
} from './cash-sessions.dto.js';
import { CashSessionsService } from './cash-sessions.service.js';

@Controller('cash-sessions')
export class CashSessionsController {
  constructor(private readonly cashSessions: CashSessionsService) {}

  // Apertura de caja: cualquier rol operativo puede abrir su turno.
  @Post('open')
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  open(@Body() body: OpenCashSessionDto, @Req() req: { user: JwtPayload }) {
    return this.cashSessions.open(body, req.user.sub, req.user.role);
  }

  // Cierre de caja con cuadre. 200 porque es una mutación sobre un recurso
  // existente, no una creación.
  @Post(':id/close')
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  @HttpCode(200)
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CloseCashSessionDto,
    @Req() req: { user: JwtPayload },
  ) {
    return this.cashSessions.close(id, body, req.user.sub, req.user.role);
  }

  @Get(':id/movements')
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  movements(@Param('id', ParseUUIDPipe) id: string, @Req() req: { user: JwtPayload }) {
    return this.cashSessions.movements(id, req.user.sub, req.user.role);
  }

  @Post(':id/movements')
  @Roles('ADMIN', 'MANAGER')
  createMovement(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateCashMovementDto,
    @Req() req: { user: JwtPayload },
  ) {
    return this.cashSessions.createMovement(id, body, req.user.sub, req.user.role);
  }

  // Solicitud de movimiento desde el TPV (#146): cualquier rol operativo, incluido
  // el CLERK. Nace PENDING a la espera de aprobación.
  @Post(':id/movements/request')
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  requestMovement(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RequestCashMovementDto,
    @Req() req: { user: JwtPayload },
  ) {
    return this.cashSessions.requestMovement(id, body, req.user.sub, req.user.role);
  }

  // Solicitudes pendientes de la organización (fuente de la campana, #146). Ruta
  // estática previa a `:id/...`; los segmentos no colisionan con `:id/movements`.
  @Get('movements/pending')
  @Roles('ADMIN', 'MANAGER')
  pendingMovements() {
    return this.cashSessions.listPendingMovements();
  }

  // Aprobación / denegación de una solicitud (#146). Solo ADMIN/MANAGER.
  @Post('movements/:movId/approve')
  @Roles('ADMIN', 'MANAGER')
  @HttpCode(200)
  approveMovement(@Param('movId', ParseUUIDPipe) movId: string, @Req() req: { user: JwtPayload }) {
    return this.cashSessions.approveMovement(movId, req.user.sub, req.user.role);
  }

  @Post('movements/:movId/deny')
  @Roles('ADMIN', 'MANAGER')
  @HttpCode(200)
  denyMovement(@Param('movId', ParseUUIDPipe) movId: string, @Req() req: { user: JwtPayload }) {
    return this.cashSessions.denyMovement(movId, req.user.sub, req.user.role);
  }

  // Registro de cierres de caja de una tienda (#145): sesiones CLOSED con su
  // cuadre, de la más reciente a la más antigua. Ruta estática previa a `:id/...`.
  @Get('closed')
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  listClosed(@Query() query: ListClosedCashSessionsDto, @Req() req: { user: JwtPayload }) {
    return this.cashSessions.listClosed(
      query.storeId,
      req.user.sub,
      req.user.role,
      query.limit ?? 30,
    );
  }

  // Estado de la caja de una tienda: devuelve la sesión OPEN o null.
  @Get('current')
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  current(@Query('storeId', ParseUUIDPipe) storeId: string, @Req() req: { user: JwtPayload }) {
    return this.cashSessions.current(storeId, req.user.sub, req.user.role);
  }
}
