import { Body, Controller, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import type { Store } from '@simpletpv/db';

import { Roles } from '../auth/roles.decorator.js';
import { UpdateStoreOpsDto } from './store-ops.dto.js';
import { StoresService } from './stores.service.js';

// Estado operativo de tienda (I-09). Controller aparte de StoresController (que es
// @Roles('ADMIN') a nivel de clase) para abrir la ruta a MANAGER, igual que
// StorePricesController; ':storeId/ops' (2 segmentos) no colisiona con ':id'.
@Controller('stores')
export class StoreOpsController {
  constructor(private readonly stores: StoresService) {}

  @Patch(':storeId/ops')
  @Roles('ADMIN', 'MANAGER')
  updateOps(
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Body() body: UpdateStoreOpsDto,
  ): Promise<Store> {
    return this.stores.updateOps(storeId, body);
  }
}
