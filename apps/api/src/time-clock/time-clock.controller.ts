import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';

import type { JwtPayload } from '../auth/jwt-payload.js';
import { Roles } from '../auth/roles.decorator.js';
import {
  CreateTimeClockEntryDto,
  TimeClockHistoryAllQueryDto,
  TimeClockHistoryMeQueryDto,
  TimeClockHistoryQueryDto,
} from './time-clock.dto.js';
import { TimeClockService } from './time-clock.service.js';

@Controller('time-clock')
export class TimeClockController {
  constructor(private readonly timeClock: TimeClockService) {}

  @Get('current')
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  current(@Query('storeId') storeId: string, @Req() req: { user: JwtPayload }) {
    return this.timeClock.current(storeId, req.user.sub);
  }

  @Get('today')
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  today(@Query('storeId') storeId: string, @Req() req: { user: JwtPayload }) {
    return this.timeClock.today(storeId, req.user.sub);
  }

  @Get('history')
  @Roles('ADMIN', 'MANAGER')
  history(@Query() query: TimeClockHistoryQueryDto, @Req() req: { user: JwtPayload }) {
    return this.timeClock.history(query, req.user.role, req.user.sub);
  }

  // Histórico cross-tienda agregado por jornada (alimenta la vista Control horario del
  // backoffice). Org-wide (ADMIN/MANAGER); no requiere storeId. Filtros opcionales.
  @Get('history-all')
  @Roles('ADMIN', 'MANAGER')
  historyAll(@Query() query: TimeClockHistoryAllQueryDto) {
    return this.timeClock.historyAll(query);
  }

  // Log en bruto de fichajes de una tienda (alimenta el detalle de tienda del backoffice).
  @Get('entries')
  @Roles('ADMIN', 'MANAGER')
  entries(@Query() query: TimeClockHistoryQueryDto, @Req() req: { user: JwtPayload }) {
    return this.timeClock.entries(query, req.user.role, req.user.sub);
  }

  // Histórico del propio empleado (lo consume el TPV). El `userId` se fuerza al del
  // token, nunca llega del cliente, así un CLERK solo ve sus jornadas. Ventana por
  // defecto de 30 días (el default de 7 del backoffice vive en el service intacto).
  @Get('history/me')
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  historyMe(@Query() query: TimeClockHistoryMeQueryDto, @Req() req: { user: JwtPayload }) {
    const from =
      query.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return this.timeClock.history(
      { storeId: query.storeId, userId: req.user.sub, from, ...(query.to ? { to: query.to } : {}) },
      req.user.role,
      req.user.sub,
    );
  }

  @Post()
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  create(@Body() body: CreateTimeClockEntryDto, @Req() req: { user: JwtPayload }) {
    return this.timeClock.create(body, req.user.sub, req.user.role);
  }
}
