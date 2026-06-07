import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';

import type { JwtPayload } from '../auth/jwt-payload.js';
import { Roles } from '../auth/roles.decorator.js';
import type { SaleRole } from './sales.domain.js';
import { ListSalesQueryDto } from './sales.dto.js';
import { SalesExportService } from './sales-export.service.js';

// Export asíncrono del historial de ventas (IT-05). Acción de central → ADMIN/MANAGER.
// Rutas bajo /sales/export/* (literal 'export', no colisiona con :id de SalesController).
@Controller('sales')
export class SalesExportController {
  constructor(private readonly exports: SalesExportService) {}

  // Pide un export con los filtros del listado en el body. 202: encolado, la UI no
  // espera; luego consulta el estado y descarga.
  @Post('export')
  @Roles('ADMIN', 'MANAGER')
  @HttpCode(202)
  requestExport(@Body() body: ListSalesQueryDto, @Req() req: { user: JwtPayload }) {
    return this.exports.requestExport(body, req.user.sub, req.user.role as SaleRole);
  }

  // Export CONTABLE a gestoría (#125): libro de IVA repercutido. Mismo pipeline y
  // filtros que el export de ventas, con format 'accounting'.
  @Post('export/accounting')
  @Roles('ADMIN', 'MANAGER')
  @HttpCode(202)
  requestAccountingExport(@Body() body: ListSalesQueryDto, @Req() req: { user: JwtPayload }) {
    return this.exports.requestExport(body, req.user.sub, req.user.role as SaleRole, 'accounting');
  }

  // Estado del export (PENDING/PROCESSING/COMPLETED/FAILED) + metadatos.
  @Get('export/:id')
  @Roles('ADMIN', 'MANAGER')
  getExport(@Param('id', ParseUUIDPipe) id: string) {
    return this.exports.getExport(id);
  }

  // Descarga del CSV (cuando COMPLETED). 409 si aún no está listo. El nombre de
  // fichero depende del formato (ventas.csv / libro-iva.csv), así que se fija
  // dinámicamente sobre la respuesta (passthrough) en vez de con @Header estático.
  @Get('export/:id/download')
  @Roles('ADMIN', 'MANAGER')
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: { setHeader(name: string, value: string): void },
  ): Promise<string> {
    const { csv, filename } = await this.exports.downloadCsv(id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return csv;
  }
}
