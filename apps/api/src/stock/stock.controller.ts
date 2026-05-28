import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';

import { Roles } from '../auth/roles.decorator.js';
import { SetMinStockDto } from './stock.dto.js';
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
  byStore(@Query('storeId', new ParseUUIDPipe()) storeId: string) {
    return this.stock.byStore(storeId);
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

  // Stock de un producto en todas las tiendas del tenant.
  @Get('product/:productId')
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  byProduct(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.stock.byProduct(productId);
  }
}
