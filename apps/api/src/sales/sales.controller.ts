import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';

import type { JwtPayload } from '../auth/jwt-payload.js';
import { Roles } from '../auth/roles.decorator.js';
import type { SaleRole } from './sales.domain.js';
import { CreateSaleDto, ListSalesQueryDto, ReserveTicketBlockDto } from './sales.dto.js';
import { SalesService } from './sales.service.js';

@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Post()
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  create(@Body() body: CreateSaleDto, @Req() req: { user: JwtPayload }) {
    return this.sales.create(body, req.user.sub, req.user.role as SaleRole);
  }

  // Reserva un bloque de números de ticket para que el TPV venda offline
  // (offline slice 2). Path fijo 'ticket-block': no colisiona con ':id/void'.
  @Post('ticket-block')
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  reserveTicketBlock(@Body() body: ReserveTicketBlockDto, @Req() req: { user: JwtPayload }) {
    return this.sales.reserveTicketBlock(
      body.storeId,
      body.size,
      req.user.sub,
      req.user.role as SaleRole,
    );
  }

  // Historial de ventas paginado con totales (#14). Visibilidad de central:
  // ADMIN/MANAGER (no CLERK), coherente con /stores. El @Get() sin path es la
  // raíz del recurso, así que no colisiona con @Get(':id/ticket').
  @Get()
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  findSales(@Query() query: ListSalesQueryDto, @Req() req: { user: JwtPayload }) {
    return this.sales.findSales(query, req.user.sub, req.user.role as SaleRole);
  }

  // Busca una venta por su nº de ticket (flujo de devolución del TPV). Path
  // fijo distinto de ':id/...' → no colisiona con las rutas por id.
  @Get('by-ticket/:ticketNumber')
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  findByTicket(@Param('ticketNumber') ticketNumber: string) {
    return this.sales.findByTicket(ticketNumber);
  }

  // Ticket-resumen para impresión (datos formateados + IVA desglosado).
  @Get(':id/ticket')
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  getTicket(@Param('id', ParseUUIDPipe) id: string) {
    return this.sales.getTicket(id);
  }

  // Documento fiscal imprimible/descargable de la venta (#123): factura
  // simplificada en HTML autocontenido. text/html para que el TPV pueda abrirlo
  // en un iframe e imprimirlo, o descargarlo como .html, sin tocar el CSS del TPV.
  // CSP scoped a esta ruta HTML: permite SOLO los estilos embebidos (no scripts,
  // no recursos externos, no framing) — sobrescribe la CSP global default-src
  // 'none' que rompería el <style> si el documento se abre directamente. nosniff
  // evita que el navegador reinterprete el tipo MIME.
  @Get(':id/receipt')
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
  )
  @Header('X-Content-Type-Options', 'nosniff')
  getReceipt(@Param('id', ParseUUIDPipe) id: string): Promise<string> {
    return this.sales.getReceiptHtml(id);
  }

  // Anulación de venta: solo MANAGER/ADMIN (un CLERK recibe 403 por el RolesGuard
  // global). 200 porque es una mutación sobre un recurso existente, no creación.
  @Post(':id/void')
  @Roles('ADMIN', 'MANAGER')
  @HttpCode(200)
  voidSale(@Param('id', ParseUUIDPipe) id: string, @Req() req: { user: JwtPayload }) {
    return this.sales.voidSale(id, req.user.sub);
  }
}
