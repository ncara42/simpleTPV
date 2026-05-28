import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';

import { Roles } from '../auth/roles.decorator.js';
import { StockService } from './stock.service.js';

// Consultas de stock (#28). AuthGuard global exige sesión; todas las rutas son de
// lectura y las puede consultar cualquier operario (ADMIN/MANAGER/CLERK — el TPV
// necesita ver stock al vender). Aisladas por tenant (RLS + organizationId).
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

  // Stock de un producto en todas las tiendas del tenant.
  @Get('product/:productId')
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  byProduct(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.stock.byProduct(productId);
  }
}
