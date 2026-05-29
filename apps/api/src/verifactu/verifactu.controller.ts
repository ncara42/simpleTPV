import { Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';

import { Roles } from '../auth/roles.decorator.js';
import { VerifactuService } from './verifactu.service.js';

// Estado y reintentos de VeriFactu (#47). Solo ADMIN/MANAGER (administración).
@Controller('verifactu')
export class VerifactuController {
  constructor(private readonly verifactu: VerifactuService) {}

  // Registros del tenant, filtrables por estado (PENDING/SENT/FAILED).
  @Get('records')
  @Roles('ADMIN', 'MANAGER')
  list(@Query('status') status?: string) {
    return this.verifactu.list(status);
  }

  // Reintentar el envío de un registro fallido.
  @Post('records/:id/retry')
  @Roles('ADMIN', 'MANAGER')
  async retry(@Param('id', ParseUUIDPipe) id: string): Promise<{ ok: true }> {
    await this.verifactu.retry(id);
    return { ok: true };
  }
}
