import { Body, Controller, Param, ParseUUIDPipe, Patch, Req } from '@nestjs/common';
import type { Store } from '@simpletpv/db';

import type { JwtPayload } from '../auth/jwt-payload.js';
import { Roles } from '../auth/roles.decorator.js';
import { UpdateStoreOpsDto } from './store-ops.dto.js';
import { StoresService } from './stores.service.js';

// Estado operativo de tienda (I-09). Controller aparte de StoresController (que es
// @Roles('ADMIN') a nivel de clase) para abrir la ruta a MANAGER, igual que
// StorePricesController; ':storeId/ops' (2 segmentos) no colisiona con ':id'.
// assertStoreAccess en el servicio acota a un MANAGER a sus tiendas (SEC-01).
@Controller('stores')
export class StoreOpsController {
  constructor(private readonly stores: StoresService) {}

  @Patch(':storeId/ops')
  @Roles('ADMIN', 'MANAGER')
  updateOps(
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Body() body: UpdateStoreOpsDto,
    @Req() req: { user: JwtPayload },
  ): Promise<Store> {
    return this.stores.updateOps(storeId, body, { userId: req.user.sub, role: req.user.role });
  }
}
