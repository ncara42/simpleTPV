import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';

import type { JwtPayload } from '../auth/jwt-payload.js';
import { Roles } from '../auth/roles.decorator.js';
import { AdjustStockDto, ConfirmInventoryCountDto, SetMinStockDto } from './stock.dto.js';
import { StockService } from './stock.service.js';

// Consultas de stock (#28) y alertas/mínimos (#29). AuthGuard global exige
// sesión; las lecturas las puede consultar cualquier operario (ADMIN/MANAGER/
// CLERK — el TPV necesita ver stock). Configurar mínimos es ADMIN/MANAGER.
// Todo aislado por tenant (RLS + organizationId).
@Controller('stock')
export class StockController {
  constructor(private readonly stock: StockService) {}

  // Stock de todos los productos de una tienda. storeId obligatorio (UUID).
  @Get()
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  byStore(
    @Query('storeId', new ParseUUIDPipe()) storeId: string,
    @Req() req: { user: JwtPayload },
  ) {
    return this.stock.byStore(storeId, req.user.sub, req.user.role);
  }

  // Stock global agregado por producto (todas las tiendas + total). Para el
  // backoffice. Debe declararse ANTES de :rutas con parámetro para no colisionar.
  @Get('global')
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  global() {
    return this.stock.global();
  }

  // Alertas de stock. Por defecto solo activas (resolved=false); ?resolved=true
  // lista las resueltas. Filtro opcional por tienda. Ordenadas por urgencia.
  @Get('alerts')
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  alerts(@Query('storeId') storeId?: string, @Query('resolved') resolved?: string) {
    return this.stock.alerts({
      ...(storeId ? { storeId } : {}),
      resolved: resolved === 'true',
    });
  }

  // Configurar el stock mínimo de un producto en una tienda. Reevalúa la alerta.
  @Put('min')
  @Roles('ADMIN', 'MANAGER')
  setMin(@Body() body: SetMinStockDto) {
    return this.stock.setMin(body.productId, body.storeId, body.minStock);
  }

  // Ajuste manual de inventario: fija el stock a newQuantity con motivo (#30).
  // Solo ADMIN/MANAGER (CLERK → 403 vía RolesGuard). El AuditInterceptor global
  // registra el POST; el movimiento ADJUSTMENT con su reason es la trazabilidad.
  @Post('adjust')
  @Roles('ADMIN', 'MANAGER')
  adjust(@Body() body: AdjustStockDto, @Req() req: { user: JwtPayload }) {
    return this.stock.adjust({
      productId: body.productId,
      storeId: body.storeId,
      newQuantity: body.newQuantity,
      reason: body.reason,
      userId: req.user.sub,
    });
  }

  @Post('inventory-count')
  @Roles('ADMIN', 'MANAGER')
  confirmInventoryCount(@Body() body: ConfirmInventoryCountDto, @Req() req: { user: JwtPayload }) {
    return this.stock.confirmInventoryCount(body, req.user.sub);
  }

  // Historial de movimientos de stock (#32), filtrable y paginado. Trazabilidad.
  @Get('movements')
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  movements(
    @Query('productId') productId?: string,
    @Query('storeId') storeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.stock.movements({
      ...(productId ? { productId } : {}),
      ...(storeId ? { storeId } : {}),
      ...(from ? { from: new Date(from) } : {}),
      ...(to ? { to: new Date(to) } : {}),
      ...(page ? { page: Number(page) } : {}),
      ...(pageSize ? { pageSize: Number(pageSize) } : {}),
    });
  }

  // Productos "para pedir" de una tienda (bajo/sin stock) — atajo para reposición (#45).
  @Get('to-reorder')
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  toReorder(
    @Query('storeId', new ParseUUIDPipe()) storeId: string,
    @Req() req: { user: JwtPayload },
  ) {
    return this.stock.toReorder(storeId, req.user.sub, req.user.role);
  }

  // Stock de un producto en todas las tiendas del tenant.
  @Get('product/:productId')
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  byProduct(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.stock.byProduct(productId);
  }
}
