import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
} from '@nestjs/common';

import type { JwtPayload } from '../auth/jwt-payload.js';
import { Roles } from '../auth/roles.decorator.js';
import { SetStorePriceDto } from './store-prices.dto.js';
import { StorePricesService } from './store-prices.service.js';

// Precios retail por tienda (#127 A): override del PVP por (producto, tienda). Función
// de central → ADMIN/MANAGER (CLERK no fija precios, igual que catálogo y tarifas B2B).
// assertStoreAccess en el servicio acota a un MANAGER a sus tiendas (SEC-01). Controller
// aparte de StoresController (que es @Roles('ADMIN') a nivel de clase) para abrir estas
// rutas a MANAGER; las rutas ':storeId/prices' (2 segmentos) no colisionan con las de
// StoresController (':id', 1 segmento).
@Controller('stores')
export class StorePricesController {
  constructor(private readonly prices: StorePricesService) {}

  @Get(':storeId/prices')
  @Roles('ADMIN', 'MANAGER')
  list(@Param('storeId', ParseUUIDPipe) storeId: string, @Req() req: { user: JwtPayload }) {
    return this.prices.list(storeId, { userId: req.user.sub, role: req.user.role });
  }

  @Put(':storeId/prices')
  @Roles('ADMIN', 'MANAGER')
  setPrice(
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Body() body: SetStorePriceDto,
    @Req() req: { user: JwtPayload },
  ) {
    return this.prices.setPrice(storeId, body, { userId: req.user.sub, role: req.user.role });
  }

  @Delete(':storeId/prices/:productId')
  @Roles('ADMIN', 'MANAGER')
  @HttpCode(204)
  removePrice(
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Req() req: { user: JwtPayload },
  ) {
    return this.prices.removePrice(storeId, productId, {
      userId: req.user.sub,
      role: req.user.role,
    });
  }
}
